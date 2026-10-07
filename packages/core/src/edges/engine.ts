import type { EdgeDraft } from "../model/edge.js";
import type { JsonValue } from "../model/json.js";
import type { NodeKind } from "../model/node-kind.js";
import type { NodeDraft } from "../model/node.js";
import type { Origin } from "../model/origin.js";
import {
  locationText,
  targetsPerRow,
  type DbcLayout,
  type EdgeDef,
  type EdgeTarget,
  type Location,
  type Profile,
} from "../profile/index.js";

/**
 * The edge engine (CORE-7): one generic piece of code that turns rows and
 * DBC records into the profile's edges. Edge types are data in the profile
 * (architecture section 3), so adding a kind of link is a profile change,
 * never a code change.
 *
 * For each `EdgeDef` read at a row's table (or a record's file), it takes the
 * value at `at`, turns it into target keys, and emits one edge per target:
 * - `encoding: "id"` (the default): the value is the target's ID; 0, a
 *   negative number or an empty value names nothing (AzerothCore writes 0
 *   for "none"; a negative ID means something only through a decode
 *   function; decided by Alex);
 * - `encoding: "mask"`: each set bit n-1 is the target with ID n, as class
 *   and race masks are (schema research section 1), and `zero` says whether
 *   0 means every target of that kind or none. "Every target" is returned
 *   as a symbolic reference (`toEveryNode`), which the resolver (CORE-12)
 *   expands once game-layer nodes exist (CORE-13; decided by Alex);
 * - `decode`: a profile function for values the server overloads, such as a
 *   negative spell ID meaning "every rank".
 * The edge starts at the node named by `fromAt`'s value, or at the row or
 * record itself without it. Its `confidence` is the definition's and its
 * `origin` points at the table column or DBC field read.
 *
 * Cardinality is enforced: a definition that promises one target per row
 * and produces more is a profile bug, and the engine says so.
 *
 * The engine runs once the readers have emitted their nodes, with a view of
 * which IDs exist. An edge to an ID not seen is not dropped: it is returned
 * as `pending`, for the resolver (CORE-12) to connect or report.
 */
export interface KnownNodes {
  has(id: string): boolean;
}

/**
 * An edge to every node of a kind, from a mask whose 0 means "all". It is
 * not expanded here: the resolver (CORE-12) does that once the game-layer
 * nodes exist (CORE-13).
 */
export interface EveryNodeRef {
  readonly type: string;
  readonly from: string;
  readonly toKind: NodeKind;
  readonly confidence: EdgeDraft["confidence"];
  readonly origin: Origin;
}

export interface EdgeResult {
  /** Edges whose ends both exist. */
  readonly edges: EdgeDraft[];
  /** Edges to a target not seen (or from a start not seen), held for the resolver. */
  readonly pending: EdgeDraft[];
  /** Edges to every node of a kind, for the resolver to expand. */
  readonly toEveryNode: EveryNodeRef[];
}

/** What a value at `at` names: specific targets, or every node of a kind. */
type Targets =
  | { readonly every: false; readonly list: readonly EdgeTarget[] }
  | { readonly every: true };

type DbcAt = Extract<Location, { dbc: string }>;
const isDbc = (at: Location): at is DbcAt => "dbc" in at;

/** Thrown for a definition the engine cannot apply, or a row it breaks. */
export class EdgeDefError extends Error {
  override readonly name = "EdgeDefError";
}

export class EdgeEngine {
  private readonly byTable = new Map<string, EdgeDef[]>();
  private readonly byDbc = new Map<string, EdgeDef[]>();
  private readonly fieldNames = new Map<string, Map<number, string>>();

  constructor(profile: Pick<Profile, "edges" | "dbc">) {
    for (const layout of profile.dbc) {
      this.fieldNames.set(layout.file, namesOf(layout));
    }
    for (const def of profile.edges) {
      check(def);
      const key = isDbc(def.at)
        ? def.at.dbc
        : tableKey(def.at.database, def.at.table);
      const map = isDbc(def.at) ? this.byDbc : this.byTable;
      const list = map.get(key) ?? [];
      list.push(def);
      map.set(key, list);
    }
  }

  /** The edges one row node (kind `row`) or DBC record node produces. */
  apply(node: NodeDraft, known: KnownNodes): EdgeResult {
    const result: EdgeResult = { edges: [], pending: [], toEveryNode: [] };
    const origin = node.origin;
    let defs: readonly EdgeDef[] = [];
    if (origin.source === "mysql") {
      defs = this.byTable.get(tableKey(origin.database, origin.table)) ?? [];
    } else if (origin.source === "dbc") {
      defs = this.byDbc.get(origin.file) ?? [];
    }
    for (const def of defs) {
      const value = this.valueAt(node, def.at);
      const named = targetsOf(def, value, node);
      if (named.every) {
        const from = this.startOf(def, node);
        if (from !== undefined) {
          result.toEveryNode.push({
            type: def.type,
            from,
            toKind: def.to as NodeKind,
            confidence: def.confidence,
            origin: originOf(def.at, node),
          });
        }
        continue;
      }
      const targets = named.list;
      if (targetsPerRow(def.cardinality) === "one" && targets.length > 1) {
        throw new EdgeDefError(
          `${def.type} at ${locationText(def.at)} promises one target per row (${def.cardinality}) but ${node.id} gives ${targets.length}`,
        );
      }
      if (targets.length === 0) continue;
      const from = this.startOf(def, node);
      if (from === undefined) continue;
      for (const target of targets) {
        const kind = target.kind ?? (def.to as NodeKind);
        const edge: EdgeDraft = {
          type: def.type,
          from,
          to: `${kind}:${target.key}`,
          confidence: def.confidence,
          origin: originOf(def.at, node),
          attrs: target.attrs ?? {},
        };
        (known.has(edge.from) && known.has(edge.to)
          ? result.edges
          : result.pending
        ).push(edge);
      }
    }
    return result;
  }

