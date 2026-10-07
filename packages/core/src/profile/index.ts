import { z } from "zod";
import { ConfidenceSchema, EdgeTypeSchema } from "../model/edge.js";
import {
  EXPECTED_PAIRING_MESSAGE,
  ExpectedSchema,
  FindingKindSchema,
  expectedAllowed,
} from "../model/finding.js";
import type { JsonValue } from "../model/json.js";
import { NodeKindSchema, type NodeKind } from "../model/node-kind.js";
import { OverrideLayerNameSchema } from "../model/origin.js";
import { CoreCommitSchema } from "../model/snapshot.js";

/** A profile source's name, e.g. `core` or `mod-ale`. */
export const SourceNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, {
  message: "A source name is lowercase letters, digits and dashes",
});

const CITATION =
  /^([a-z0-9][a-z0-9-]*):((?!\/)(?!.*\\)(?!(?:.*\/)?\.\.\/)[^\s:]+):(\d+)(?:-(\d+))?$/;

/** The parts of a citation. */
export interface ParsedCitation {
  readonly source: string;
  readonly path: string;
  readonly first: number;
  readonly last: number;
}

/** Splits `<source>:<path>:<line>` or `<source>:<path>:<first>-<last>`. */
export function parseCitation(citation: string): ParsedCitation | undefined {
  const m = CITATION.exec(citation);
  if (m === null) return undefined;
  const first = Number(m[3]);
  return {
    source: m[1]!,
    path: m[2]!,
    first,
    last: m[4] === undefined ? first : Number(m[4]),
  };
}

/**
 * A citation into one of the profile's sources (decided per PR #16):
 * `<source>:<path>:<line>` or `<source>:<path>:<first>-<last>`,
 * e.g. `core:src/server/game/Spells/SpellMgr.cpp:1287`. The path is relative
 * to that source's checkout, with forward slashes. Every profile definition
 * carries at least one, because a link Canvas draws must say where in the
 * server source it was learned (architecture principle 2). The source name
 * must be a key of `Profile.sources`; `ProfileSchema` checks that.
 */
export const CitationSchema = z.string().refine(
  (c) => {
    const parsed = parseCitation(c);
    return (
      parsed !== undefined && parsed.first >= 1 && parsed.last >= parsed.first
    );
  },
  {
    message:
      "A citation is '<source>:<relative/path>:<line>' or ':<first>-<last>', forward slashes, lines from 1 and counting forwards",
  },
);
export type Citation = z.infer<typeof CitationSchema>;

const source = z.array(CitationSchema).min(1);

export const DATABASES = ["world", "characters", "auth"] as const;
export const DatabaseSchema = z.enum(DATABASES);
export type Database = z.infer<typeof DatabaseSchema>;

const name = z.string().min(1);

/** A MySQL table the profile knows: its key columns and where it is defined. */
export const TableDefSchema = z.strictObject({
  name,
  primaryKey: z.array(name).min(1),
  source,
});
export type TableDef = z.infer<typeof TableDefSchema>;

/**
 * The layout of one DBC file. `format` is the server's format string, one
 * character per field; fields the server skips are `x` in it. `fields`
 * names each position once known (null where not yet named).
 */
export const DbcLayoutSchema = z
  .strictObject({
    file: z.string().regex(/^[A-Za-z0-9_]+\.dbc$/),
    format: z.string().regex(/^[A-Za-z]+$/),
    fields: z.array(name.nullable()).optional(),
    /** The world-DB table whose rows override or add records, if any. */
    overrideTable: name.optional(),
    /** False for layouts Canvas defined itself and has not yet checked against real files. */
    verified: z.boolean(),
    source,
  })
  .refine(
    (l) => l.fields === undefined || l.fields.length === l.format.length,
    {
      message: "A layout names exactly one field per format character",
      path: ["fields"],
    },
  );
export type DbcLayout = z.infer<typeof DbcLayoutSchema>;

/** Where an edge's target value is read from: a table column or a DBC field. */
export const EdgeLocationSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("mysql"),
    database: DatabaseSchema,
    table: name,
    column: name,
  }),
  z.strictObject({
    source: z.literal("dbc"),
    file: z.string().regex(/^[A-Za-z0-9_]+\.dbc$/),
    field: z.union([name, z.int().nonnegative()]),
  }),
]);
export type EdgeLocation = z.infer<typeof EdgeLocationSchema>;

