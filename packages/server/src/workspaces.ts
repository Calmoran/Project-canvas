import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { migrate, openBetterSqlite3, type OpenStorage } from "@canvas/core";
import type { z } from "zod";
import {
  WorkspaceInputSchema,
  WorkspaceSchema,
  type Workspace,
  type WorkspaceListResponse,
} from "./api/index.js";

/** A parsed `POST /api/workspaces` body, defaults filled in. */
export type ParsedWorkspaceInput = z.output<typeof WorkspaceInputSchema>;

/**
 * On-disk layout under the config folder. One folder per workspace keeps
 * everything that belongs to it together, so later per-workspace files
 * (the credential fallback, remembered SSH host keys) have a place, and
 * removing a workspace is removing one folder:
 *
 *     <config>/workspaces/<id>/workspace.json   the record
 *     <config>/workspaces/<id>/graph.sqlite     the graph store
 */
export const WORKSPACES_FOLDER = "workspaces";
export const RECORD_FILE = "workspace.json";
export const DATABASE_FILE = "graph.sqlite";

/** Owner-only on Linux and macOS; Windows ignores the mode. */
const PRIVATE_DIR_MODE = 0o700;

/** The longest ID made from a name, so folder paths stay short on Windows. */
const MAX_ID_LENGTH = 48;

/** Names Windows refuses as a file or folder name, whatever the extension. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;

/**
 * Turns a workspace name into its ID: lower case, accents dropped, every run
 * of other characters made one dash. "My Server (Live)" becomes
 * "my-server-live". Undefined when nothing usable is left.
 */
export function workspaceIdFor(name: string): string | undefined {
  const id = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_ID_LENGTH)
    .replace(/^-+|-+$/g, "");
  return id === "" ? undefined : id;
}

/** One problem with a request, in the shape validation errors use. */
export interface InputIssue {
  readonly in: "body";
  readonly path: string;
  readonly message: string;
}

/**
 * The checks the request schema cannot make because they need the server:
 * the folder paths must be absolute on this machine (a relative path would
 * depend on where Canvas happened to be started), the profile must be one
 * Canvas ships, and the name must make a usable ID.
 */
export function checkWorkspaceInput(
  input: ParsedWorkspaceInput,
  profileIds: readonly string[],
): InputIssue[] {
  const issues: InputIssue[] = [];
  const issue = (at: string, message: string) =>
    issues.push({ in: "body", path: at, message });

  const id = workspaceIdFor(input.name);
  if (id === undefined) {
    issue("/name", "The name needs at least one letter or digit.");
  } else if (WINDOWS_RESERVED.test(id)) {
    issue("/name", `"${input.name}" is a name Windows reserves; pick another.`);
  }
  if (!profileIds.includes(input.profileId)) {
    issue(
      "/profileId",
      `Unknown profile "${input.profileId}"; known: ${profileIds.join(", ")}.`,
    );
  }
  const paths: [string, string | undefined][] = [
    ["/source/path", input.source.path],
    ["/dbc/path", input.dbc.path],
    ["/lua/path", input.lua?.path],
    [
      "/mysql/ssh/auth/privateKeyPath",
      input.mysql.ssh?.auth.method === "key"
        ? input.mysql.ssh.auth.privateKeyPath
        : undefined,
    ],
  ];
  for (const [at, value] of paths) {
    if (value !== undefined && !path.isAbsolute(value)) {
      issue(at, "Give the full path, starting from the drive or root.");
    }
  }
  return issues;
}

/** Thrown when a workspace with the same ID already exists. */
export class WorkspaceExistsError extends Error {
  constructor(readonly id: string) {
    super(`A workspace with the ID "${id}" already exists.`);
    this.name = "WorkspaceExistsError";
  }
}

export interface WorkspaceStoreOptions {
  /** Opens the SQLite file; tests may swap the driver. */
  readonly openStorage?: OpenStorage;
}

/** Reads and writes workspace records under one config folder. */
export class WorkspaceStore {
  private readonly root: string;
  private readonly openStorage: OpenStorage;

  constructor(
    readonly configDir: string,
    options: WorkspaceStoreOptions = {},
  ) {
    this.root = path.join(configDir, WORKSPACES_FOLDER);
    this.openStorage = options.openStorage ?? openBetterSqlite3;
  }

  /** The SQLite file of a workspace. */
  databasePath(id: string): string {
    return path.join(this.root, id, DATABASE_FILE);
  }

  /**
   * Every readable workspace, sorted by name. A folder whose record is
   * missing, malformed, or filed under another ID is listed as unreadable.
   */
  async list(): Promise<WorkspaceListResponse> {
    let entries;
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if (isCode(error, "ENOENT")) return { workspaces: [], unreadable: [] };
      throw error;
    }
    const workspaces: Workspace[] = [];
    const unreadable: WorkspaceListResponse["unreadable"] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const result = await this.read(entry.name);
      if (typeof result === "string") {
        unreadable.push({ folder: entry.name, reason: result });
      } else {
        workspaces.push(result);
      }
    }
    workspaces.sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
    unreadable.sort((a, b) => compare(a.folder, b.folder));
    return { workspaces, unreadable };
  }

  /**
   * Creates a workspace: its folder, its SQLite file at the current schema,
   * and its record. Creating the folder is the claim on the ID, so two
   * requests racing for one name cannot both succeed. If any step fails the
   * folder is removed, so no half-made workspace is left behind.
   */
  async create(input: ParsedWorkspaceInput): Promise<Workspace> {
    const id = workspaceIdFor(input.name);
    if (id === undefined) throw new Error("The name makes no ID.");
    const record: Workspace = WorkspaceSchema.parse({
      version: 1,
      id,
      ...input,
    });

    await mkdir(this.root, { recursive: true, mode: PRIVATE_DIR_MODE });
    const folder = path.join(this.root, id);
    try {
      await mkdir(folder, { mode: PRIVATE_DIR_MODE });
    } catch (error) {
      if (isCode(error, "EEXIST")) throw new WorkspaceExistsError(id);
      throw error;
    }

    try {
      const storage = this.openStorage(this.databasePath(id));
      try {
        migrate(storage);
      } finally {
        storage.close();
      }
      // Written to a temporary name first and then renamed, so a crash
      // mid-write never leaves a half-written record under the real name.
      const file = path.join(folder, RECORD_FILE);
      await writeFile(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(`${file}.tmp`, file);
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
    return record;
  }

  /** The record in one folder, or why it cannot be used. */
  private async read(folder: string): Promise<Workspace | string> {
    let text;
    try {
      text = await readFile(path.join(this.root, folder, RECORD_FILE), "utf8");
    } catch (error) {
      if (isCode(error, "ENOENT")) return `${RECORD_FILE} is missing.`;
      throw error;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return `${RECORD_FILE} is not valid JSON.`;
    }
    const parsed = WorkspaceSchema.safeParse(json);
    if (!parsed.success) {
      return `${RECORD_FILE} does not match the workspace format.`;
    }
    if (parsed.data.id !== folder) {
      return `${RECORD_FILE} names the ID "${parsed.data.id}", not the folder's.`;
    }
    return parsed.data;
  }
}

/** A fixed locale, so the order is the same on every machine. */
const compare = new Intl.Collator("en").compare;

function isCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === code
  );
}
