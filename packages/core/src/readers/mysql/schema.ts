import type { Connection, RowDataPacket } from "mysql2";
import type { Database, Profile } from "../../profile/index.js";

/**
 * The live schema of the configured databases, read from MySQL's own
 * catalogue (`information_schema`), never from the base `.sql` files.
 * Those files are not the live schema: later update files rename and drop
 * columns, and a customized server adds its own tables (schema research
 * section 0, item 1).
 */

/**
 * Which actual MySQL database holds each of the profile's databases. The
 * reader is given an already-open connection (mysql2's callback-style
 * `Connection`; `.promise()` gives the promise view): opening it, with
 * credentials and any SSH tunnel, is the server lane's job.
 */
export type DatabaseNames = Readonly<Partial<Record<Database, string>>>;

export interface LiveColumn {
  readonly name: string;
  /** MySQL's type name, e.g. `int`, `varchar`, `decimal`. */
  readonly dataType: string;
  /** The full column type, e.g. `int unsigned`, `varchar(100)`. */
  readonly columnType: string;
  readonly nullable: boolean;
  /** Position within the primary key (1 = first), or null if not part of it. */
  readonly primaryKeyPosition: number | null;
}

export interface LiveTable {
  readonly database: Database;
  /** The actual MySQL database name. */
  readonly schema: string;
  readonly name: string;
  readonly columns: readonly LiveColumn[];
}

export interface LiveSchema {
  /** The profile databases that were configured and read. */
  readonly databases: readonly Database[];
  readonly tables: readonly LiveTable[];
  /**
   * MySQL's `lower_case_table_names` setting: when it is not 0, table names
   * are compared case-insensitively (the default on Windows servers).
   */
  readonly caseInsensitiveNames: boolean;
}

interface ColumnRow extends RowDataPacket {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  PK_POSITION: number | null;
}

/** Reads every base table and its columns in the configured databases. */
export async function readLiveSchema(
  connection: Connection,
  databases: DatabaseNames,
): Promise<LiveSchema> {
  const db = connection.promise();
  const roles = Object.entries(databases).filter(
    (entry): entry is [Database, string] => typeof entry[1] === "string",
  );
  const [settings] = await db.query<RowDataPacket[]>(
    "SELECT @@lower_case_table_names AS lctn",
  );
  const caseInsensitiveNames = Number(settings[0]?.["lctn"] ?? 0) !== 0;
  const configured = roles.map(([role]) => role);
  if (roles.length === 0) {
    return { databases: [], tables: [], caseInsensitiveNames };
  }

  const schemas = roles.map(([, schema]) => schema);
  const [rows] = await db.query<ColumnRow[]>(
    `SELECT c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE,
            c.COLUMN_TYPE, c.IS_NULLABLE, k.ORDINAL_POSITION AS PK_POSITION
       FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
       LEFT JOIN information_schema.KEY_COLUMN_USAGE k
         ON k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME
        AND k.COLUMN_NAME = c.COLUMN_NAME AND k.CONSTRAINT_NAME = 'PRIMARY'
      WHERE c.TABLE_SCHEMA IN (?) AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION`,
    [schemas],
  );

  // With lower_case_table_names set, information_schema reports database
  // names in lower case whatever case the configuration used, so the
  // lookup compares names the way the server does.
  const norm = (name: string): string =>
    caseInsensitiveNames ? name.toLowerCase() : name;
  const roleOf = new Map(roles.map(([role, schema]) => [norm(schema), role]));
  const tables = new Map<string, { table: LiveTable; columns: LiveColumn[] }>();
  for (const row of rows) {
    const key = `${row.TABLE_SCHEMA}\0${row.TABLE_NAME}`;
    let entry = tables.get(key);
    if (entry === undefined) {
      const columns: LiveColumn[] = [];
      entry = {
        columns,
        table: {
          database: roleOf.get(norm(row.TABLE_SCHEMA))!,
          schema: row.TABLE_SCHEMA,
          name: row.TABLE_NAME,
          columns,
        },
      };
      tables.set(key, entry);
    }
    entry.columns.push({
      name: row.COLUMN_NAME,
      dataType: row.DATA_TYPE,
      columnType: row.COLUMN_TYPE,
      nullable: row.IS_NULLABLE === "YES",
      primaryKeyPosition:
        row.PK_POSITION === null ? null : Number(row.PK_POSITION),
    });
  }
  return {
    databases: configured,
    tables: [...tables.values()].map((e) => e.table),
    caseInsensitiveNames,
  };
}

export interface TableSplit {
  /** Live tables the profile (or an overlay) defines: read as links. */
  readonly known: readonly LiveTable[];
  /**
   * Live tables nothing defines: reported to the custom-table flow, never
   * read as links (architecture section 6).
   */
  readonly custom: readonly LiveTable[];
  /** Profile tables the live database does not have, per database. */
  readonly missing: readonly { database: Database; name: string }[];
}

/**
 * Splits the live tables into those the profile knows and custom ones.
 * `overlayTables` are the tables a server overlay has mapped (CORE-17), so
 * they are no longer custom.
 */
export function splitTables(
  live: LiveSchema,
  profile: Pick<Profile, "databases">,
  overlayTables: readonly { database: Database; name: string }[] = [],
): TableSplit {
  const norm = (name: string): string =>
    live.caseInsensitiveNames ? name.toLowerCase() : name;
  const defined = new Set<string>();
  const add = (database: Database, name: string): void => {
    defined.add(`${database}\0${norm(name)}`);
  };
  for (const database of ["world", "characters", "auth"] as const) {
    for (const table of profile.databases[database]) add(database, table.name);
  }
  for (const t of overlayTables) add(t.database, t.name);

  const known: LiveTable[] = [];
  const custom: LiveTable[] = [];
  const present = new Set<string>();
  for (const table of live.tables) {
    const key = `${table.database}\0${norm(table.name)}`;
    present.add(key);
    (defined.has(key) ? known : custom).push(table);
  }
  const readDatabases = new Set(live.databases);
  const missing: { database: Database; name: string }[] = [];
  for (const database of ["world", "characters", "auth"] as const) {
    if (!readDatabases.has(database)) continue;
    for (const table of profile.databases[database]) {
      if (!present.has(`${database}\0${norm(table.name)}`)) {
        missing.push({ database, name: table.name });
      }
    }
  }
  return { known, custom, missing };
}
