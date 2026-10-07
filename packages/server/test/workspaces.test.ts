import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS, openBetterSqlite3 } from "@canvas/core";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  ErrorResponseSchema,
  WorkspaceInputSchema,
  WorkspaceListResponseSchema,
  WorkspaceSchema,
  type WorkspaceInput,
} from "../src/api/index.js";
import {
  buildApp,
  DATABASE_FILE,
  RECORD_FILE,
  WORKSPACES_FOLDER,
  WorkspaceExistsError,
  workspaceIdFor,
  WorkspaceStore,
} from "../src/index.js";

const FIXTURE_WEB = fileURLToPath(new URL("fixtures/web/", import.meta.url));
const TOKEN = "test-launch-token";

// Absolute on whichever OS runs the test.
const ROOT = path.resolve("/srv/canvas-fixture");
const at = (...parts: string[]) => path.join(ROOT, ...parts);

let configDir: string;
let app: FastifyInstance | undefined;

beforeEach(async () => {
  configDir = await mkdtemp(path.join(tmpdir(), "canvas-config-"));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(configDir, { recursive: true, force: true });
});

async function send(request: InjectOptions) {
  app ??= await buildApp({ token: TOKEN, webRoot: FIXTURE_WEB, configDir });
  return app.inject({
    ...request,
    headers: {
      host: "127.0.0.1:4870",
      authorization: `Bearer ${TOKEN}`,
      ...request.headers,
    },
  });
}

const list = () => send({ method: "GET", url: "/api/workspaces" });
const create = (body: unknown) =>
  send({ method: "POST", url: "/api/workspaces", payload: body as object });

function input(overrides: Partial<WorkspaceInput> = {}): WorkspaceInput {
  return {
    name: "Test Realm",
    profileId: "azerothcore-335",
    mysql: {
      host: "127.0.0.1",
      user: "canvas_reader",
      databases: { world: "acore_world", characters: "acore_characters" },
    },
    source: { path: at("azerothcore"), ref: "master" },
    dbc: { path: at("dbc") },
    ...overrides,
  };
}

function errorOf(body: string) {
  return ErrorResponseSchema.parse(JSON.parse(body)).error;
}

const workspaceFolder = (id: string) =>
  path.join(configDir, WORKSPACES_FOLDER, id);

describe("GET /api/workspaces", () => {
  test("answers an empty list before any workspace exists", async () => {
    const res = await list();
    expect(res.statusCode).toBe(200);
    expect(WorkspaceListResponseSchema.parse(res.json())).toEqual({
      workspaces: [],
      unreadable: [],
    });
  });

  test("lists created workspaces sorted by name", async () => {
    for (const name of ["beta", "Alpha", "gamma"]) {
      expect((await create(input({ name }))).statusCode).toBe(201);
    }
    const body = WorkspaceListResponseSchema.parse((await list()).json());
    expect(body.workspaces.map((w) => w.name)).toEqual([
      "Alpha",
      "beta",
      "gamma",
    ]);
    expect(body.unreadable).toEqual([]);
  });

  test("reports a damaged workspace folder instead of hiding it", async () => {
    await create(input());
    const root = path.join(configDir, WORKSPACES_FOLDER);
    await mkdir(path.join(root, "no-record"));
    await mkdir(path.join(root, "bad-json"));
    await writeFile(path.join(root, "bad-json", RECORD_FILE), "{");
    await mkdir(path.join(root, "moved"));
    await writeFile(
      path.join(root, "moved", RECORD_FILE),
      await readFile(path.join(root, "test-realm", RECORD_FILE)),
    );
    await writeFile(path.join(root, "stray-file.txt"), "ignored");

    const body = WorkspaceListResponseSchema.parse((await list()).json());
    expect(body.workspaces.map((w) => w.id)).toEqual(["test-realm"]);
    expect(body.unreadable.map((u) => u.folder)).toEqual([
      "bad-json",
      "moved",
      "no-record",
    ]);
  });
});

