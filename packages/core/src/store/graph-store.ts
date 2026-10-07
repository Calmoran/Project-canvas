import { randomUUID } from "node:crypto";
import {
  EdgeDraftSchema,
  type Confidence,
  type Edge,
  type EdgeDraft,
} from "../model/edge.js";
import type { Finding, FindingKind } from "../model/finding.js";
import { FindingSchema } from "../model/finding.js";
import { edgeId } from "../model/ids.js";
import type { Attrs } from "../model/json.js";
import { NODE_KINDS } from "../model/node-kind.js";
import { NodeDraftSchema, type Node, type NodeDraft } from "../model/node.js";
import type { Origin } from "../model/origin.js";
import { SnapshotSchema, type Snapshot } from "../model/snapshot.js";
import { migrate } from "../storage/migrations.js";
import type { Row, SqlValue, Storage } from "../storage/storage.js";

/** A node to write, with the reader input it came from (null/null: made by the pipeline). */
export interface NodeWrite {
  readonly node: NodeDraft;
  readonly reader: string | null;
  readonly input: string | null;
}

/** An edge to write, with the reader input it came from (null/null: made by the pipeline). */
export interface EdgeWrite {
  readonly edge: EdgeDraft;
  readonly reader: string | null;
  readonly input: string | null;
}

/** A finding to write; the store stamps the snapshot. */
export type FindingDraft = Omit<Finding, "snapshot">;

export interface NeighborhoodQuery {
  /** The focus node's ID. */
  readonly node: string;
  /** How many edges away to go; 0 is the focus node alone. */
  readonly hops: number;
  /** Walk only edges of these types. */
  readonly edgeTypes?: readonly string[];
  /** Walk only edges with these confidences. */
  readonly confidences?: readonly Confidence[];
  /** The most nodes to return, the focus node included. */
  readonly cap: number;
}

export interface Neighborhood {
  readonly nodes: Node[];
  readonly edges: Edge[];
  /** True when the cap left out a node the walk could have reached. */
  readonly truncated: boolean;
}

export interface SearchHit {
  readonly node: Node;
  /** How it matched, in ranking order. */
  readonly match: "id" | "key" | "id_prefix" | "label";
}

/** Bound parameters per IN (...) list, well under SQLite's limit. */
const CHUNK = 500;

/**
 * The graph store (CORE-1): snapshots, batched writes and graph queries
 * over the F-1 `Storage` interface. All of Canvas's graph SQL lives here, so
 * the pipeline, the server and the diff never write SQL of their own.
 * Methods are synchronous, like `Storage`.
 *
 * A snapshot is written while `running`, then finished or failed; after
 * that it never changes (architecture section 3), so every write checks the
 * snapshot is still running, inside the same transaction.
 */
export class GraphStore {
  constructor(private readonly storage: Storage) {
    migrate(storage);
  }

  // Snapshots ---------------------------------------------------------------

