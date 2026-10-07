import { createHash } from "node:crypto";
import type { NodeKind } from "./node-kind.js";
import type { MysqlOrigin, Origin } from "./origin.js";

export type NodeId = `${string}:${string}`;

/**
 * A node's ID: `<kind>:<key>`, where the key is the thing's natural key
 * (`spell:116`, `row:creature_template/1234`). Natural keys keep IDs stable
 * across snapshots, which is what makes diffing plain set arithmetic.
 */
export function nodeId(kind: NodeKind, key: string): NodeId {
  if (key.length === 0) throw new Error(`Empty key for node kind ${kind}`);
  return `${kind}:${key}`;
}

/**
 * Encodes one part of a key so it can be joined with `/`: `%` and `/` are
 * percent-encoded (`%25`, `%2F`), and nothing else changes, so plain values
 * stay readable.
 */
export function encodeKeyPart(value: string | number): string {
  return String(value).replaceAll("%", "%25").replaceAll("/", "%2F");
}

/**
 * A row's natural key: `<database>/<table>/<pk>`, with a composite key's
 * values joined by `/` in the table's key-column order, each part encoded
 * by `encodeKeyPart` (decided by Alex). `row:world/trainer_spell/17/116`.
 */
export function rowKey(
  database: string,
  table: string,
  pk: readonly (string | number)[],
): string {
  if (pk.length === 0)
    throw new Error(`Row of ${database}/${table} has no key values`);
  return [database, table, ...pk].map(encodeKeyPart).join("/");
}

/** A table's natural key: `<database>/<table>`, as for rows. */
export function tableKey(database: string, table: string): string {
  return [database, table].map(encodeKeyPart).join("/");
}

/** Splits a node ID at its first colon. Keys may themselves contain colons. */
export function parseNodeId(id: string): { kind: string; key: string } {
  const colon = id.indexOf(":");
  if (colon <= 0 || colon === id.length - 1) {
    throw new Error(`Not a node ID: ${id}`);
  }
  return { kind: id.slice(0, colon), key: id.slice(colon + 1) };
}

/**
 * An edge's ID: the first 32 hex characters of SHA-256 over its type, both
 * ends and its origin. The same four inputs always give the same ID; the
 * same link found in two places (two origins) gives two edges, so neither
 * source is lost. Row key values are normalized first (see
 * `normalizeOrigin`), so a key read as a number and as text match.
 */
export function edgeId(
  type: string,
  from: string,
  to: string,
  origin: Origin,
): string {
  return createHash("sha256")
    .update(canonicalJson([type, from, to, normalizeOrigin(origin)]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * The form of an origin that edge IDs hash. MySQL drivers return the same key
 * as a number or as text depending on its column type and settings (mysql2
 * returns BIGINT and DECIMAL as text), so every row key value becomes its
 * decimal text: `116` and `"116"` both hash as `"116"`. Without this, one
 * edge could get a new ID on every scan and the diff would show phantom
 * changes. Nested override origins are normalized the same way.
 */
export function normalizeOrigin(origin: Origin): Origin {
  switch (origin.source) {
    case "mysql":
      return normalizeRowKey(origin);
    case "override":
      return {
        ...origin,
        at:
          origin.at.source === "mysql" ? normalizeRowKey(origin.at) : origin.at,
      };
    default:
      return origin;
  }
}

function normalizeRowKey(origin: MysqlOrigin): MysqlOrigin {
  if (origin.pk === undefined) return origin;
  return {
    ...origin,
    pk: Object.fromEntries(
      Object.entries(origin.pk).map(([column, value]) => [
        column,
        String(value),
      ]),
    ),
  };
}

/**
 * JSON with object keys sorted, so two equal values always serialize to the
 * same text regardless of the order their fields were written in.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const field = (value as Record<string, unknown>)[key];
      if (field !== undefined) sorted[key] = sortKeys(field);
    }
    return sorted;
  }
  return value;
}
