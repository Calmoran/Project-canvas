import type { Connection, RowDataPacket } from "mysql2";
import { escapeIdentifier } from "./rows.js";
import type { LiveTable } from "./schema.js";

/**
 * A table's fingerprint for incremental scans (decided by Alex): MySQL's
 * `CHECKSUM TABLE` (a checksum over every row's content) plus an exact
 * `COUNT(*)`. If both match the previous scan's, the table is unchanged and
 * its rows are reused instead of read again. Both read the whole table on
 * the server, but send back two numbers instead of every row.
 */
export async function tableFingerprint(
  connection: Connection,
  table: Pick<LiveTable, "schema" | "name">,
): Promise<string> {
  const name = `\`${escapeIdentifier(table.schema)}\`.\`${escapeIdentifier(table.name)}\``;
  const db = connection.promise();
  const [checksum] = await db.query<RowDataPacket[]>(`CHECKSUM TABLE ${name}`);
  const [count] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM ${name}`,
  );
  const sum: unknown = checksum[0]?.["Checksum"];
  if (typeof sum !== "number" && typeof sum !== "string") {
    throw new Error(
      `CHECKSUM TABLE gave no checksum for ${table.schema}.${table.name}`,
    );
  }
  const rows: unknown = count[0]?.["n"];
  return formatFingerprint(
    String(sum),
    typeof rows === "number" || typeof rows === "string" ? String(rows) : "?",
  );
}

/** The fingerprint text: stable, and readable in the scan log. */
export function formatFingerprint(checksum: string, rows: string): string {
  return `checksum=${checksum};rows=${rows}`;
}
