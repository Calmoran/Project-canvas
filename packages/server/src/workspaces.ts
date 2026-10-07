import { randomUUID } from "node:crypto";
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
 *     <config>/workspaces/<folder>/workspace.json   the record
 *     <config>/workspaces/<folder>/graph.sqlite     the graph store
 *
 * A workspace's identity is a random UUID kept in its record. The folder is
 * named `<slug>-<short id>` ("my-server-live-3f2a9c1e"): the slug makes it
 * readable, the first 8 hex digits of the UUID tie it to the record.
 */
export const WORKSPACES_FOLDER = "workspaces";
export const RECORD_FILE = "workspace.json";
export const DATABASE_FILE = "graph.sqlite";

/** Owner-only on Linux and macOS; Windows ignores the mode. */
const PRIVATE_DIR_MODE = 0o700;

/** The longest slug made from a name, so folder paths stay short on Windows. */
const MAX_SLUG_LENGTH = 48;

/** How many hex digits of the UUID the folder name carries. */
const SHORT_ID_LENGTH = 8;
const SHORT_ID = new RegExp(`^[0-9a-f]{${SHORT_ID_LENGTH}}$`);

/**
 * Turns a workspace name into its slug: lower case, accents dropped, every
 * run of other characters made one dash. "My Server (Live)" becomes
 * "my-server-live". Two names with the same slug count as the same name.
 * Undefined when nothing usable is left.
 */
export function workspaceSlugFor(name: string): string | undefined {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug === "" ? undefined : slug;
}

/** The folder name for a workspace: `<slug>-<first 8 hex digits of id>`. */
export function workspaceFolderFor(slug: string, id: string): string {
  return `${slug}-${id.slice(0, SHORT_ID_LENGTH)}`;
}

/** Whether a folder name is `<slug>-<8 hex digits>` for this slug. */
function isFolderOf(folder: string, slug: string): boolean {
  const prefix = `${slug}-`;
  return (
    folder.startsWith(prefix) && SHORT_ID.test(folder.slice(prefix.length))
  );
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
 * Canvas ships, and the name must make a usable folder name.
 */
export function checkWorkspaceInput(
  input: ParsedWorkspaceInput,
  profileIds: readonly string[],
): InputIssue[] {
  const issues: InputIssue[] = [];
  const issue = (at: string, message: string) =>
    issues.push({ in: "body", path: at, message });

  if (workspaceSlugFor(input.name) === undefined) {
    issue("/name", "The name needs at least one letter or digit.");
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

/** Thrown when a workspace with the same name (same slug) already exists. */
export class WorkspaceExistsError extends Error {
  constructor(
    readonly workspaceName: string,
    /** The existing workspace's folder. */
    readonly folder: string,
  ) {
    super(
      `A workspace named like "${workspaceName}" already exists (${folder}).`,
    );
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

  /**
   * Every readable workspace, sorted by name. A folder whose record is
   * missing, malformed, or holds an ID that does not match the folder name
   * is listed as unreadable.
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
   * and its record. If any step fails the folder is removed, so no half-made
   * workspace is left behind.
   *
   * Names are kept unique without a lock: the new folder is made first, and
   * only then are the other folders checked for the same slug. Of two
   * requests racing for one name, at least the later one sees the other's
   * folder and backs out, so both can never succeed (at worst both back out
   * and the user tries again).
   */
  async create(input: ParsedWorkspaceInput): Promise<Workspace> {
    const slug = workspaceSlugFor(input.name);
    if (slug === undefined) throw new Error("The name makes no slug.");

    await mkdir(this.root, { recursive: true, mode: PRIVATE_DIR_MODE });
    const { id, folder } = await this.claimFolder(slug);
    const folderPath = path.join(this.root, folder);

    try {
      const other = (await readdir(this.root)).find(
        (name) => name !== folder && isFolderOf(name, slug),
      );
      if (other !== undefined) {
        throw new WorkspaceExistsError(input.name, other);
      }

      const record: Workspace = WorkspaceSchema.parse({
        version: 1,
        id,
        ...input,
      });
      const storage = this.openStorage(path.join(folderPath, DATABASE_FILE));
      try {
        migrate(storage);
      } finally {
        storage.close();
      }
      // Written to a temporary name first and then renamed, so a crash
      // mid-write never leaves a half-written record under the real name.
      const file = path.join(folderPath, RECORD_FILE);
      await writeFile(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(`${file}.tmp`, file);
      return record;
    } catch (error) {
      await rm(folderPath, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Makes a new, empty folder for a fresh UUID. Making a folder fails if it
   * already exists, so this never takes over another workspace's folder; a
   * clash on the 8 short digits just draws a new UUID.
   */
  private async claimFolder(
    slug: string,
  ): Promise<{ id: string; folder: string }> {
    for (;;) {
      const id = randomUUID();
      const folder = workspaceFolderFor(slug, id);
      try {
        await mkdir(path.join(this.root, folder), { mode: PRIVATE_DIR_MODE });
        return { id, folder };
      } catch (error) {
        if (!isCode(error, "EEXIST")) throw error;
      }
    }
  }

  /** The record in one folder, or why it cannot be used. */
  private async read(folder: string): Promise<Workspace | string> {
    let text;
    try {
      text = await readFile(path.join(this.root, folder, RECORD_FILE), "utf8");
    } catch (error) {
      if (isCode(error, "ENOENT")) return `${RECORD_FILE} is missing.`;
      // Any other failure (no permission, a folder where the file should
      // be) is this workspace's problem alone; the others still list.
      const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
      return `${RECORD_FILE} could not be read (${code}).`;
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
    const shortId = parsed.data.id.slice(0, SHORT_ID_LENGTH);
    if (!folder.endsWith(`-${shortId}`)) {
      return `${RECORD_FILE} holds the ID "${parsed.data.id}", which does not match the folder name.`;
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
