/**
 * The storage contract (architecture section 7). Everything outside
 * `storage/` talks to SQLite through this interface only, so the driver
 * underneath (better-sqlite3 today, Node's built-in `node:sqlite` once it is
 * stable) can change without touching the rest of Canvas.
 *
 * The API is synchronous on purpose: both drivers run SQLite in-process and
 * answer immediately, and a synchronous transaction cannot be interleaved
 * with other work halfway through.
 */

/** A value SQLite can store in one column. */
export type SqlValue = string | number | bigint | Uint8Array | null;

/** Positional (`?`) or named (`@name`) statement parameters. */
export type SqlParams =
  readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

export type Row = Record<string, SqlValue>;

export interface RunResult {
  /** Rows inserted, updated or deleted. */
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

/** A compiled SQL statement, reusable with different parameters. */
export interface PreparedQuery<R extends Row = Row> {
  all(params?: SqlParams): R[];
  get(params?: SqlParams): R | undefined;
  run(params?: SqlParams): RunResult;
  iterate(params?: SqlParams): IterableIterator<R>;
}

export interface Storage {
  /** Compiles a statement. Compile once, run many times. */
  prepare<R extends Row = Row>(sql: string): PreparedQuery<R>;
  /** Runs one or more statements with no parameters (schema changes). */
  exec(sql: string): void;
  /**
   * Runs `fn` in a transaction: everything it wrote is kept if it returns,
   * and undone if it throws. `fn` must be synchronous. Nested calls become
   * savepoints, so an inner failure undoes only the inner part.
   */
  transaction<T>(fn: () => T): T;
  /**
   * Inserts many rows into one table in a single transaction and returns how
   * many were written. Table and column names must be plain identifiers.
   */
  bulkInsert(
    table: string,
    columns: readonly string[],
    rows: Iterable<readonly SqlValue[]>,
  ): number;
  close(): void;
}

export interface OpenOptions {
  readonly readonly?: boolean;
}

/** Opens a database file. One driver per SQLite binding. */
export type OpenStorage = (path: string, options?: OpenOptions) => Storage;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Quotes a table or column name after checking it is a plain identifier. */
export function quoteIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Not a plain SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}
