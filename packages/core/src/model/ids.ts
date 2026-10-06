import { createHash } from "node:crypto";
import type { NodeKind } from "./node-kind.js";
import type { Origin } from "./origin.js";

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

/** Splits a node ID at its first colon. Keys may themselves contain colons. */
export function parseNodeId(id: string): { kind: string; key: string } {
  const colon = id.indexOf(":");
  if (colon <= 0 || colon === id.length - 1) {
    throw new Error(`Not a node ID: ${id}`);
  }
  return { kind: id.slice(0, colon), key: id.slice(colon + 1) };
}

/**
 * An edge's ID: a hash of its type, both ends and its origin. The same four
 * inputs always give the same ID; the same link found in two places (two
 * origins) gives two edges, so neither source is lost.
 */
export function edgeId(
  type: string,
  from: string,
  to: string,
  origin: Origin,
): string {
  return createHash("sha256")
    .update(canonicalJson([type, from, to, origin]))
    .digest("hex")
    .slice(0, 32);
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