/** One target an edge decode function produces from a raw value. */
export interface EdgeTarget {
  /** Needed when the definition allows more than one target kind. */
  readonly kind?: NodeKind;
  readonly key: string;
  readonly attrs?: Readonly<Record<string, JsonValue>>;
}

/**
 * Turns a raw column or field value into zero or more targets. Used where
 * the server overloads a value: a negative ID meaning "all ranks", a mask
 * meaning several classes, a type column choosing spell or item.
 */
export type EdgeDecode = (
  value: JsonValue,
  record: Readonly<Record<string, JsonValue>>,
) => readonly EdgeTarget[];

export const CARDINALITIES = ["1:1", "1:N", "N:1", "N:M"] as const;

/** One link type of the profile's edge catalogue. */
export const EdgeDefSchema = z.strictObject({
  type: EdgeTypeSchema,
  from: NodeKindSchema,
  to: z.union([NodeKindSchema, z.array(NodeKindSchema).min(2)]),
  at: EdgeLocationSchema,
  cardinality: z.enum(CARDINALITIES),
  confidence: ConfidenceSchema,
  decode: z
    .custom<EdgeDecode>((v) => typeof v === "function", {
      message: "decode is a function",
    })
    .optional(),
  source,
});
export type EdgeDef = z.infer<typeof EdgeDefSchema>;

/**
 * A code pattern that binds code to data: a registration macro, a script
 * base-class constructor, a Lua register call. `nameArg` says which argument
 * carries the script name; `stringify` means the name is the argument's own
 * text (`#C` in a macro) rather than a string literal.
 */
export const BindingDefSchema = z.strictObject({
  id: name,
  language: z.enum(["cpp", "lua"]),
  form: z.enum(["macro", "constructor", "function_call"]),
  symbol: name,
  nameArg: z.int().nonnegative().optional(),
  stringify: z.boolean().optional(),
  emits: NodeKindSchema,
  confidence: ConfidenceSchema,
  source,
});
export type BindingDef = z.infer<typeof BindingDefSchema>;

/** A C++ function that reads a table (the research's loader map). */
export const LoaderDefSchema = z.strictObject({
  database: DatabaseSchema,
  table: name,
  /** Qualified C++ name, e.g. `SpellMgr::LoadSpellRanks`. */
  function: name,
  source,
});
export type LoaderDef = z.infer<typeof LoaderDefSchema>;

/** One of the layers that change DBC data after it is read, in server load order. */
export const OverrideLayerSchema = z.strictObject({
  layer: OverrideLayerNameSchema,
  order: z.int().nonnegative(),
  confidence: ConfidenceSchema,
  source,
});
export type OverrideLayer = z.infer<typeof OverrideLayerSchema>;

/**
 * Display metadata that makes an expectation a slot on a node card
 * (architecture sections 5 and 9). An optional rule never writes a finding.
 */
export const SlotSchema = z.strictObject({
  label: name,
  order: z.int().nonnegative(),
  optional: z.boolean(),
});
export type Slot = z.infer<typeof SlotSchema>;

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * One attribute test in a rule's selection (decided per PR #16). `attr`
 * names a top-level attribute of the node.
 * - `eq`: the attribute equals the value.
 * - `in`: the attribute equals one of the values.
 * - `mask_any`: the attribute is an integer bitmask sharing at least one bit
 *   with the value (`attr & value` is not 0), e.g. a class mask that
 *   includes Mage (128).
 */
