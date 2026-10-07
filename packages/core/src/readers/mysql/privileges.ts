import type { Connection, RowDataPacket } from "mysql2";

/**
 * Whether the MySQL user Canvas connects as can do more than read
 * (architecture section 1, principle 6: phase 1 is read-only by
 * construction). OPS-3 shows the result in the connection test.
 *
 * How it decides (decided by Alex): it reads the user's own grants from
 * information_schema (global, per-database, per-table and per-column).
 * Anything other than SELECT counts as more than read-only, apart from
 * USAGE, which means "no privilege". A grant on a database pattern such as
 * `acore\_%` counts when the pattern matches a configured database.
 *
 * Limitation: privileges reached only through MySQL 8 roles may not appear
 * in those tables. When the user has any role, the answer is "unknown",
 * never "read-only", so a role can't hide write access.
 */
export interface ReadOnlyReport {
  /** true: only SELECT; false: more than SELECT; "unknown": roles are in play. */
  readonly readOnly: boolean | "unknown";
  /** The grantee as MySQL writes it, e.g. `'canvas'@'%'`. */
  readonly user: string;
  /** Every privilege found beyond SELECT, and where it applies. */
  readonly beyondSelect: readonly { privilege: string; on: string }[];
  /** Roles granted to the user, which this check cannot see through. */
  readonly roles: readonly string[];
}

interface PrivilegeRow extends RowDataPacket {
  PRIVILEGE_TYPE: string;
  ON_WHAT: string;
}

export async function checkReadOnly(
  connection: Connection,
  databases: readonly string[],
): Promise<ReadOnlyReport> {
  const db = connection.promise();
  const [who] = await db.query<RowDataPacket[]>(
    `SELECT CONCAT("'", SUBSTRING_INDEX(CURRENT_USER(), '@', 1), "'@'",
                   SUBSTRING_INDEX(CURRENT_USER(), '@', -1), "'") AS grantee`,
  );
  const user = String(who[0]?.["grantee"]);

  const [global] = await db.query<PrivilegeRow[]>(
    `SELECT PRIVILEGE_TYPE, '*.*' AS ON_WHAT
       FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = ?`,
    [user],
  );
  const [schema] = await db.query<PrivilegeRow[]>(
    `SELECT PRIVILEGE_TYPE, TABLE_SCHEMA AS ON_WHAT
       FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = ?`,
    [user],
  );
  const [table] = await db.query<PrivilegeRow[]>(
    `SELECT PRIVILEGE_TYPE, CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS ON_WHAT
       FROM information_schema.TABLE_PRIVILEGES WHERE GRANTEE = ?
     UNION ALL
     SELECT PRIVILEGE_TYPE, CONCAT(TABLE_SCHEMA, '.', TABLE_NAME, '.', COLUMN_NAME)
       FROM information_schema.COLUMN_PRIVILEGES WHERE GRANTEE = ?`,
    [user, user],
  );
  let roles: string[];
  try {
    const [roleRows] = await db.query<RowDataPacket[]>(
      `SELECT CONCAT("'", ROLE_NAME, "'@'", ROLE_HOST, "'") AS role
         FROM information_schema.APPLICABLE_ROLES`,
    );
    roles = roleRows.map((r) => String(r["role"]));
  } catch {
    // Servers without this view, or with other columns (MariaDB), can't
    // list roles; that must read as "unknown", never as "read-only".
    roles = ["(roles could not be listed on this server)"];
  }

  return judgeGrants({
    user,
    databases,
    global: global.map(plain),
    schema: schema.map(plain),
    table: table.map(plain),
    roles,
  });
}

const plain = (r: PrivilegeRow): { privilege: string; on: string } => ({
  privilege: r.PRIVILEGE_TYPE,
  on: r.ON_WHAT,
});

/** The decision itself, separate from the queries so it is unit-tested. */
export function judgeGrants(grants: {
  readonly user: string;
  readonly databases: readonly string[];
  readonly global: readonly { privilege: string; on: string }[];
  readonly schema: readonly { privilege: string; on: string }[];
  readonly table: readonly { privilege: string; on: string }[];
  readonly roles: readonly string[];
}): ReadOnlyReport {
  const harmless = (p: string): boolean => p === "SELECT" || p === "USAGE";
  const configured = (on: string): boolean =>
    grants.databases.some((d) => mysqlPatternMatches(on, d));
  const inConfigured = (on: string): boolean =>
    grants.databases.some((d) => on === d || on.startsWith(`${d}.`));

  const beyondSelect = [
    ...grants.global,
    ...grants.schema.filter((g) => configured(g.on)),
    ...grants.table.filter((g) => inConfigured(g.on)),
  ].filter((g) => !harmless(g.privilege));

  return {
    readOnly:
      beyondSelect.length > 0
        ? false
        : grants.roles.length > 0
          ? "unknown"
          : true,
    user: grants.user,
    beyondSelect,
    roles: grants.roles,
  };
}

/**
 * Whether a database-level grant's name matches a database. Such names are
 * MySQL LIKE patterns: `%` is any run of characters, `_` any one character,
 * and a backslash makes the next character literal (`acore\_world`).
 */
export function mysqlPatternMatches(pattern: string, name: string): boolean {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\" && i + 1 < pattern.length) {
      source += escapeRegExp(pattern[++i]!);
    } else if (c === "%") source += ".*";
    else if (c === "_") source += ".";
    else source += escapeRegExp(c);
  }
  return new RegExp(`^${source}$`, "s").test(name);
}

const escapeRegExp = (c: string): string =>
  c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