  /** Starts a snapshot. The store makes its ID. */
  createSnapshot(input: {
    profile: { id: string; coreCommit: string };
    sources: Snapshot["sources"];
  }): Snapshot {
    const snapshot = SnapshotSchema.parse({
      id: randomUUID(),
      status: "running",
      profile: input.profile,
      sources: input.sources,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    this.storage
      .prepare(
        `INSERT INTO snapshots (id, status, profile_id, core_commit, sources, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run([
        snapshot.id,
        snapshot.status,
        snapshot.profile.id,
        snapshot.profile.coreCommit,
        JSON.stringify(snapshot.sources),
        snapshot.startedAt,
      ]);
    return snapshot;
  }

  /** Marks a running snapshot finished; from then on it refuses writes. */
  finishSnapshot(id: string): Snapshot {
    return this.end(id, "finished");
  }

  /**
   * Marks a running snapshot failed. Its rows stay, so the partial graph
   * shows where the scan stopped; the message is the `failed` ScanEvent in
   * `scan_log`. It refuses writes from then on.
   */
  failSnapshot(id: string): Snapshot {
    return this.end(id, "failed");
  }

  getSnapshot(id: string): Snapshot | undefined {
    const row = this.storage
      .prepare("SELECT * FROM snapshots WHERE id = ?")
      .get([id]);
    return row === undefined ? undefined : snapshotOf(row);
  }

  /** Every snapshot, newest first. */
  listSnapshots(): Snapshot[] {
    return this.storage
      .prepare("SELECT * FROM snapshots ORDER BY started_at DESC, id")
      .all()
      .map(snapshotOf);
  }

  private end(id: string, status: "finished" | "failed"): Snapshot {
    return this.storage.transaction(() => {
      this.requireRunning(id);
      this.storage
        .prepare(
          "UPDATE snapshots SET status = ?, finished_at = ? WHERE id = ?",
        )
        .run([status, new Date().toISOString(), id]);
      return this.getSnapshot(id)!;
    });
  }

  private requireRunning(id: string): void {
    const snapshot = this.getSnapshot(id);
    if (snapshot === undefined) throw new Error(`No snapshot '${id}'`);
    if (snapshot.status !== "running") {
      throw new Error(
        `Snapshot '${id}' is ${snapshot.status} and can no longer change`,
      );
    }
  }

  // Writes ------------------------------------------------------------------

  /**
   * Writes nodes in one transaction. Each is checked against the schema
   * first. A node ID already in the snapshot, or twice in the batch, is an
   * error: the whole batch is undone and the message names the ID.
   */
  writeNodes(snapshot: string, items: readonly NodeWrite[]): number {
    const insert = this.storage.prepare(
      `INSERT INTO nodes (snapshot, id, kind, label, attrs, origin, reader, input)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (snapshot, id) DO NOTHING`,
    );
    return this.storage.transaction(() => {
      this.requireRunning(snapshot);
      items.forEach((item, i) => {
        const node = parseOrThrow(NodeDraftSchema, item.node, `node ${i}`);
        requireProvenance(item, `node ${node.id}`);
        const result = insert.run([
          snapshot,
          node.id,
          node.kind,
          node.label,
          JSON.stringify(node.attrs),
          JSON.stringify(node.origin),
          item.reader,
          item.input,
        ]);
        if (result.changes === 0) {
          throw new Error(
            `Node '${node.id}' is already in snapshot '${snapshot}'; a node ID is written once`,
          );
        }
      });
      return items.length;
    });
  }

  /**
   * Writes edges in one transaction, after checking each against the
   * schema. The store computes each edge's ID from its type, ends and
   * origin; an edge whose ID is already there (the same fact read twice) is
   * skipped without error. Returns how many were new.
   */
  writeEdges(snapshot: string, items: readonly EdgeWrite[]): number {
    const insert = this.storage.prepare(
      `INSERT INTO edges (snapshot, id, type, from_id, to_id, confidence, origin, attrs, reader, input)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (snapshot, id) DO NOTHING`,
    );
    return this.storage.transaction(() => {
      this.requireRunning(snapshot);
      let written = 0;
      items.forEach((item, i) => {
        const edge = parseOrThrow(EdgeDraftSchema, item.edge, `edge ${i}`);
        requireProvenance(item, `edge ${i}`);
        written += insert.run([
          snapshot,
          edgeId(edge.type, edge.from, edge.to, edge.origin),
          edge.type,
          edge.from,
          edge.to,
          edge.confidence,
          JSON.stringify(edge.origin),
          JSON.stringify(edge.attrs),
          item.reader,
          item.input,
        ]).changes;
      });
      return written;
    });
  }

  /** Writes findings in one transaction, after checking each against the schema. */
  writeFindings(snapshot: string, findings: readonly FindingDraft[]): number {
    const insert = this.storage.prepare(
      `INSERT INTO findings (snapshot, id, kind, expected, node, related, rule)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    return this.storage.transaction(() => {
      this.requireRunning(snapshot);
      findings.forEach((draft, i) => {
        const f = parseOrThrow(
          FindingSchema,
          { ...draft, snapshot },
          `finding ${i}`,
        );
        insert.run([
          snapshot,
          f.id,
          f.kind,
          f.expected === null ? null : JSON.stringify(f.expected),
          f.node,
          JSON.stringify(f.related),
          f.rule,
        ]);
      });
      return findings.length;
    });
  }

  // Reads -------------------------------------------------------------------

  getNode(snapshot: string, id: string): Node | undefined {
    const row = this.storage
      .prepare("SELECT * FROM nodes WHERE snapshot = ? AND id = ?")
      .get([snapshot, id]);
    return row === undefined ? undefined : nodeOf(row);
  }

  /**
   * The nodes and edges around a focus node, walking edges in both
   * directions up to `hops` away. At most `cap` nodes come back, the focus
   * included, nearest first: hop by hop, and in ID order within one hop, so
   * the same query always gives the same answer. Edges are those between
   * the nodes returned that pass the filters. `truncated` says the cap left
   * out a node the walk could have reached.
   */
  neighborhood(snapshot: string, q: NeighborhoodQuery): Neighborhood {
    if (!Number.isInteger(q.hops) || q.hops < 0) {
      throw new Error(`hops must be a whole number from 0; got ${q.hops}`);
    }
    if (!Number.isInteger(q.cap) || q.cap < 1) {
      throw new Error(`cap must be a whole number from 1; got ${q.cap}`);
    }
    const focus = this.getNode(snapshot, q.node);
    if (focus === undefined) return { nodes: [], edges: [], truncated: false };

    const kept = new Map<string, Node>([[focus.id, focus]]);
    const seen = new Set<string>([focus.id]);
    let frontier = [focus.id];
    let truncated = false;

    for (let hop = 1; hop <= q.hops && frontier.length > 0; hop++) {
      const next = new Set<string>();
      for (const edge of this.edgesTouching(snapshot, frontier, q)) {
        for (const end of [edge.from, edge.to]) {
          if (!seen.has(end)) next.add(end);
        }
      }
      // Only ends that are nodes in this snapshot can be returned.
      const reached = this.nodesByIds(snapshot, [...next].sort());
      for (const id of next) seen.add(id);
      frontier = [];
      for (const node of reached) {
        if (kept.size >= q.cap) {
          truncated = true;
          break;
        }
        kept.set(node.id, node);
        frontier.push(node.id);
      }
      if (truncated) break;
      if (kept.size >= q.cap && hop < q.hops) {
        // Full: anything new one more hop out would be left out.
        truncated = this.reachesNew(snapshot, frontier, seen, q);
        break;
      }
    }

    const ids = [...kept.keys()];
    const edges = this.edgesTouching(snapshot, ids, q).filter(
      (e) => kept.has(e.from) && kept.has(e.to),
    );
    return { nodes: [...kept.values()], edges, truncated };
  }

  /**
   * Finds nodes by what was typed, best match first (decided by Alex): an
   * exact node ID; an exact natural key of any kind ("116" finds
   * `spell:116`); an ID prefix; then label words, best first (BM25), each
   * word matched as a prefix. Typed text is only ever words, never full-text
   * query syntax.
   */
  search(
    snapshot: string,
    q: string,
    opts: { limit?: number } = {},
  ): SearchHit[] {
    const limit = opts.limit ?? 50;
    const text = q.trim();
    if (text === "" || limit < 1) return [];
    const hits: SearchHit[] = [];
    const found = new Set<string>();
    const add = (nodes: readonly Node[], match: SearchHit["match"]): void => {
      for (const node of nodes) {
        if (hits.length >= limit) return;
        if (found.has(node.id)) continue;
        found.add(node.id);
        hits.push({ node, match });
      }
    };

    const exact = this.getNode(snapshot, text);
    if (exact !== undefined) add([exact], "id");
    add(
      this.nodesByIds(
        snapshot,
        NODE_KINDS.map((kind) => `${kind}:${text}`),
      ),
      "key",
    );
    if (hits.length < limit) {
      add(
        this.storage
          .prepare(
            `SELECT * FROM nodes WHERE snapshot = ? AND id >= ? AND id < ?
             ORDER BY id LIMIT ?`,
          )
          .all([snapshot, text, `${text}\u{10FFFF}`, limit + found.size])
          .map(nodeOf),
        "id_prefix",
      );
    }
    const match = ftsQuery(text);
    if (hits.length < limit && match !== undefined) {
      add(
        this.storage
          .prepare(
            `SELECT n.* FROM nodes_fts
               JOIN nodes n ON n.seq = nodes_fts.rowid
              WHERE nodes_fts MATCH ? AND n.snapshot = ?
              ORDER BY bm25(nodes_fts), n.id
              LIMIT ?`,
          )
          .all([match, snapshot, limit + found.size])
          .map(nodeOf),
        "label",
      );
    }
    return hits;
  }

  /** A snapshot's findings, by rule, then kind, then node ID. */
  findings(
    snapshot: string,
    filter: { kind?: FindingKind; rule?: string } = {},
  ): Finding[] {
    const where = ["snapshot = ?"];
    const params: SqlValue[] = [snapshot];
    if (filter.kind !== undefined) {
      where.push("kind = ?");
      params.push(filter.kind);
    }
    if (filter.rule !== undefined) {
      where.push("rule = ?");
      params.push(filter.rule);
    }
    return this.storage
      .prepare(
        `SELECT * FROM findings WHERE ${where.join(" AND ")} ORDER BY rule, kind, node, id`,
      )
      .all(params)
      .map(findingOf);
  }

  // Helpers -----------------------------------------------------------------

  /** Edges with an end among `ids`, passing the query's filters. */
  private edgesTouching(
    snapshot: string,
    ids: readonly string[],
    q: Pick<NeighborhoodQuery, "edgeTypes" | "confidences">,
  ): Edge[] {
    const byId = new Map<string, Edge>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const slots = chunk.map(() => "?").join(", ");
      const where = [
        `snapshot = ?`,
        `(from_id IN (${slots}) OR to_id IN (${slots}))`,
      ];
      const params: SqlValue[] = [snapshot, ...chunk, ...chunk];
      if (q.edgeTypes !== undefined) {
        if (q.edgeTypes.length === 0) return [];
        where.push(`type IN (${q.edgeTypes.map(() => "?").join(", ")})`);
        params.push(...q.edgeTypes);
      }
      if (q.confidences !== undefined) {
        if (q.confidences.length === 0) return [];
        where.push(
          `confidence IN (${q.confidences.map(() => "?").join(", ")})`,
        );
        params.push(...q.confidences);
      }
      for (const row of this.storage
        .prepare(`SELECT * FROM edges WHERE ${where.join(" AND ")} ORDER BY id`)
        .all(params)) {
        const edge = edgeOf(row);
        byId.set(edge.id, edge);
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  /** The nodes among `ids` that exist in the snapshot, in the order given. */
  private nodesByIds(snapshot: string, ids: readonly string[]): Node[] {
    const found = new Map<string, Node>();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      for (const row of this.storage
        .prepare(
          `SELECT * FROM nodes WHERE snapshot = ? AND id IN (${chunk.map(() => "?").join(", ")})`,
        )
        .all([snapshot, ...chunk])) {
        const node = nodeOf(row);
        found.set(node.id, node);
      }
    }
    return ids.flatMap((id) => {
      const node = found.get(id);
      return node === undefined ? [] : [node];
    });
  }

  /** Whether one more hop from `frontier` reaches a node not yet seen. */
  private reachesNew(
    snapshot: string,
    frontier: readonly string[],
    seen: ReadonlySet<string>,
    q: NeighborhoodQuery,
  ): boolean {
    const next = new Set<string>();
    for (const edge of this.edgesTouching(snapshot, frontier, q)) {
      for (const end of [edge.from, edge.to]) if (!seen.has(end)) next.add(end);
    }
    return this.nodesByIds(snapshot, [...next]).length > 0;
  }
}

/** Turns typed text into a full-text query: each word quoted, as a prefix. */
export function ftsQuery(text: string): string | undefined {
  const words = text.match(/[\p{L}\p{N}_]+/gu);
  if (words === null) return undefined;
  return words.map((w) => `"${w}"*`).join(" ");
}

function parseOrThrow<T>(
  schema: {
    safeParse(v: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { path: PropertyKey[]; message: string }[] };
        };
  },
  value: unknown,
  what: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const at = issue === undefined ? "" : issue.path.map(String).join(".");
  throw new Error(
    `${what} is not valid${at === "" ? "" : ` at ${at}`}: ${issue?.message ?? "invalid"}`,
  );
}

function requireProvenance(
  item: { readonly reader: string | null; readonly input: string | null },
  what: string,
): void {
  if ((item.reader === null) !== (item.input === null)) {
    throw new Error(
      `${what}: reader and input are given together, or both null`,
    );
  }
}

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string")
    throw new Error(`Column ${column} is not text`);
  return value;
}

function snapshotOf(row: Row): Snapshot {
  const finished = row["finished_at"];
  return SnapshotSchema.parse({
    id: text(row, "id"),
    status: text(row, "status"),
    profile: {
      id: text(row, "profile_id"),
      coreCommit: text(row, "core_commit"),
    },
    sources: JSON.parse(text(row, "sources")) as unknown,
    startedAt: text(row, "started_at"),
    finishedAt: typeof finished === "string" ? finished : null,
  });
}

function nodeOf(row: Row): Node {
  return {
    id: text(row, "id"),
    kind: text(row, "kind") as Node["kind"],
    label: text(row, "label"),
    attrs: JSON.parse(text(row, "attrs")) as Attrs,
    origin: JSON.parse(text(row, "origin")) as Origin,
    snapshot: text(row, "snapshot"),
  };
}

function edgeOf(row: Row): Edge {
  return {
    id: text(row, "id"),
    type: text(row, "type"),
    from: text(row, "from_id"),
    to: text(row, "to_id"),
    confidence: text(row, "confidence") as Confidence,
    origin: JSON.parse(text(row, "origin")) as Origin,
    attrs: JSON.parse(text(row, "attrs")) as Attrs,
    snapshot: text(row, "snapshot"),
  };
}

function findingOf(row: Row): Finding {
  const expected = row["expected"];
  return {
    id: text(row, "id"),
    kind: text(row, "kind") as FindingKind,
    expected:
      typeof expected === "string"
        ? (JSON.parse(expected) as Finding["expected"])
        : null,
    node: text(row, "node"),
    related: JSON.parse(text(row, "related")) as string[],
    rule: text(row, "rule"),
    snapshot: text(row, "snapshot"),
  };
}
