import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFormat } from "@canvas/core";
import { azerothcore335 } from "@canvas/profiles";
import type { FastifyInstance } from "fastify";
import { createConnection } from "mysql2/promise";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import {
  ConnectionTestResponseSchema,
  ErrorResponseSchema,
  type ConnectionTestResponse,
} from "../src/api/index.js";
import {
  DeadlineError,
  testMysql,
  withinDeadline,
} from "../src/connection-tests.js";
import { buildApp } from "../src/index.js";

const FIXTURE_WEB = fileURLToPath(new URL("fixtures/web/", import.meta.url));
const TOKEN = "test-launch-token";

let dir: string;
let app: FastifyInstance | undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "canvas-conntest-"));
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

async function post(check: string, body: unknown) {
  app ??= await buildApp({
    token: TOKEN,
    webRoot: FIXTURE_WEB,
    configDir: path.join(dir, "config"),
  });
  return app.inject({
    method: "POST",
    url: `/api/connection-tests/${check}`,
    headers: {
      host: "127.0.0.1:4870",
      authorization: `Bearer ${TOKEN}`,
    },
    payload: body as object,
  });
}

/** Posts a test and returns its parsed result; the request must be valid. */
async function run(
  check: string,
  body: unknown,
): Promise<ConnectionTestResponse> {
  const res = await post(check, body);
  expect(res.statusCode).toBe(200);
  return ConnectionTestResponseSchema.parse(res.json());
}

const statuses = (r: ConnectionTestResponse) =>
  r.checks.map((c) => `${c.check}:${c.status}`);

// ---------------------------------------------------------------- MySQL

const PASSWORD = "not-the-real-pass-7Qx";

