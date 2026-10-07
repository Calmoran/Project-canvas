import type { Connection } from "mysql2";
import type { LiveTable } from "./schema.js";

/**
 * Streams a table's rows one at a time. mysql2 reads them off the network as
 * the caller asks for them (backpressure: when the loop body is slow, the
 * stream stops reading), so memory stays bounded however large the table
 * is. Rows come back as plain objects keyed by column name, in primary-key
 * order, so two scans of an unchanged table see the same sequence.
 *
 * How column values become node attrs (numbers, decimals, dates, blobs) is
 * pending a decision; this returns mysql2's values untouched.
 */
export async function* streamRows(
  connection: Connection,
  table: LiveTable,
  options: {
    readonly signal?: AbortSignal;
    readonly highWaterMark?: number;
  } = {},
): AsyncGenerator<Record<string, unknown>> {
  const key = table.columns
    .filter((c) => c.primaryKeyPosition !== null)
    .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
    .map((c) => `\`${escapeIdentifier(c.name)}\``);
  const sql =
    `SELECT * FROM \`${escapeIdentifier(table.schema)}\`.\`${escapeIdentifier(table.name)}\`` +
    (key.length > 0 ? ` ORDER BY ${key.join(", ")}` : "");

  const query = connection.query(sql);
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