  private valueAt(node: NodeDraft, at: Location): JsonValue | undefined {
    if (!isDbc(at)) return node.attrs[at.column];
    // A record's fields are stored under the layout's name, or the format
    // position as text where the layout names none (CORE-5).
    const name =
      typeof at.field === "string"
        ? at.field
        : (this.fieldNames.get(at.dbc)?.get(at.field) ?? String(at.field));
    return node.attrs[name];
  }

  private startOf(def: EdgeDef, node: NodeDraft): string | undefined {
    if (def.fromAt === undefined) return node.id;
    const value = this.valueAt(node, def.fromAt);
    const key = idKey(value);
    return key === undefined ? undefined : `${def.from}:${key}`;
  }
}

/** Refuses a definition the engine could only apply by guessing. */
function check(def: EdgeDef): void {
  const where = `${def.type} at ${locationText(def.at)}`;
  const own = isDbc(def.at) ? "dbc_record" : "row";
  if (def.fromAt === undefined && def.from !== own) {
    throw new EdgeDefError(
      `${where}: without fromAt the edge starts at the ${own} itself, so 'from' must be '${own}', not '${def.from}'`,
    );
  }
  if (def.fromAt !== undefined && !sameSource(def.at, def.fromAt)) {
    throw new EdgeDefError(
      `${where}: fromAt must be read from the same ${isDbc(def.at) ? "file" : "table"} as at`,
    );
  }
  const kinds = Array.isArray(def.to) ? def.to : [def.to];
  if (
    def.decode === undefined &&
    kinds.some((k) => k === "row" || k === "dbc_record")
  ) {
    throw new EdgeDefError(
      `${where}: a ${kinds.join("/")} target's key names its table or file, so it needs a decode function`,
    );
  }
  if (def.decode === undefined && Array.isArray(def.to)) {
    throw new EdgeDefError(
      `${where}: with several target kinds, a decode function must say which each value is`,
    );
  }
}

function sameSource(a: Location, b: Location): boolean {
  if (isDbc(a) || isDbc(b)) return isDbc(a) && isDbc(b) && a.dbc === b.dbc;
  return a.database === b.database && a.table === b.table;
}

function targetsOf(
  def: EdgeDef,
  value: JsonValue | undefined,
  node: NodeDraft,
): Targets {
  const none: Targets = { every: false, list: [] };
  if (value === undefined || value === null) return none;
  if (def.decode !== undefined) {
    const targets = def.decode(value, node.attrs);
    const kinds = Array.isArray(def.to) ? def.to : [def.to];
    for (const t of targets) {
      if (t.kind !== undefined && !kinds.includes(t.kind)) {
        throw new EdgeDefError(
          `${def.type} at ${locationText(def.at)}: decode gave kind '${t.kind}', which is not among ${kinds.join(", ")}`,
        );
      }
    }
    return { every: false, list: targets };
  }
  if (def.encoding === "mask") {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new EdgeDefError(
        `${def.type} at ${locationText(def.at)}: ${node.id} holds ${JSON.stringify(value)}, not a mask`,
      );
    }
    if (value === 0) return def.zero === "all" ? { every: true } : none;
    const targets: EdgeTarget[] = [];
    let bits = BigInt(value);
    for (let n = 1; bits > 0n; n++, bits >>= 1n) {
      if ((bits & 1n) === 1n) targets.push({ key: String(n) });
    }
    return { every: false, list: targets };
  }
  const key = idKey(value);
  return key === undefined ? none : { every: false, list: [{ key }] };
}

/** A value as an ID key; 0, a negative number and empty text name nothing. */
function idKey(value: JsonValue | undefined): string | undefined {
  if (typeof value === "number") return value <= 0 ? undefined : String(value);
  if (typeof value === "string") return value === "" ? undefined : value;
  return undefined;
}

function originOf(at: Location, node: NodeDraft): Origin {
  const o = node.origin;
  if (isDbc(at)) {
    if (o.source !== "dbc") {
      throw new EdgeDefError(`${node.id} is not a DBC record`);
    }
    return {
      source: "dbc",
      file: at.dbc,
      recordId: o.recordId,
      field: at.field,
    };
  }
  const mysql = at;
  return {
    source: "mysql",
    database: mysql.database,
    table: mysql.table,
    column: mysql.column,
    ...(o.source === "mysql" && o.pk !== undefined ? { pk: o.pk } : {}),
  };
}

function namesOf(layout: Pick<DbcLayout, "fields">): Map<number, string> {
  return new Map((layout.fields ?? []).map((f) => [f.index, f.name]));
}

const tableKey = (database: string, table: string): string =>
  `${database}.${table}`;