describe("POST /api/connection-tests/mysql, without a server", () => {
  test("a port nothing listens on fails with a plain message", async () => {
    const result = await run("mysql", {
      mysql: {
        host: "127.0.0.1",
        port: 1,
        user: "canvas",
        databases: { world: "acore_world" },
      },
      password: PASSWORD,
    });
    expect(result.status).toBe("failed");
    expect(result.checks).toEqual([
      {
        check: "connect",
        status: "failed",
        message:
          "Nothing answered at 127.0.0.1:1. Check that MySQL is running and the port is right.",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
  });

  test.each([
    ["a port that is not a number", { port: "not-a-port" }],
    ["an unknown field", { extra: true }],
    ["a missing world database", { databases: {} }],
  ])(
    "a refused request (%s) does not echo the password",
    async (_label, change) => {
      const res = await post("mysql", {
        mysql: {
          host: "127.0.0.1",
          user: "canvas",
          databases: { world: "acore_world" },
          ...change,
        },
        password: PASSWORD,
      });
      expect(res.statusCode).toBe(400);
      expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(
        "validation_failed",
      );
      expect(res.body).not.toContain(PASSWORD);
      expect(JSON.stringify(res.headers)).not.toContain(PASSWORD);
    },
  );

  test("a server that accepts but never answers times out", async () => {
    // A TCP server that takes the connection and stays silent, so the MySQL
    // greeting never comes.
    const sockets: Socket[] = [];
    const silent: Server = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) =>
      silent.listen(0, "127.0.0.1", resolve),
    );
    const { port } = silent.address() as { port: number };
    try {
      const result = await testMysql(
        {
          mysql: {
            host: "127.0.0.1",
            port,
            user: "canvas",
            databases: { world: "acore_world" },
          },
        },
        { connectMs: 300, queryMs: 300 },
      );
      expect(result.checks).toEqual([
        {
          check: "connect",
          status: "failed",
          message: `No answer from 127.0.0.1:${port} within 0.3 seconds. A firewall may be in the way.`,
        },
      ]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => silent.close(resolve));
    }
  });

  test("refuses SSH settings until the SSH case exists (OPS-5)", async () => {
    const res = await post("mysql", {
      mysql: {
        host: "127.0.0.1",
        user: "canvas",
        databases: { world: "acore_world" },
        ssh: { host: "h", user: "u", auth: { method: "agent" } },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.code).toBe(
      "validation_failed",
    );
  });
});

/**
 * Against a real MySQL server: CI's Linux job sets CANVAS_TEST_MYSQL_URL to
 * its MySQL 8 service; elsewhere these report as skipped. The test makes
 * its own two databases and two users, with names no other test uses.
 */
const mysqlUrl = process.env["CANVAS_TEST_MYSQL_URL"] || undefined;
const DB = "canvas_ops3_world";
const DB2 = "canvas_ops3_chars";
const RO = "canvas_ops3_ro";
const RW = "canvas_ops3_rw";

describe.skipIf(mysqlUrl === undefined)(
  "POST /api/connection-tests/mysql, against MySQL",
  () => {
    let host: string;
    let port: number;

    beforeAll(async () => {
      const url = new URL(mysqlUrl!);
      host = url.hostname;
      port = Number(url.port || 3306);
      const admin = await createConnection({
        uri: mysqlUrl!,
        multipleStatements: true,
      });
      try {
        await admin.query(`
          DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB};
          DROP DATABASE IF EXISTS ${DB2}; CREATE DATABASE ${DB2};
          DROP USER IF EXISTS '${RO}'@'%', '${RW}'@'%';
          CREATE USER '${RO}'@'%' IDENTIFIED BY '${PASSWORD}';
          CREATE USER '${RW}'@'%' IDENTIFIED BY '${PASSWORD}';
          GRANT SELECT ON ${DB}.* TO '${RO}'@'%';
          GRANT SELECT ON ${DB2}.* TO '${RO}'@'%';
          GRANT SELECT, INSERT ON ${DB}.* TO '${RW}'@'%';
        `);
      } finally {
        await admin.end();
      }
    });

    afterAll(async () => {
      const admin = await createConnection({
        uri: mysqlUrl!,
        multipleStatements: true,
      });
      try {
        await admin.query(`
          DROP USER IF EXISTS '${RO}'@'%', '${RW}'@'%';
          DROP DATABASE IF EXISTS ${DB}; DROP DATABASE IF EXISTS ${DB2};
        `);
      } finally {
        await admin.end();
      }
    });

    const request = (
      user: string,
      databases: Record<string, string>,
      password = PASSWORD,
    ) => ({ mysql: { host, port, user, databases }, password });

    test("a read-only user passes every check and the version is shown", async () => {
      const result = await run(
        "mysql",
        request(RO, { world: DB, characters: DB2 }),
      );
      expect(statuses(result)).toEqual([
        "connect:ok",
        "databases:ok",
        "read-only:ok",
      ]);
      expect(result.status).toBe("ok");
      expect(result.checks[0]!.message).toMatch(
        new RegExp(`^Connected to MySQL 8\\.[\\d.]+.* as ${RO}\\.$`),
      );
    });

    test("a user that can write is a warning naming the privilege", async () => {
      const result = await run("mysql", request(RW, { world: DB }));
      expect(statuses(result)).toEqual([
        "connect:ok",
        "databases:ok",
        "read-only:warning",
      ]);
      expect(result.status).toBe("warning");
      expect(result.checks[2]!.message).toContain(`INSERT on ${DB}`);
    });

    test("a wrong password fails without showing it", async () => {
      const result = await run(
        "mysql",
        request(RO, { world: DB }, "wrong-pass-9Kd"),
      );
      expect(result.checks).toEqual([
        {
          check: "connect",
          status: "failed",
          message: "MySQL refused the user name or password.",
        },
      ]);
      expect(JSON.stringify(result)).not.toContain("wrong-pass-9Kd");
      expect(JSON.stringify(result)).not.toContain(PASSWORD);
    });

    test("a database the user cannot see fails the databases check", async () => {
      const result = await run(
        "mysql",
        request(RW, { world: DB, characters: DB2 }),
      );
      expect(statuses(result)).toEqual(["connect:ok", "databases:failed"]);
      expect(result.checks[1]!.message).toBe(
        `"${DB2}" was not found, or ${RW} may not see it.`,
      );
    });
  },
);

// ---------------------------------------------------------------- source

/** Runs git in a folder, with a fixed identity and no global config. */
const git = (cwd: string, ...args: string[]): string =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Canvas Test",
      "-c",
      "user.email=test@canvas.invalid",
      ...args,
    ],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "", GIT_CONFIG_NOSYSTEM: "1" },
    },
  );

