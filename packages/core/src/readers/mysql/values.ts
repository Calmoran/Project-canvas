import type { TypeCast } from "mysql2";
import type { Attrs, JsonValue } from "../../model/json.js";
import type { LiveTable } from "./schema.js";

/**
 * How MySQL column values become node attributes (decided by Alex):
 * - integers that fit exactly in a JavaScript number stay numbers; a BIGINT
 *   beyond 2^53 becomes text, so it is never rounded;
 * - DECIMAL is always text, because it is exact and a float is not;
 * - dates and times are text, exactly as MySQL gives them;
 * - binary data (BLOB, BINARY, VARBINARY, BIT) is left out, and only its
 *   length is kept, under the reserved attribute `$binaryLengths`;
 * - JSON columns are their parsed JSON value; NULL is null.
 *
 * The first three are set per query, so they hold however the server lane
 * opened the connection.
 */
export const QUERY_VALUE_OPTIONS = {
  supportBigNumbers: true,
  bigNumberStrings: false,
  dateStrings: true,
  typeCast: ((field, next) =>
    field.type === "NEWDECIMAL" || field.type === "DECIMAL"
      ? field.string()
      : next()) satisfies TypeCast,
} as const;

/** The reserved attribute that records the byte length of left-out binary values. */
export const BINARY_LENGTHS_ATTR = "$binaryLengths";

const BINARY_TYPES = new Set([
  "binary",
  "varbinary",
  "tinyblob",
  "blob",
  "mediumblob",
  "longblob",
  "bit",
]);

/** Whether a column holds binary data, by its information_schema type. */
export function isBinaryColumn(dataType: string): boolean {
  return BINARY_TYPES.has(dataType.toLowerCase());
}

/** Turns one streamed row into node attributes. */
export function rowAttrs(
  table: Pick<LiveTable, "columns">,
  row: Readonly<Record<string, unknown>>,
): Attrs {
  const attrs: Record<string, JsonValue> = {};
  const binary: Record<string, number> = {};
  for (const column of table.columns) {
    const value = row[column.name];
    if (isBinaryColumn(column.dataType) || value instanceof Uint8Array) {
      if (value instanceof Uint8Array) binary[column.name] = value.byteLength;
      else if (value === null || value === undefined) attrs[column.name] = null;
      continue;
    }
    attrs[column.name] = toJson(value, column.name);
  }
  if (Object.keys(binary).length > 0) attrs[BINARY_LENGTHS_ATTR] = binary;
  return attrs;
}

function toJson(value: unknown, column: string): JsonValue {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "bigint":
      return Number.isSafeInteger(Number(value))
        ? Number(value)
        : value.toString();
    case "object":
      if (value instanceof Date) return value.toISOString(); // only if a caller set dates as objects
      return JSON.parse(JSON.stringify(value)) as JsonValue; // a JSON column
    default:
      throw new Error(
        `Column ${column}: no attribute form for a ${typeof value}`,
      );
  }
}
