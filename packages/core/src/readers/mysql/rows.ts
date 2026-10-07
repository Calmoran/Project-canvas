import type { Connection } from "mysql2";
import type { LiveTable } from "./schema.js";
import { QUERY_VALUE_OPTIONS } from "./values.js";

/**
 * Streams a table's rows one at a time. mysql2 reads them off the network as
 * the caller asks for them (backpressure: when the loop body is slow, the
 * stream stops reading), so memory stays bounded however large the table
 * is. Rows come back as plain objects keyed by column name, in primary-key
 * order, so two scans of an unchanged table see the same sequence.
 *
 * Values come back with the per-query options in `values.ts` (big integers
 * exact, decimals and dates as text); `rowAttrs` turns a row into attrs.
 */
export async function* streamRows(
  connection: Connection,
  table: LiveTable,
  options: {
    readonly signal?: AbortSignal;
    readonly highWaterMark?: number;
    /** Columns to order by; defaults to the table's primary key. */
    readonly orderBy?: readonly string[];
  } = {},
): AsyncGenerator<Record<string, unknown>> {
  const order =
    options.orderBy ??
    table.columns
      .filter((c) => c.primaryKeyPosition !== null)
      .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
      .map((c) => c.name);
  const key = order.map((name) => `\`${escapeIdentifier(name)}\``);
  const sql =
    `SELECT * FROM \`${escapeIdentifier(table.schema)}\`.\`${escapeIdentifier(table.name)}\`` +
    (key.length > 0 ? ` ORDER BY ${key.join(", ")}` : "");

  const query = connection.query({ sql, ...QUERY_VALUE_OPTIONS });
  const stream = query.stream({ highWaterMark: options.highWaterMark ?? 256 });
  const abort = (): void => {
    stream.destroy(
      new Error(`Reading ${table.schema}.${table.name} was cancelled`),
    );
  };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const row of stream as AsyncIterable<Record<string, unknown>>) {
      yield row;
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    if (!stream.destroyed) stream.destroy();
  }
}

/** Escapes a name for use between MySQL backquotes. */
export function escapeIdentifier(name: string): string {
  if (name.length === 0 || name.includes("\0")) {
    throw new Error(`Not a usable MySQL identifier: ${JSON.stringify(name)}`);
  }
  return name.replaceAll("`", "``");
}