describe("POST /api/connection-tests/source", () => {
  async function clone(): Promise<string> {
    const repo = path.join(dir, "source");
    await mkdir(repo);
    git(repo, "init", "--quiet", "--initial-branch=main");
    await writeFile(path.join(repo, "a.txt"), "a\n");
    git(repo, "add", "-A");
    git(repo, "commit", "--quiet", "-m", "first");
    return repo;
  }

  test("a clone and a branch in it pass", async () => {
    const repo = await clone();
    const commit = git(repo, "rev-parse", "HEAD").trim();
    const result = await run("source", { source: { path: repo, ref: "main" } });
    expect(result.status).toBe("ok");
    expect(result.checks).toEqual([
      { check: "repository", status: "ok", message: `${repo} is a git clone.` },
      {
        check: "ref",
        status: "ok",
        message: `"main" is commit ${commit.slice(0, 12)}.`,
      },
    ]);
  });

  test("a ref that names nothing fails the ref check", async () => {
    const repo = await clone();
    const result = await run("source", {
      source: { path: repo, ref: "no-such-branch" },
    });
    expect(statuses(result)).toEqual(["repository:ok", "ref:failed"]);
    expect(result.checks[1]!.message).toContain('"no-such-branch" is not');
  });

  test("a folder that is not a clone fails", async () => {
    const result = await run("source", { source: { path: dir, ref: "main" } });
    expect(statuses(result)).toEqual(["repository:failed"]);
    expect(result.checks[0]!.message).toBe(
      `${dir} is not a git clone. Point this at the folder you cloned the server's source into.`,
    );
  });

  test("a missing folder fails before git runs", async () => {
    const missing = path.join(dir, "nowhere");
    const result = await run("source", {
      source: { path: missing, ref: "main" },
    });
    expect(statuses(result)).toEqual(["folder:failed"]);
  });

  test("a relative path is refused as a bad request", async () => {
    const res = await post("source", { source: { path: "src", ref: "main" } });
    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.details).toEqual([
      expect.objectContaining({ path: "/source/path" }),
    ]);
  });
});

// ---------------------------------------------------------------- DBC

const SPELL = azerothcore335.dbc.find((l) => l.file === "Spell.dbc")!;

/** A WDBC header with no records: magic, records, fields, record size, strings. */
function dbcHeader(
  fields = SPELL.format.length,
  recordSize = readFormat(SPELL.format).recordSize,
  magic = 0x43424457,
): Buffer {
  const header = Buffer.alloc(20);
  header.writeUInt32LE(magic, 0);
  header.writeUInt32LE(0, 4);
  header.writeUInt32LE(fields, 8);
  header.writeUInt32LE(recordSize, 12);
  header.writeUInt32LE(0, 16);
  return header;
}