describe("POST /api/workspaces", () => {
  test("creates the record and the SQLite file in the config folder", async () => {
    const res = await create(input({ name: "My Server (Live)" }));
    expect(res.statusCode).toBe(201);
    const workspace = WorkspaceSchema.parse(res.json());
    expect(workspace).toEqual({
      version: 1,
      id: "my-server-live",
      ...input({ name: "My Server (Live)" }),
      // Defaults filled in.
      mysql: { ...input().mysql, port: 3306 },
    });

    const folder = workspaceFolder("my-server-live");
    const stored: unknown = JSON.parse(
      await readFile(path.join(folder, RECORD_FILE), "utf8"),
    );
    expect(stored).toEqual(workspace);

    const storage = openBetterSqlite3(path.join(folder, DATABASE_FILE), {
      readonly: true,
    });
    try {
      const row = storage.prepare("PRAGMA user_version").get();
      expect(row?.["user_version"]).toBe(MIGRATIONS.length);
    } finally {
      storage.close();
    }
  });

  test("keeps SSH settings and fills the SSH port", async () => {
    const res = await create(
      input({
        mysql: {
          ...input().mysql,
          ssh: {
            host: "realm.example",
            user: "deploy",
            auth: { method: "key", privateKeyPath: at("keys", "id_ed25519") },
          },
        },
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(WorkspaceSchema.parse(res.json()).mysql.ssh).toEqual({
      host: "realm.example",
      port: 22,
      user: "deploy",
      auth: { method: "key", privateKeyPath: at("keys", "id_ed25519") },
    });
  });

  test("refuses a name that makes the same ID as an existing one", async () => {
    expect((await create(input({ name: "Test Realm" }))).statusCode).toBe(201);
    const res = await create(input({ name: "test   REALM!" }));
    expect(res.statusCode).toBe(409);
    expect(errorOf(res.body).code).toBe("bad_request");
    expect(errorOf(res.body).message).toContain('"test-realm"');
  });

  test.each([
    ["mysql", { password: "hunter2" }],
    ["mysql", { passwordKey: "canvas/other/mysql" }],
  ])("refuses a secret sent in the body (%s %j)", async (where, extra) => {
    const body = input();
    const res = await create({
      ...body,
      [where]: { ...body.mysql, ...extra },
    });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res.body).code).toBe("validation_failed");
    expect(existsSync(path.join(configDir, WORKSPACES_FOLDER))).toBe(false);
  });

  test("refuses an SSH password or passphrase in the body", async () => {
    const res = await create(
      input({
        mysql: {
          ...input().mysql,
          ssh: {
            host: "realm.example",
            user: "deploy",
            auth: { method: "password", password: "hunter2" } as never,
          },
        },
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(errorOf(res.body).code).toBe("validation_failed");
  });

  test("refuses two roles on one database", async () => {
    const res = await create(
      input({
        mysql: {
          ...input().mysql,
          databases: { world: "acore", characters: "acore" },
        },
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(errorOf(res.body).details)).toContain(
      "already the world database",
    );
  });

  test.each([
    ["an unknown profile", { profileId: "nope" }, "/profileId"],
    [
      "a relative source path",
      { source: { path: "src", ref: "x" } },
      "/source/path",
    ],
    ["a relative DBC path", { dbc: { path: "dbc" } }, "/dbc/path"],
    ["a relative Lua path", { lua: { path: "lua" } }, "/lua/path"],
    ["a name with no letter or digit", { name: "!!!" }, "/name"],
    ["a name Windows reserves", { name: "CON" }, "/name"],
  ] as const)("refuses %s", async (_label, overrides, field) => {
    const res = await create(input(overrides));
    expect(res.statusCode).toBe(400);
    const error = errorOf(res.body);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toEqual([
      expect.objectContaining({ in: "body", path: field }),
    ]);
    expect(existsSync(path.join(configDir, WORKSPACES_FOLDER))).toBe(false);
  });

  test("refuses a body missing the world database", async () => {
    const res = await create(
      input({
        mysql: { ...input().mysql, databases: {} as never },
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(errorOf(res.body).code).toBe("validation_failed");
  });
});

describe("WorkspaceStore", () => {
  const parsed = () => WorkspaceInputSchema.parse(input());

  test("two creates racing for one name: one wins, one is refused", async () => {
    const store = new WorkspaceStore(configDir);
    const results = await Promise.allSettled([
      store.create(parsed()),
      store.create(parsed()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(WorkspaceExistsError);
  });

  test("a failed create leaves no folder behind", async () => {
    const store = new WorkspaceStore(configDir, {
      openStorage: () => {
        throw new Error("disk full");
      },
    });
    await expect(store.create(parsed())).rejects.toThrow("disk full");
    expect(readdirSync(path.join(configDir, WORKSPACES_FOLDER))).toEqual([]);
  });
});

describe("workspaceIdFor", () => {
  test.each([
    ["My Server (Live)", "my-server-live"],
    ["Ébène Realm", "ebene-realm"],
    ["  --a__b--  ", "a-b"],
    ["!!!", undefined],
    ["x".repeat(80), "x".repeat(48)],
  ])("%j -> %j", (name, id) => {
    expect(workspaceIdFor(name)).toBe(id);
  });
});
