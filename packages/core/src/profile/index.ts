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
import {
  DATABASES,
  DatabaseSchema,
  OverrideLayerNameSchema,
} from "../model/origin.js";
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

export { DATABASES, DatabaseSchema, type Database } from "../model/origin.js";

const name = z.string().min(1);
const dbcFile = z.string().regex(/^[A-Za-z0-9_]+\.dbc$/, {
  message: "A DBC file name ends in .dbc",
});

/**
 * A MySQL table the profile knows (architecture section 5). Its database is
 * the `databases` group it sits in, never repeated here. `primaryKey` names
 * the columns that identify a row, in key order; for a table with no
 * primary key these are its identifying columns, and the reader orders by
 * them. `localeOf` names the base table of a translation table, e.g.
 * `creature_template_locale` translates `creature_template`.
 */
export const TableDefSchema = z
  .strictObject({
    name,
    primaryKey: z.array(name).min(1),
    localeOf: name.optional(),
    source,
  })
  .refine((t) => new Set(t.primaryKey).size === t.primaryKey.length, {
    message: "A key names each column once",
    path: ["primaryKey"],
  })
  .refine((t) => t.localeOf !== t.name, {
    message: "A table is not a translation of itself",
    path: ["localeOf"],
  });
export type TableDef = z.infer<typeof TableDefSchema>;

/**
 * What Canvas knows about one DBC field, by its position in the format
 * string. `signed` marks an `i` field whose value is a signed number: every
 * `i` is read unsigned, as the server reads it, and a signed one is then
 * reinterpreted. `readAs` marks fields the server skips (`x`) that Canvas
 * still needs as text: `string` for one string offset, `localized` for a
 * whole skipped localized string (16 slots and the flags, 17 `x` in a row,
 * marked at the first). TalentTab's name is one.
 */
export const FieldDefSchema = z.strictObject({
  index: z.int().nonnegative(),
  name,
  signed: z.boolean().optional(),
  readAs: z.enum(["string", "localized"]).optional(),
});
export type FieldDef = z.infer<typeof FieldDefSchema>;

/** Format positions a localized string occupies: 16 slots, then the flags. */
const LOCALIZED_WIDTH = 17;

/**
 * The layout of one DBC file. `format` is the server's format string,
 * verbatim, one character per field. `fields` names the positions Canvas
 * knows, in any order, each at most once.
 */
export const DbcLayoutSchema = z
  .strictObject({
    file: dbcFile,
    format: z.string().regex(/^[A-Za-z]+$/),
    fields: z.array(FieldDefSchema).optional(),
    /** The world-DB table whose rows override or add records, if any. */
    overrideTable: name.optional(),
    /** False for layouts Canvas defined itself and has not yet checked against real files. */
    verified: z.boolean(),
    source,
  })
  .superRefine((layout, ctx) => {
    const seen = new Map<number, number>();
    const names = new Map<string, number>();
    (layout.fields ?? []).forEach((field, f) => {
      const at = (message: string, key: string): void => {
        ctx.addIssue({ code: "custom", message, path: ["fields", f, key] });
      };
      const char = layout.format[field.index];
      if (char === undefined) {
        at(
          `Field ${field.index} is past the end of the ${layout.format.length}-field format`,
          "index",
        );
        return;
      }
      if (seen.has(field.index)) {
        at(`Field ${field.index} is described twice`, "index");
      }
      seen.set(field.index, f);
      if (names.has(field.name))
        at(`Field name '${field.name}' is used twice`, "name");
      names.set(field.name, f);
      if (field.signed === true && char !== "i") {
        at(
          `Only an 'i' field can be signed; field ${field.index} is '${char}'`,
          "signed",
        );
      }
      if (field.readAs !== undefined && char !== "x") {
        at(
          `readAs is for fields the server skips ('x'); field ${field.index} is '${char}'`,
          "readAs",
        );
      }
      if (field.readAs === "localized") {
        const run = layout.format.slice(
          field.index,
          field.index + LOCALIZED_WIDTH,
        );
        if (run !== "x".repeat(LOCALIZED_WIDTH)) {
          at(
            `A skipped localized string is 17 'x' fields (16 slots and flags) from field ${field.index}`,
            "readAs",
          );
        }
      }
    });
  });
export type DbcLayout = z.infer<typeof DbcLayoutSchema>;

/**
 * Where a value is read: a MySQL column, or a DBC field by name or format
 * position (architecture section 5, `Location`).
 */
export const LocationSchema = z.union([
  z.strictObject({ database: DatabaseSchema, table: name, column: name }),
  z.strictObject({
    dbc: dbcFile,
    field: z.union([name, z.int().nonnegative()]),
  }),
]);
export type Location = z.infer<typeof LocationSchema>;

