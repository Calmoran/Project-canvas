import Database from "better-sqlite3";
import {
  quoteIdentifier,
  type OpenStorage,
  type PreparedQuery,
  type Row,
  type SqlParams,
  type SqlValue,
  type Storage,
} from "./storage.js";

/**
 * The `Storage` adapter for better-sqlite3 (stack research section 2): a
 * native SQLite binding with prebuilt binaries, so no compiler is needed.
 * This file and its siblings are the only places allowed to import it.
 */
export const openBetterSqlite3: OpenStorage = (path, options = {}) => {
  const db = new Database(path, {
    readonly: options.readonly ?? false,
    fileMustExist: options.readonly ?? false,
  });
  if (!(options.readonly ?? false)) {
    // WAL lets readers keep reading while a scan writes; NORMAL sync is
    // safe in WAL mode and much faster than FULL.
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
  }
  db.pragma("foreign_keys = ON");
  return new BetterSqlite3Storage(db);
};

/** better-sqlite3 binds an array as positional and an object as named. */
function bind(params: SqlParams | undefined): unknown[] {
  if (params === undefined) return [];
  return Array.isArray(params) ? [...(params as SqlValue[])] : [params];
}

class BetterSqlite3Storage implements Storage {
  private readonly inserts = new Map<string, Database.Statement>();

  constructor(private readonly db: Database.Database) {}

  prepare<R extends Row = Row>(sql: string): PreparedQuery<R> {
    const statement = this.db.prepare(sql);
    const returnsRows = statement.reader;
    return {
      all: (params) => statement.all(...bind(params)) as R[],
      get: (params) => statement.get(...bind(params)) as R | undefined,
      run: (params) => {
        if (returnsRows) {
          throw new Error("run() is for statements that return no rows");
        }
        const result = statement.run(...bind(params));
        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        };
      },
      iterate: (params) =>
        statement.iterate(...bind(params)) as IterableIterator<R>,
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    // better-sqlite3 rejects a function that returns a promise and rolls
    // back, and turns nested transactions into savepoints.
    return this.db.transaction(fn)();
  }

  bulkInsert(
    table: string,
    columns: readonly string[],
    rows: Iterable<readonly SqlValue[]>,
  ): number {
    if (columns.length === 0) throw new Error("bulkInsert needs columns");
    const key = `${table}\0${columns.join("\0")}`;
    let insert = this.inserts.get(key);
    if (insert === undefined) {
      const names = columns.map(quoteIdentifier).join(", ");
      const slots = columns.map(() => "?").join(", ");
      insert = this.db.prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${slots})`,
      );
      this.inserts.set(key, insert);
    }
    const statement = insert;
    return this.transaction(() => {
      let count = 0;
      for (const row of rows) {
        if (row.length !== columns.length) {
          throw new Error(
            `Row ${count} has ${row.length} values for ${columns.length} columns`,
          );
        }
        statement.run(...row);
        count++;
      }
      return count;
    });
  }

  close(): void {
    this.inserts.clear();
    this.db.close();
  }
}
