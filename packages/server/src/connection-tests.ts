import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  checkReadOnly,
  GitNotFoundError,
  openRepo,
  readFormat,
  type Profile,
} from "@canvas/core";
import { createConnection, type Connection, type RowDataPacket } from "mysql2";
import type { z } from "zod";
import type {
  CheckResult,
  CheckStatus,
  ConnectionTestResponse,
  DbcTestRequestSchema,
  LuaTestRequestSchema,
  MysqlTestRequestSchema,
  SourceTestRequestSchema,
} from "./api/index.js";

/**
 * The connection tests behind setup's "Test" buttons (OPS-3). Each returns
 * plain sentences the setup screen shows as they are; none throws for a
 * problem it can name. Nothing here writes anywhere.
 */

/** How long a MySQL connection may take before the test gives up. */
export const MYSQL_CONNECT_TIMEOUT_MS = 10_000;

const ok = (check: string, message: string): CheckResult => ({
  check,
  status: "ok",
  message,
});
const warning = (check: string, message: string): CheckResult => ({
  check,
  status: "warning",
  message,
});
const failed = (check: string, message: string): CheckResult => ({
  check,
  status: "failed",
  message,
});

const RANK: Record<CheckStatus, number> = { ok: 0, warning: 1, failed: 2 };

/** Wraps the checks with the worst status among them. */
export function summarize(checks: CheckResult[]): ConnectionTestResponse {
  const status = checks.reduce<CheckStatus>(
    (worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst),
    "ok",
  );
  return { status, checks };
}

// ---------------------------------------------------------------- MySQL

type MysqlTest = z.output<typeof MysqlTestRequestSchema>;

/**
 * Connects directly, reports the server version, checks every configured
 * database can be seen, and checks the user can only read. A user that can
 * do more is a warning, not a failure (architecture section 8): Canvas never
 * writes, but a read-only user makes that true by construction.
 */
export async function testMysql({
  mysql,
  password,
}: MysqlTest): Promise<ConnectionTestResponse> {
  const where = `${mysql.host}:${mysql.port}`;
  // The plain (callback) connection is what core's read-only check takes;
  // `.promise()` gives the same connection with promise-returning methods.
  let connection: Connection;
  try {
    connection = createConnection({
      host: mysql.host,
      port: mysql.port,
      user: mysql.user,
      ...(password === undefined ? {} : { password }),
      connectTimeout: MYSQL_CONNECT_TIMEOUT_MS,
    });
    // A connection that drops later raises an "error" event; without a
    // listener Node would treat it as a crash. The query in flight fails
    // on its own, which the test reports.
    connection.on("error", () => undefined);
    await connection.promise().connect();
  } catch (error) {
    return summarize([
      failed("connect", connectFailure(error, where, mysql.host)),
    ]);
  }

  try {
    const checks: CheckResult[] = [];
    const [versionRows] = await connection
      .promise()
      .query<RowDataPacket[]>("SELECT VERSION() AS version");
    const version = String(versionRows[0]?.["version"] ?? "unknown");
    checks.push(
      ok(
        "connect",
        `Connected to MySQL ${version} at ${where} as ${mysql.user}.`,
      ),
    );

    const names = Object.values(mysql.databases).filter(
      (d): d is string => d !== undefined,
    );
    const missing: string[] = [];
    for (const name of names) {
      // SCHEMATA lists only databases this user may see, and compares
      // names the way this server does (it folds case when
      // lower_case_table_names is set).
      const [rows] = await connection
        .promise()
        .query<RowDataPacket[]>(
          "SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
          [name],
        );
      if (rows.length === 0) missing.push(name);
    }
    if (missing.length > 0) {
      checks.push(
        failed(
          "databases",
          `${listOf(missing)} ${missing.length === 1 ? "was" : "were"} not found, or ${mysql.user} may not see ${missing.length === 1 ? "it" : "them"}.`,
        ),
      );
      return summarize(checks);
    }
    checks.push(ok("databases", `Found ${listOf(names)}.`));

    const report = await checkReadOnly(connection, names);
    if (report.readOnly === true) {
      checks.push(ok("read-only", `${report.user} can only read (SELECT).`));
    } else if (report.readOnly === false) {
      const extra = report.beyondSelect
        .map((g) => `${g.privilege} on ${g.on}`)
        .join(", ");
      checks.push(
        warning(
          "read-only",
          `${report.user} can do more than read: ${extra}. Canvas only reads, but a user limited to SELECT keeps it that way by construction.`,
        ),
      );
    } else {
      checks.push(
        warning(
          "read-only",
          `Could not confirm ${report.user} is read-only: it has roles (${report.roles.join(", ")}) whose privileges this check cannot see.`,
        ),
      );
    }
    return summarize(checks);
  } finally {
    await connection
      .promise()
      .end()
      .catch(() => undefined);
  }
}

/**
 * A plain sentence for a failed connection. It is built from the error's
 * code only, never its text, so nothing the driver echoes (the user name
 * is fine, but a future driver might add more) reaches the screen.
 */
function connectFailure(error: unknown, where: string, host: string): string {
  const code = (error as { code?: unknown }).code;
  switch (code) {
    case "ER_ACCESS_DENIED_ERROR":
      return "MySQL refused the user name or password.";
    case "ER_HOST_NOT_PRIVILEGED":
      return "MySQL does not let this user connect from this computer.";
    case "ER_NOT_SUPPORTED_AUTH_MODE":
      return "MySQL asked for a sign-in method Canvas does not support.";
    case "ECONNREFUSED":
      return `Nothing answered at ${where}. Check that MySQL is running and the port is right.`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `The host name "${host}" could not be found.`;
    case "ETIMEDOUT":
      return `No answer from ${where} within ${MYSQL_CONNECT_TIMEOUT_MS / 1000} seconds. A firewall may be in the way.`;
    default:
      return typeof code === "string"
        ? `Could not connect to MySQL at ${where} (${code}).`
        : `Could not connect to MySQL at ${where}.`;
  }
}