/** One readable text for a location, e.g. `world.trainer_spell.SpellId`. */
export function locationText(at: Location): string {
  return "dbc" in at
    ? `${at.dbc} field ${at.field}`
    : `${at.database}.${at.table}.${at.column}`;
}

/** One target an edge decode function produces from a raw value. */
export interface EdgeTarget {
  /** Needed when the definition allows more than one target kind. */
  readonly kind?: NodeKind;
  readonly key: string;
  readonly attrs?: Readonly<Record<string, JsonValue>>;
}

/**
 * Turns a raw column or field value into zero or more targets. Used where
 * the server overloads a value: a negative ID meaning "all ranks", a type
 * column choosing spell or item.
 */
export type EdgeDecode = (
  value: JsonValue,
  record: Readonly<Record<string, JsonValue>>,
) => readonly EdgeTarget[];

export const CARDINALITIES = ["1:1", "1:N", "N:1", "N:M"] as const;
export type Cardinality = (typeof CARDINALITIES)[number];

/**
 * How many targets one row or record may produce under a cardinality: the
 * right-hand side of `from:to`. The edge engine enforces it: a definition
 * that produces more is a profile bug and fails loudly (architecture
 * section 5).
 */
export function targetsPerRow(cardinality: Cardinality): "one" | "many" {
  return cardinality.endsWith(":1") ? "one" : "many";
}

/**
 * One link type of the profile's edge catalogue, at one location. `at`
 * holds the target's key; `fromAt` holds the start's key, and without it the
 * edge starts at the row or record node itself. With `encoding: "mask"`, the
 * value is a bitmask and each set bit n-1 is a target with ID n; `zero`
 * says whether 0 means every target or none (class and race masks: 0 is
 * all). One type may be defined at several locations; (type, location) is
 * its identity.
 */
export const EdgeDefSchema = z
  .strictObject({
    type: EdgeTypeSchema,
    from: NodeKindSchema,
    to: z.union([NodeKindSchema, z.array(NodeKindSchema).min(2)]),
    at: LocationSchema,
    fromAt: LocationSchema.optional(),
    encoding: z.enum(["id", "mask"]).optional(),
    zero: z.enum(["all", "none"]).optional(),
    cardinality: z.enum(CARDINALITIES),
    confidence: ConfidenceSchema,
    decode: z
      .custom<EdgeDecode>((v) => typeof v === "function", {
        message: "decode is a function",
      })
      .optional(),
    source,
  })
  .refine((e) => (e.encoding === "mask") === (e.zero !== undefined), {
    message:
      "A mask edge says what 0 means (zero: all | none), and only a mask edge does",
    path: ["zero"],
  })
  .refine(
    (e) => e.encoding !== "mask" || targetsPerRow(e.cardinality) === "many",
    {
      message:
        "A mask can set several bits, so its cardinality must allow many targets",
      path: ["cardinality"],
    },
  )
  .refine((e) => e.encoding !== "mask" || e.decode === undefined, {
    message: "A value is either a mask or decoded by a function, not both",
    path: ["decode"],
  });
export type EdgeDef = z.infer<typeof EdgeDefSchema>;

/**
 * A name pattern for a binding's symbol. `*` stands for any run of
 * identifier characters, and `<Name>` for a run the extractor keeps under
 * that name: `AddSC_*`, `Add<Folder>Scripts`. Everything else is literal.
 */
const SYMBOL_PATTERN = /^(?:[A-Za-z0-9_]|\*|<[A-Za-z][A-Za-z0-9]*>)+$/;

/** Compiles a symbol pattern into an anchored regular expression. */
export function compileSymbolPattern(pattern: string): RegExp {
  if (!SYMBOL_PATTERN.test(pattern)) {
    throw new Error(`Not a symbol pattern: ${pattern}`);
  }
  const source = pattern.replace(
    /\*|<([A-Za-z][A-Za-z0-9]*)>/g,
    (_m: string, group: string | undefined) =>
      group === undefined ? "[A-Za-z0-9_]+" : `(?<${group}>[A-Za-z0-9_]+)`,
  );
  return new RegExp(`^${source}$`);
}

export const SymbolSchema = z.union([
  z.string().regex(/^[A-Za-z_][A-Za-z0-9_:]*$/, {
    message: "A symbol is a C++ or Lua name",
  }),
  z.strictObject({
    pattern: z
      .string()
      .regex(SYMBOL_PATTERN, {
        message: "A pattern is identifier characters, * and <Name> parts",
      })
      .refine((p) => /\*|</.test(p), {
        message:
          "A pattern has at least one * or <Name> part; otherwise write the name",
      })
      .refine(
        (p) => {
          const groups = [...p.matchAll(/<([A-Za-z][A-Za-z0-9]*)>/g)].map(
            (m) => m[1],
          );
          return new Set(groups).size === groups.length;
        },
        { message: "Each <Name> part appears once" },
      ),
  }),
]);
export type BindingSymbol = z.infer<typeof SymbolSchema>;