describe("POST /api/connection-tests/dbc", () => {
  const request = (folder: string, profileId = "azerothcore-335") => ({
    profileId,
    dbc: { path: folder },
  });

  test("a Spell.dbc in the profile's layout passes", async () => {
    await writeFile(path.join(dir, "Spell.dbc"), dbcHeader());
    const result = await run("dbc", request(dir));
    expect(result.checks).toEqual([
      {
        check: "spell-dbc",
        status: "ok",
        message:
          "Spell.dbc found, with 0 spells, in the layout the azerothcore-335 profile expects.",
      },
    ]);
  });

  test("the file name's letter case does not matter", async () => {
    await writeFile(path.join(dir, "spell.DBC"), dbcHeader());
    expect((await run("dbc", request(dir))).status).toBe("ok");
  });

  test("no Spell.dbc fails", async () => {
    await writeFile(path.join(dir, "Item.dbc"), dbcHeader());
    const result = await run("dbc", request(dir));
    expect(statuses(result)).toEqual(["spell-dbc:failed"]);
    expect(result.checks[0]!.message).toContain("There is no Spell.dbc");
  });

  test("a file without the WDBC header fails", async () => {
    await writeFile(
      path.join(dir, "Spell.dbc"),
      dbcHeader(undefined, undefined, 0x12345678),
    );
    const result = await run("dbc", request(dir));
    expect(result.checks[0]!.message).toBe(
      "Spell.dbc is not a DBC file (it has no WDBC header).",
    );
  });

  test("a file shorter than the header fails", async () => {
    await writeFile(path.join(dir, "Spell.dbc"), Buffer.from("WDBC"));
    expect((await run("dbc", request(dir))).status).toBe("failed");
  });

  test("another client version's layout fails, naming both counts", async () => {
    await writeFile(path.join(dir, "Spell.dbc"), dbcHeader(220, 880));
    const result = await run("dbc", request(dir));
    expect(result.status).toBe("failed");
    expect(result.checks[0]!.message).toContain(
      `has 220 fields of 880 bytes per spell, but the azerothcore-335 profile expects ${SPELL.format.length} fields`,
    );
  });

  test("a missing folder fails", async () => {
    const result = await run("dbc", request(path.join(dir, "nowhere")));
    expect(statuses(result)).toEqual(["folder:failed"]);
  });

  test("an unknown profile is refused as a bad request", async () => {
    const res = await post("dbc", request(dir, "nope"));
    expect(res.statusCode).toBe(400);
    expect(ErrorResponseSchema.parse(res.json()).error.details).toEqual([
      expect.objectContaining({ path: "/profileId" }),
    ]);
  });
});

// ---------------------------------------------------------------- Lua

describe("POST /api/connection-tests/lua", () => {
  test("an existing folder passes", async () => {
    const result = await run("lua", { lua: { path: dir } });
    expect(result.status).toBe("ok");
    expect(result.checks[0]!.message).toBe(`Found the Lua folder ${dir}.`);
  });

  test("a missing folder fails", async () => {
    const missing = path.join(dir, "lua_scripts");
    const result = await run("lua", { lua: { path: missing } });
    expect(result.checks).toEqual([
      {
        check: "folder",
        status: "failed",
        message: `The Lua folder ${missing} does not exist, or Canvas may not open it.`,
      },
    ]);
  });

  test("a file instead of a folder fails", async () => {
    const file = path.join(dir, "init.lua");
    await writeFile(file, "");
    const result = await run("lua", { lua: { path: file } });
    expect(result.checks[0]!.message).toBe(
      `${file} is a file, not a folder. Point the Lua folder at the folder.`,
    );
  });
});

// ---------------------------------------------------------------- deadline

describe("withinDeadline", () => {
  test("passes a result through and stops its timer", async () => {
    let stopped = false;
    await expect(
      withinDeadline(Promise.resolve(42), 50, () => (stopped = true)),
    ).resolves.toBe(42);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(stopped).toBe(false);
  });

  test("passes the work's own failure through", async () => {
    await expect(
      withinDeadline(Promise.reject(new Error("boom")), 50, () => undefined),
    ).rejects.toThrow("boom");
  });

  test("gives up on work that never ends, and stops it", async () => {
    let stopped = false;
    const never = new Promise<never>(() => undefined);
    await expect(
      withinDeadline(never, 30, () => (stopped = true)),
    ).rejects.toBeInstanceOf(DeadlineError);
    expect(stopped).toBe(true);
  });

  test("work that fails after the deadline raises nothing", async () => {
    let fail: (e: Error) => void = () => undefined;
    const late = new Promise<never>((_, reject) => (fail = reject));
    await expect(
      withinDeadline(late, 10, () => undefined),
    ).rejects.toBeInstanceOf(DeadlineError);
    // Vitest fails the run on an unhandled rejection.
    fail(new Error("too late"));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