function listOf(names: readonly string[]): string {
  const quoted = names.map((n) => `"${n}"`);
  return quoted.length <= 1
    ? (quoted[0] ?? "")
    : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
}

// ---------------------------------------------------------------- folders

/** Undefined when the path is a folder, else a plain reason why not. */
async function folderProblem(
  folder: string,
  what: string,
): Promise<string | undefined> {
  try {
    const info = await stat(folder);
    return info.isDirectory()
      ? undefined
      : `${folder} is a file, not a folder. Point the ${what} at the folder.`;
  } catch {
    return `The ${what} ${folder} does not exist, or Canvas may not open it.`;
  }
}

// ---------------------------------------------------------------- source

type SourceTest = z.output<typeof SourceTestRequestSchema>;

/** The source path is a git clone and the ref names a commit in it. */
export async function testSource({
  source,
}: SourceTest): Promise<ConnectionTestResponse> {
  const problem = await folderProblem(source.path, "source folder");
  if (problem !== undefined) return summarize([failed("folder", problem)]);

  let repo;
  try {
    repo = await openRepo({ repo: source.path });
  } catch (error) {
    return summarize([
      failed(
        "repository",
        error instanceof GitNotFoundError
          ? error.message
          : `${source.path} is not a git clone. Point this at the folder you cloned the server's source into.`,
      ),
    ]);
  }
  const checks = [ok("repository", `${source.path} is a git clone.`)];
  try {
    const commit = await repo.resolve(source.ref);
    checks.push(ok("ref", `"${source.ref}" is commit ${commit.slice(0, 12)}.`));
  } catch {
    checks.push(
      failed(
        "ref",
        `"${source.ref}" is not a branch, tag or commit in this clone. If it is a remote branch, fetch it first.`,
      ),
    );
  }
  return summarize(checks);
}

// ---------------------------------------------------------------- DBC

type DbcTest = z.output<typeof DbcTestRequestSchema>;

/** The file the DBC test looks for (core:src/server/game/DataStores/DBCStores.cpp:355). */
export const SPELL_DBC = "Spell.dbc";

/** "WDBC" read as a little-endian number (core:src/common/DataStores/DBCFileLoader.cpp:47). */
const WDBC_MAGIC = 0x43424457;
const HEADER_SIZE = 20;

/**
 * The DBC folder holds Spell.dbc, and its header matches the profile's
 * layout. Only the 20-byte header is read, not the whole file. A field
 * count or record size that differs means the files come from another
 * client version than the profile describes.
 */
export async function testDbc(
  { dbc }: DbcTest,
  profile: Profile,
): Promise<ConnectionTestResponse> {
  const problem = await folderProblem(dbc.path, "DBC folder");
  if (problem !== undefined) return summarize([failed("folder", problem)]);

  // Any letter case: extracted files are not always named exactly.
  const name = (await readdir(dbc.path)).find(
    (f) => f.toLowerCase() === SPELL_DBC.toLowerCase(),
  );
  if (name === undefined) {
    return summarize([
      failed(
        "spell-dbc",
        `There is no ${SPELL_DBC} in ${dbc.path}. Point this at the folder of extracted .dbc files (the server's DataDir/dbc).`,
      ),
    ]);
  }

  const header = Buffer.alloc(HEADER_SIZE);
  let read: number;
  try {
    const file = await open(path.join(dbc.path, name), "r");
    try {
      ({ bytesRead: read } = await file.read(header, 0, HEADER_SIZE, 0));
    } finally {
      await file.close();
    }
  } catch {
    return summarize([failed("spell-dbc", `${name} could not be read.`)]);
  }
  if (read < HEADER_SIZE || header.readUInt32LE(0) !== WDBC_MAGIC) {
    return summarize([
      failed("spell-dbc", `${name} is not a DBC file (it has no WDBC header).`),
    ]);
  }
  const records = header.readUInt32LE(4);
  const fields = header.readUInt32LE(8);
  const recordSize = header.readUInt32LE(12);

  const layout = profile.dbc.find((l) => l.file === SPELL_DBC);
  if (layout === undefined) {
    return summarize([
      ok("spell-dbc", `${name} found, with ${records} spells.`),
    ]);
  }
  const expected = readFormat(layout.format);
  if (fields !== layout.format.length || recordSize !== expected.recordSize) {
    return summarize([
      failed(
        "spell-dbc",
        `${name} has ${fields} fields of ${recordSize} bytes per spell, but the ${profile.id} profile expects ${layout.format.length} fields of ${expected.recordSize} bytes. The files are probably from another client version.`,
      ),
    ]);
  }
  return summarize([
    ok(
      "spell-dbc",
      `${name} found, with ${records} spells, in the layout the ${profile.id} profile expects.`,
    ),
  ]);
}

// ---------------------------------------------------------------- Lua

type LuaTest = z.output<typeof LuaTestRequestSchema>;

/** The Lua folder exists. */
export async function testLua({
  lua,
}: LuaTest): Promise<ConnectionTestResponse> {
  const problem = await folderProblem(lua.path, "Lua folder");
  return summarize([
    problem === undefined
      ? ok("folder", `Found the Lua folder ${lua.path}.`)
      : failed("folder", problem),
  ]);
}