export const AttrMatchSchema = z.discriminatedUnion("op", [
  z.strictObject({ attr: name, op: z.literal("eq"), value: scalar }),
  z.strictObject({
    attr: name,
    op: z.literal("in"),
    value: z.array(scalar).min(1),
  }),
  z.strictObject({
    attr: name,
    op: z.literal("mask_any"),
    value: z.int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
]);
export type AttrMatch = z.infer<typeof AttrMatchSchema>;

/** Which nodes a rule applies to: one kind, narrowed by every `where` test. */
export const SelectSchema = z.strictObject({
  kind: NodeKindSchema,
  where: z.array(AttrMatchSchema).min(1).optional(),
});
export type Select = z.infer<typeof SelectSchema>;

/** Whether a node falls under a rule's selection. */
export function selectMatches(
  select: Select,
  node: {
    readonly kind: string;
    readonly attrs: Readonly<Record<string, JsonValue>>;
  },
): boolean {
  if (node.kind !== select.kind) return false;
  return (select.where ?? []).every((test) => {
    const actual = node.attrs[test.attr];
    switch (test.op) {
      case "eq":
        return actual === test.value;
      case "in":
        return test.value.some((v) => v === actual);
      case "mask_any":
        return (
          typeof actual === "number" &&
          Number.isSafeInteger(actual) &&
          (BigInt(actual) & BigInt(test.value)) !== 0n
        );
    }
  });
}

/**
 * An expectation (architecture section 5). `select` picks the nodes it
 * applies to. `expected` is the edge type (or any-of list) the rule looks
 * for: required for `missing`, optional for `orphan`, absent otherwise.
 * Whenever `expected` is set, `direction` says whether the selected node is
 * that edge's start (`out`) or end (`in`). Only a `missing` rule can carry
 * slot metadata.
 */
export const RuleSchema = z
  .strictObject({
    id: name,
    kind: FindingKindSchema,
    select: SelectSchema,
    expected: ExpectedSchema.optional(),
    direction: z.enum(["out", "in"]).optional(),
    slot: SlotSchema.optional(),
    source,
  })
  .refine((r) => expectedAllowed(r.kind, r.expected !== undefined), {
    message: EXPECTED_PAIRING_MESSAGE,
    path: ["expected"],
  })
  .refine((r) => (r.expected === undefined) === (r.direction === undefined), {
    message:
      "A rule with an expected edge type says its direction, and only then",
    path: ["direction"],
  })
  .refine((r) => r.slot === undefined || r.kind === "missing", {
    message:
      "Only a 'missing' rule can be a slot: an empty slot is its finding",
    path: ["slot"],
  });
export type Rule = z.infer<typeof RuleSchema>;

/** How a node kind is named: the first non-empty of these attrs, else the key. */
export const LabelRuleSchema = z.strictObject({
  kind: NodeKindSchema,
  attrs: z.array(name).min(1),
  source,
});
export type LabelRule = z.infer<typeof LabelRuleSchema>;

/**
 * Everything Canvas knows about one server core (architecture section 5).
 * `sources` names each checkout the profile was learned from, with the
 * commit it is versioned against: `core` (required) and any module that
 * sits at its own commit, such as `mod-ale`. Every citation names one.
 */
export const ProfileSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    sources: z
      .record(SourceNameSchema, CoreCommitSchema)
      .refine((s) => "core" in s, {
        message: "A profile names its 'core' source",
      }),
    databases: z.strictObject({
      world: z.array(TableDefSchema),
      characters: z.array(TableDefSchema),
      auth: z.array(TableDefSchema),
    }),
    dbc: z.array(DbcLayoutSchema),
    edges: z.array(EdgeDefSchema),
    bindings: z.array(BindingDefSchema),
    loaders: z.array(LoaderDefSchema),
    overrides: z.array(OverrideLayerSchema),
    expectations: z.array(RuleSchema),
    labels: z.array(LabelRuleSchema),
    /** Tables that ship in the dump but nothing loads. */
    deadTables: z.array(name),
  })
  .superRefine((profile, ctx) => {
    const parts: [string[], readonly { source: readonly string[] }[]][] = [
      [["databases", "world"], profile.databases.world],
      [["databases", "characters"], profile.databases.characters],
      [["databases", "auth"], profile.databases.auth],
      [["dbc"], profile.dbc],
      [["edges"], profile.edges],
      [["bindings"], profile.bindings],
      [["loaders"], profile.loaders],
      [["overrides"], profile.overrides],
      [["expectations"], profile.expectations],
      [["labels"], profile.labels],
    ];
    for (const [path, defs] of parts) {
      defs.forEach((def, index) => {
        def.source.forEach((citation, c) => {
          const cited = parseCitation(citation)?.source;
          if (cited !== undefined && !(cited in profile.sources)) {
            ctx.addIssue({
              code: "custom",
              message: `Citation '${citation}' names source '${cited}', which is not in sources`,
              path: [...path, index, "source", c],
            });
          }
        });
      });
    }
  });
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * What a snapshot records about the profile it was scanned with: its id and
 * the commit of its `core` source.
 */
export function snapshotProfileOf(profile: Profile): {
  id: string;
  coreCommit: string;
} {
  return { id: profile.id, coreCommit: profile.sources["core"]! };
}