/**
 * What one argument of a binding carries (architecture section 5):
 * - `name`: a script name;
 * - `id`: an ID, or with `list` a list of IDs, of the node kind `kind`
 *   (spell references, ApplySpellFix, LookupEntry(N), "case <id>:", ...);
 * - `event`: an event number, decoded through the hook table `hooks`;
 * - `map`: a Map.dbc ID;
 * - `handler`: the function that handles it.
 */
export const BindingArgSchema = z
  .strictObject({
    index: z.int().nonnegative(),
    holds: z.enum(["name", "id", "event", "map", "handler"]),
    kind: NodeKindSchema.optional(),
    list: z.boolean().optional(),
    hooks: name.optional(),
  })
  .refine((a) => (a.holds === "id") === (a.kind !== undefined), {
    message:
      "An 'id' argument names the node kind it targets, and only it does",
    path: ["kind"],
  })
  .refine((a) => (a.holds === "event") === (a.hooks !== undefined), {
    message: "An 'event' argument names its hook table, and only it does",
    path: ["hooks"],
  })
  .refine((a) => a.list !== true || a.holds === "id", {
    message: "Only an 'id' argument can be a list",
    path: ["list"],
  });
export type BindingArg = z.infer<typeof BindingArgSchema>;

/**
 * Any place code names data (architecture section 5). `symbol` is an exact
 * name or a pattern. `args` says what each interesting argument carries.
 * `bound` says how the script reaches content: through a database column
 * (`db`), a map ID (`map`), or not at all (`global`). `stringify` means a
 * name argument is the argument's own text (`#C` in a macro), not a string.
 */
export const BindingDefSchema = z
  .strictObject({
    id: name,
    language: z.enum(["cpp", "lua"]),
    form: z.enum([
      "macro",
      "constructor",
      "function_call",
      "enum",
      "case",
      "pattern",
    ]),
    symbol: SymbolSchema,
    args: z.array(BindingArgSchema).min(1).optional(),
    bound: z.enum(["db", "map", "global"]),
    stringify: z.boolean().optional(),
    emits: NodeKindSchema,
    confidence: ConfidenceSchema,
    source,
  })
  .refine(
    (b) => {
      const indexes = (b.args ?? []).map((a) => a.index);
      return new Set(indexes).size === indexes.length;
    },
    { message: "Each argument is described once", path: ["args"] },
  )
  .refine(
    (b) =>
      b.stringify !== true || (b.args ?? []).some((a) => a.holds === "name"),
    {
      message: "stringify applies to a name argument, so one must be listed",
      path: ["stringify"],
    },
  )
  .refine(
    (b) => b.bound !== "map" || (b.args ?? []).some((a) => a.holds === "map"),
    {
      message: "A map-bound binding lists the argument that holds the map ID",
      path: ["bound"],
    },
  );
export type BindingDef = z.infer<typeof BindingDefSchema>;

/**
 * One of the Lua engine's event-number-to-name tables (one per enum in its
 * Hooks.h). Lua scripts register handlers by bare number; an `event`
 * argument names the table that decodes it.
 */
export const HookTableSchema = z
  .strictObject({
    id: name,
    events: z
      .array(z.strictObject({ value: z.int().nonnegative(), name }))
      .min(1),
    source,
  })
  .refine(
    (h) => new Set(h.events.map((e) => e.value)).size === h.events.length,
    {
      message: "Each event number appears once",
      path: ["events"],
    },
  )
  .refine(
    (h) => new Set(h.events.map((e) => e.name)).size === h.events.length,
    {
      message: "Each event name appears once",
      path: ["events"],
    },
  );
export type HookTable = z.infer<typeof HookTableSchema>;

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * One attribute test (architecture section 5, `Match`). `attr` names a
 * top-level attribute of the node or row.
 * - `eq`: the attribute equals the value.
 * - `in`: the attribute equals one of the values.
 * - `mask_any`: the attribute is an integer bitmask sharing at least one bit
 *   with the value (`attr & value` is not 0), e.g. a class mask that
 *   includes Mage (128).
 */
export const MatchSchema = z.discriminatedUnion("op", [
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
export type Match = z.infer<typeof MatchSchema>;

/** Whether attributes pass every test. */
export function matchesAll(
  tests: readonly Match[] | undefined,
  attrs: Readonly<Record<string, JsonValue>>,
): boolean {
  return (tests ?? []).every((test) => {
    const actual = attrs[test.attr];
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
 * A column the server's LoadScriptNames reads. Each row with a script name
 * there is a node of `kind` (creature, gameobject, item, ...), and the
 * name's `script_registration` gets a `registers` edge to it. `where`
 * narrows which rows count, for a column shared by several kinds.
 */
export const ScriptNameColumnSchema = z.strictObject({
  database: DatabaseSchema,
  table: name,
  column: name,
  kind: NodeKindSchema,
  where: z.array(MatchSchema).min(1).optional(),
  source,
});
export type ScriptNameColumn = z.infer<typeof ScriptNameColumnSchema>;

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

/** Which nodes a rule applies to: one kind, narrowed by every `where` test. */
export const SelectSchema = z.strictObject({
  kind: NodeKindSchema,
  where: z.array(MatchSchema).min(1).optional(),
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
  return node.kind === select.kind && matchesAll(select.where, node.attrs);
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

/**
 * How a node kind is named: the first non-empty of these attrs, else the
 * key. Every row is kind `row` and every DBC record kind `dbc_record`, so
 * `table` narrows a row rule to one table and `dbc` a record rule to one
 * file.
 */
export const LabelRuleSchema = z
  .strictObject({
    kind: NodeKindSchema,
    table: name.optional(),
    dbc: dbcFile.optional(),
    attrs: z.array(name).min(1),
    source,
  })
  .refine((l) => l.table === undefined || l.kind === "row", {
    message: "Only a rule for kind 'row' can name a table",
    path: ["table"],
  })
  .refine((l) => l.dbc === undefined || l.kind === "dbc_record", {
    message: "Only a rule for kind 'dbc_record' can name a DBC file",
    path: ["dbc"],
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
      .refine((s) => Object.hasOwn(s, "core"), {
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
    scriptNames: z.array(ScriptNameColumnSchema),
    hooks: z.array(HookTableSchema),
    loaders: z.array(LoaderDefSchema),
    overrides: z.array(OverrideLayerSchema),
    expectations: z.array(RuleSchema),
    labels: z.array(LabelRuleSchema),
    /** Tables that ship in the dump but nothing loads. */
    deadTables: z.array(name),
  })
  .superRefine((profile, ctx) => {
    for (const [path, defs] of citedParts(profile)) {
      defs.forEach((def, index) => {
        def.source.forEach((citation, c) => {
          const cited = parseCitation(citation)?.source;
          if (cited !== undefined && !Object.hasOwn(profile.sources, cited)) {
            ctx.addIssue({
              code: "custom",
              message: `Citation '${citation}' names source '${cited}', which is not in sources`,
              path: [...path, index, "source", c],
            });
          }
        });
      });
    }
    // An event argument's hook table must exist.
    const hookIds = new Set(profile.hooks.map((h) => h.id));
    profile.bindings.forEach((binding, b) => {
      (binding.args ?? []).forEach((arg, a) => {
        if (arg.hooks !== undefined && !hookIds.has(arg.hooks)) {
          ctx.addIssue({
            code: "custom",
            message: `Hook table '${arg.hooks}' is not in hooks`,
            path: ["bindings", b, "args", a, "hooks"],
          });
        }
      });
    });
    // A translation table's base table must be in the same database.
    for (const database of DATABASES) {
      const names = new Set(profile.databases[database].map((t) => t.name));
      profile.databases[database].forEach((table, t) => {
        if (table.localeOf !== undefined && !names.has(table.localeOf)) {
          ctx.addIssue({
            code: "custom",
            message: `'${table.name}' translates '${table.localeOf}', which is not a ${database} table`,
            path: ["databases", database, t, "localeOf"],
          });
        }
      });
    }
  });
export type Profile = z.infer<typeof ProfileSchema>;

/** Every cited part of a profile, with the path of its array. */
export function citedParts(
  profile: Pick<
    Profile,
    | "databases"
    | "dbc"
    | "edges"
    | "bindings"
    | "scriptNames"
    | "hooks"
    | "loaders"
    | "overrides"
    | "expectations"
    | "labels"
  >,
): [string[], readonly { readonly source: readonly string[] }[]][] {
  return [
    [["databases", "world"], profile.databases.world],
    [["databases", "characters"], profile.databases.characters],
    [["databases", "auth"], profile.databases.auth],
    [["dbc"], profile.dbc],
    [["edges"], profile.edges],
    [["bindings"], profile.bindings],
    [["scriptNames"], profile.scriptNames],
    [["hooks"], profile.hooks],
    [["loaders"], profile.loaders],
    [["overrides"], profile.overrides],
    [["expectations"], profile.expectations],
    [["labels"], profile.labels],
  ];
}

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
