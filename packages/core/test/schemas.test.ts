import { describe, expect, test } from "vitest";
import { z } from "zod";
import * as core from "../src/index.js";
import {
  AttrMatchSchema,
  BindingDefSchema,
  CitationSchema,
  ConfidenceSchema,
  DbcLayoutSchema,
  EdgeDefSchema,
  EdgeDraftSchema,
  EdgeSchema,
  FindingSchema,
  LabelRuleSchema,
  LoaderDefSchema,
  NodeDraftSchema,
  NodeKindSchema,
  NodeOrEdgeSchema,
  NodeSchema,
  OriginSchema,
  OverrideLayerSchema,
  ProfileSchema,
  ReadContextSchema,
  ReadPlanSchema,
  ReaderSchema,
  RuleSchema,
  ScanEventSchema,
  SlotSchema,
  SnapshotSchema,
  TableDefSchema,
  edgeId,
  normalizeExpected,
  selectMatches,
  snapshotProfileOf,
  type Origin,
  type Profile,
  type Reader,
} from "../src/index.js";

/**
 * Every type in architecture sections 3, 4 and 5, each with examples that
 * must parse and examples that must be rejected. A contract that accepts
 * anything protects nothing, so the invalid cases matter as much.
 */
interface Case {
  readonly schema: z.ZodType;
  readonly valid: readonly unknown[];
  readonly invalid: readonly unknown[];
}

const cite = ["core:src/server/game/Globals/ObjectMgr.cpp:4567"];
const at = "2026-10-06T12:00:00.000Z";

const fileOrigin: Origin = {
  source: "file",
  path: "src/server/scripts/Spells/spell_mage.cpp",
  line: 42,
  gitRef: "main",
};
const node = {
  id: "spell:116",
  kind: "spell",
  label: "Frostbolt",
  attrs: { school: 16, layers: { name: "dbc" } },
  origin: { source: "dbc", file: "Spell.dbc", recordId: 116 },
};
const edgeDraft = {
  type: "registers",
  from: "script_registration:spell_mage_frostbolt",
  to: "spell:116",
  confidence: "by-name",
  origin: fileOrigin,
  attrs: {},
};
const edge = {
  ...edgeDraft,
  id: edgeId(edgeDraft.type, edgeDraft.from, edgeDraft.to, fileOrigin),
  snapshot: "s1",
};
const rule = {
  id: "spell-has-effect",
  kind: "missing",
  select: { kind: "spell" },
  expected: "has_effect",
  direction: "out",
  slot: { label: "Effects", order: 0, optional: false },
  source: ["core:src/server/shared/DataStores/DBCStructure.h:1637"],
};
function finding(kind: string, expected: unknown): Record<string, unknown> {
  return {
    id: "f1",
    kind,
    expected,
    node: "spell:12345",
    related: [],
    rule: "class-spell-reachable",
    snapshot: "s1",
  };
}
const emptyProfile: Profile = {
  id: "example",
  sources: { core: "9d9b6049" },
  databases: { world: [], characters: [], auth: [] },
  dbc: [],
  edges: [],
  bindings: [],
  loaders: [],
  overrides: [],
  expectations: [],
  labels: [],
  deadTables: [],
};
const plan = {
  reader: "dbc",
  items: [{ id: "Spell.dbc", label: "Spell.dbc", total: null }],
};
const reader: Reader = {
  id: "dbc",
  plan: () => plan,
  read: async function* () {
    /* emits nothing */
  },
};

const cases: Record<string, Case> = {
  NodeKind: {
    schema: NodeKindSchema,
    valid: ["row", "class", "player_class", "loader"],
    invalid: ["Spell", "npc", ""],
  },
  Confidence: {
    schema: ConfidenceSchema,
    valid: ["exact", "by-name", "heuristic", "resolved"],
    invalid: ["certain", "by_name"],
  },
  Origin: {
    schema: OriginSchema,
    valid: [
      {
        source: "mysql",
        database: "world",
        table: "creature_template",
        pk: { entry: 1234 },
      },
      // No pk: the whole table, as for a table node.
      { source: "mysql", database: "world", table: "creature_template" },
      {
        source: "mysql",
        database: "world",
        table: "trainer_spell",
        column: "SpellId",
        pk: { TrainerId: 1, SpellId: 2 },
      },
      { source: "dbc", file: "Spell.dbc", recordId: 116, field: "SpellIconID" },
      { source: "dbc", file: "Spell.dbc", recordId: 116, field: 133 },
      fileOrigin,
      { ...fileOrigin, col: 3 },
      { source: "override", layer: "hardcoded_fix", at: fileOrigin },
      {
        source: "override",
        layer: "spell_dbc",
        at: {
          source: "mysql",
          database: "world",
          table: "spell_dbc",
          pk: { ID: 116 },
        },
      },
    ],
    invalid: [
      {
        source: "mysql",
        database: "world",
        table: "creature_template",
        pk: {},
      },
      {
        source: "mysql",
        database: "world",
        table: "t",
        pk: { a: 1 },
        extra: true,
      },
      // The database is required (decided by Alex).
      { source: "mysql", table: "creature_template", pk: { entry: 1234 } },
      { source: "mysql", database: "logs", table: "t", pk: { a: 1 } },
      { source: "dbc", file: "Spell.dbc", recordId: -1 },
      { ...fileOrigin, line: 0 },
      { source: "file", path: "a.cpp", line: 1 },
      { source: "override", layer: "patch", at: fileOrigin },
      { source: "override", layer: "spell_dbc" },
      {
        source: "override",
        layer: "module_hook",
        at: { source: "override", layer: "hardcoded_fix", at: fileOrigin },
      },
      {
        source: "override",
        layer: "spell_dbc",
        at: { source: "dbc", file: "Spell.dbc", recordId: 116 },
      },
      { source: "override", layer: "spell_dbc", at: { source: "csv" } },
      { source: "override", layer: "spell_dbc", at: fileOrigin, path: "x" },
      { source: "csv" },
    ],
  },
  NodeDraft: {
    schema: NodeDraftSchema,
    valid: [node],
    invalid: [
      { ...node, id: "item:116" },
      { ...node, id: "spell:" },
      { ...node, attrs: { f: () => 1 } },
      { ...node, snapshot: "s1" },
    ],
  },
  Node: {
    schema: NodeSchema,
    valid: [{ ...node, snapshot: "s1" }],
    invalid: [node, { ...node, snapshot: "s1", kind: "creature" }],
  },
  EdgeDraft: {
    schema: EdgeDraftSchema,
    valid: [edgeDraft],
    invalid: [
      { ...edgeDraft, type: "Trainer Teaches" },
      { ...edgeDraft, confidence: "maybe" },
      { ...edgeDraft, id: edge.id },
    ],
  },
  Edge: {
    schema: EdgeSchema,
    valid: [edge],
    invalid: [{ ...edge, id: "not-a-hash" }, edgeDraft],
  },
  Finding: {
    schema: FindingSchema,
    valid: [
      finding("missing", "trainer_teaches"),
      finding("missing", ["start_spell_custom", "trainer_teaches"]),
      finding("orphan", "loads"),
      finding("orphan", null),
      { ...finding("duplicate", null), related: ["file:a.cpp", "file:b.cpp"] },
      finding("dangling", null),
      finding("unapplied", null),
    ],
    invalid: [
      finding("missing", null),
      finding("missing", []),
      finding("missing", ["trainer_teaches", "trainer_teaches"]),
      finding("missing", ["trainer_teaches", "start_spell_custom"]),
      finding("missing", ["trainer_teaches"]),
      finding("missing", ["Not Snake"]),
      finding("dangling", "registers"),
      finding("duplicate", ["registers"]),
      finding("unapplied", "loads"),
      finding("wrong", null),
      { ...finding("orphan", null), severity: "high" },
    ],
  },
  Snapshot: {
    schema: SnapshotSchema,
    valid: [
      {
        id: "s1",
        status: "finished",
        profile: { id: "azerothcore-335", coreCommit: "9d9b6049" },
        sources: { database: "acore_world", gitRef: "main" },
        startedAt: at,
        finishedAt: at,
      },
    ],
    invalid: [
      {
        id: "s1",
        status: "done",
        profile: { id: "p", coreCommit: "9d9b6049" },
        sources: {},
        startedAt: at,
        finishedAt: null,
      },
      {
        id: "s1",
        status: "running",
        profile: { id: "p", coreCommit: "main" },
        sources: {},
        startedAt: at,
        finishedAt: null,
      },
      {
        id: "s1",
        status: "running",
        profile: { id: "p", coreCommit: "9d9b6049" },
        sources: { password: "x" },
        startedAt: at,
        finishedAt: null,
      },
    ],
  },
  ReadPlan: {
    schema: ReadPlanSchema,
    valid: [plan, { reader: "git", items: [] }],
    invalid: [
      { reader: "", items: [] },
      { reader: "dbc", items: [{ id: "x", label: "x", total: -1 }] },
    ],
  },
  NodeOrEdge: {
    schema: NodeOrEdgeSchema,
    valid: [
      { type: "node", node, input: "Spell.dbc" },
      { type: "edge", edge: edgeDraft, input: "src/a.cpp" },
      { type: "reuse", input: "Spell.dbc" },
    ],
    invalid: [
      // A reader names the input of everything it emits (decided by Alex).
      { type: "node", node },
      { type: "edge", edge: edgeDraft },
      { type: "node", node: edgeDraft },
      { type: "node", node, input: "" },
      { type: "reuse" },
      { type: "reuse", input: "Spell.dbc", node },
      { type: "finding", finding: {} },
      node,
    ],
  },
  Reader: {
    schema: ReaderSchema,
    valid: [reader],
    invalid: [{ id: "dbc", plan: () => plan }, { ...reader, id: "" }, null],
  },
  ReadContext: {
    schema: ReadContextSchema,
    valid: [
      {
        snapshot: "s1",
        config: {},
        profile: emptyProfile,
        plan,
        signal: new AbortController().signal,
        progress: () => undefined,
        previousFingerprint: () => undefined,
        recordInput: () => undefined,
      },
    ],
    invalid: [
      {
        snapshot: "s1",
        config: {},
        profile: emptyProfile,
        plan,
        signal: new AbortController().signal,
        progress: () => undefined,
        previousFingerprint: () => undefined,
      },
      {
        snapshot: "s1",
        config: {},
        profile: emptyProfile,
        plan,
        signal: {},
        progress: () => undefined,
      },
      {
        snapshot: "s1",
        profile: emptyProfile,
        plan,
        signal: new AbortController().signal,
        progress: () => undefined,
      },
    ],
  },
  ScanEvent: {
    schema: ScanEventSchema,
    valid: [
      { type: "started", snapshot: "s1", at, readers: ["mysql", "dbc"] },
      {
        type: "reader_progress",
        snapshot: "s1",
        at,
        reader: "dbc",
        item: "Spell.dbc",
        done: 10,
        total: 100,
      },
      {
        type: "reader_done",
        snapshot: "s1",
        at,
        reader: "dbc",
        emitted: { nodes: 5, edges: 7 },
      },
      { type: "phase_changed", snapshot: "s1", at, phase: "resolve" },
      {
        type: "finished",
        snapshot: "s1",
        at,
        totals: { nodes: 5, edges: 7, findings: 1 },
      },
      {
        type: "failed",
        snapshot: "s1",
        at,
        message: "MySQL connection refused",
        reader: "mysql",
      },
    ],
    invalid: [
      { type: "started", snapshot: "s1", at: "yesterday", readers: [] },
      { type: "phase_changed", snapshot: "s1", at, phase: "write" },
      { type: "failed", snapshot: "s1", at, message: "" },
      { type: "paused", snapshot: "s1", at },
    ],
  },
  Citation: {
    schema: CitationSchema,
    valid: [
      "core:src/server/game/DataStores/DBCStores.cpp:355",
      "core:src/a.h:272-383",
      "core:CMakeLists.txt:1",
      "mod-ale:src/LuaEngine/Hooks.h:40",
    ],
    invalid: [
      "src/server/game/DataStores/DBCStores.cpp:355",
      "core:src/a.cpp",
      "core:/abs/a.cpp:1",
      "core:C:/x/a.cpp:1",
      "core:src\\a.cpp:1",
      "core:../outside/a.cpp:1",
      "core:src/a.cpp:0",
      "core:src/a.cpp:9-3",
      "Core:src/a.cpp:1",
      ":src/a.cpp:1",
    ],
  },
  TableDef: {
    schema: TableDefSchema,
    valid: [
      {
        name: "trainer_spell",
        primaryKey: ["TrainerId", "SpellId"],
        source: cite,
      },
    ],
    invalid: [
      { name: "trainer_spell", primaryKey: [], source: cite },
      { name: "trainer_spell", primaryKey: ["TrainerId"], source: [] },
    ],
  },
  DbcLayout: {
    schema: DbcLayoutSchema,
    valid: [
      {
        file: "Spell.dbc",
        format: "nix",
        overrideTable: "spell_dbc",
        verified: true,
        source: cite,
      },
      {
        file: "SpellIcon.dbc",
        format: "ns",
        fields: ["ID", null],
        verified: false,
        source: cite,
      },
    ],
    invalid: [
      {
        file: "Spell.dbc",
        format: "nix",
        fields: ["ID"],
        verified: true,
        source: cite,
      },
      { file: "Spell", format: "n", verified: true, source: cite },
      { file: "Spell.dbc", format: "n1", verified: true, source: cite },
      { file: "Spell.dbc", format: "n", source: cite },
    ],
  },
  EdgeDef: {
    schema: EdgeDefSchema,
    valid: [
      {
        type: "trainer_teaches",
        from: "trainer",
        to: "spell",
        at: {
          source: "mysql",
          database: "world",
          table: "trainer_spell",
          column: "SpellId",
        },
        cardinality: "1:N",
        confidence: "exact",
        source: cite,
      },
      {
        type: "start_action",
        from: "race",
        to: ["spell", "item"],
        at: {
          source: "mysql",
          database: "world",
          table: "playercreateinfo_action",
          column: "action",
        },
        cardinality: "N:M",
        confidence: "exact",
        decode: () => [],
        source: cite,
      },
    ],
    invalid: [
      {
        type: "trainer_teaches",
        from: "trainer",
        to: "npc",
        at: {
          source: "mysql",
          database: "world",
          table: "trainer_spell",
          column: "SpellId",
        },
        cardinality: "1:N",
        confidence: "exact",
        source: cite,
      },
      {
        type: "x",
        from: "spell",
        to: "spell",
        at: { source: "dbc", file: "Spell.dbc", field: 1 },
        cardinality: "many",
        confidence: "exact",
        source: cite,
      },
      {
        type: "x",
        from: "spell",
        to: "spell",
        at: { source: "dbc", file: "Spell.dbc", field: 1 },
        cardinality: "1:1",
        confidence: "exact",
        decode: "x < 0 ? ranks : x",
        source: cite,
      },
    ],
  },
  BindingDef: {
    schema: BindingDefSchema,
    valid: [
      {
        id: "register-spell-script",
        language: "cpp",
        form: "macro",
        symbol: "RegisterSpellScript",
        nameArg: 0,
        stringify: true,
        emits: "script_registration",
        confidence: "by-name",
        source: cite,
      },
    ],
    invalid: [
      {
        id: "x",
        language: "python",
        form: "macro",
        symbol: "X",
        emits: "script_registration",
        confidence: "exact",
        source: cite,
      },
      {
        id: "x",
        language: "cpp",
        form: "macro",
        symbol: "X",
        emits: "script_registration",
        confidence: "exact",
      },
    ],
  },
  LoaderDef: {
    schema: LoaderDefSchema,
    valid: [
      {
        database: "world",
        table: "spell_ranks",
        function: "SpellMgr::LoadSpellRanks",
        source: cite,
      },
    ],
    invalid: [
      { database: "logs", table: "spell_ranks", function: "F", source: cite },
    ],
  },
  OverrideLayer: {
    schema: OverrideLayerSchema,
    valid: [
      { layer: "hardcoded_fix", order: 2, confidence: "exact", source: cite },
    ],
    invalid: [
      { layer: "hardcoded_fix", order: -1, confidence: "exact", source: cite },
    ],
  },
  Slot: {
    schema: SlotSchema,
    valid: [{ label: "Script", order: 4, optional: true }],
    invalid: [{ label: "Script", order: 4 }],
  },
  Rule: {
    schema: RuleSchema,
    valid: [
      rule,
      { ...rule, expected: ["start_spell_custom", "trainer_teaches"] },
      {
        ...rule,
        id: "class-spell-reachable",
        select: {
          kind: "spell",
          where: [
            { attr: "classMask", op: "mask_any", value: 128 },
            { attr: "school", op: "in", value: [16, 64] },
            { attr: "passive", op: "eq", value: false },
          ],
        },
      },
      {
        id: "table-loaded",
        kind: "orphan",
        select: { kind: "table" },
        source: cite,
      },
      {
        id: "table-loaded-by-loader",
        kind: "orphan",
        select: { kind: "table" },
        expected: "loads",
        direction: "in",
        source: cite,
      },
      {
        id: "name-unique",
        kind: "duplicate",
        select: { kind: "script_registration" },
        source: cite,
      },
      {
        ...rule,
        id: "spell-script",
        slot: { label: "Script", order: 4, optional: true },
      },
    ],
    invalid: [
      { ...rule, expected: undefined },
      { ...rule, expected: [] },
      { ...rule, expected: ["has_effect", "has_effect"] },
      { ...rule, expected: ["trainer_teaches", "start_spell_custom"] },
      { ...rule, expected: ["has_effect"] },
      { ...rule, direction: undefined },
      {
        id: "t",
        kind: "orphan",
        select: { kind: "table" },
        direction: "in",
        source: cite,
      },
      { ...rule, select: { kind: "spell", where: [] } },
      {
        ...rule,
        select: {
          kind: "spell",
          where: [{ attr: "classMask", op: "mask_any", value: 0 }],
        },
      },
      {
        ...rule,
        select: {
          kind: "spell",
          where: [{ attr: "classMask", op: "bits", value: 128 }],
        },
      },
      {
        ...rule,
        select: { kind: "spell", where: [{ attr: "x", op: "in", value: [] }] },
      },
      {
        id: "t",
        kind: "dangling",
        select: { kind: "spell" },
        expected: "registers",
        direction: "out",
        source: cite,
      },
      {
        id: "t",
        kind: "orphan",
        select: { kind: "table" },
        expected: "loads",
        direction: "in",
        slot: { label: "x", order: 0, optional: false },
        source: cite,
      },
      { ...rule, severity: "high" },
      { ...rule, source: [] },
    ],
  },
  LabelRule: {
    schema: LabelRuleSchema,
    valid: [{ kind: "creature", attrs: ["name"], source: cite }],
    invalid: [{ kind: "creature", attrs: [], source: cite }],
  },
  Profile: {
    schema: ProfileSchema,
    valid: [emptyProfile],
    invalid: [
      { ...emptyProfile, sources: {} },
      // Only the profile's own entries count, never inherited object
      // properties such as `constructor`.
      {
        ...emptyProfile,
        sources: Object.create({ core: "9d9b6049" }) as object,
      },
      {
        ...emptyProfile,
        expectations: [{ ...rule, source: ["constructor:src/a.cpp:1"] }],
      },
      { ...emptyProfile, sources: { "mod-ale": "c3de794" } },
      { ...emptyProfile, sources: { core: "main" } },
      { ...emptyProfile, coreCommit: "9d9b6049" },
      {
        ...emptyProfile,
        expectations: [
          { ...rule, source: ["mod-ale:src/LuaEngine/Hooks.h:40"] },
        ],
      },
      { ...emptyProfile, databases: { world: [] } },
      { ...emptyProfile, expectations: [{ ...rule, source: [] }] },
    ],
  },
};

describe.each(Object.entries(cases))(
  "%s",
  (_name, { schema, valid, invalid }) => {
    test.each(valid.map((v, i) => [i, v] as const))(
      "accepts valid example %i",
      (_i, value) => {
        const result = schema.safeParse(value);
        expect(result.error?.issues).toBeUndefined();
      },
    );

    test.each(invalid.map((v, i) => [i, v] as const))(
      "rejects invalid example %i",
      (_i, value) => {
        expect(schema.safeParse(value).success).toBe(false);
      },
    );
  },
);

test("an empty example profile validates against the schema", () => {
  expect(ProfileSchema.parse(emptyProfile)).toEqual(emptyProfile);
});

describe("expected has one stored form per meaning", () => {
  test("the schemas accept only that form and never reshape it", () => {
    const sorted = ["start_spell_custom", "trainer_teaches"];
    expect(FindingSchema.parse(finding("missing", sorted)).expected).toEqual(
      sorted,
    );
    // Another writing of the same meaning is refused, not quietly rewritten.
    for (const other of [[...sorted].reverse(), ["trainer_teaches"]]) {
      expect(FindingSchema.safeParse(finding("missing", other)).success).toBe(
        false,
      );
      expect(RuleSchema.safeParse({ ...rule, expected: other }).success).toBe(
        false,
      );
    }
  });

  test("normalizeExpected turns any writing of a meaning into that form", () => {
    expect(normalizeExpected(["trainer_teaches"])).toBe("trainer_teaches");
    expect(normalizeExpected("trainer_teaches")).toBe("trainer_teaches");
    expect(
      normalizeExpected(["trainer_teaches", "start_spell_custom"]),
    ).toEqual(["start_spell_custom", "trainer_teaches"]);
    for (const written of [
      "has_effect",
      ["has_effect"],
      ["b_type", "a_type"],
      ["a_type", "b_type"],
    ]) {
      const normal = normalizeExpected(written);
      expect(RuleSchema.safeParse({ ...rule, expected: normal }).success).toBe(
        true,
      );
    }
  });

  test("normalizeExpected refuses a list that names a type twice", () => {
    expect(() => normalizeExpected(["a_type", "b_type", "a_type"])).toThrow(
      /each edge type once/,
    );
    expect(() => normalizeExpected([])).toThrow(/at least one/);
  });
});

describe("rule selection", () => {
  const spell = (attrs: Record<string, z.core.util.JSONType>) => ({
    kind: "spell",
    attrs,
  });
  const select = {
    kind: "spell" as const,
    where: [{ attr: "classMask", op: "mask_any" as const, value: 128 }],
  };

  test("mask_any matches when the bitmask shares a bit with the value", () => {
    expect(selectMatches(select, spell({ classMask: 128 }))).toBe(true);
    expect(selectMatches(select, spell({ classMask: 128 | 4 }))).toBe(true);
    expect(selectMatches(select, spell({ classMask: 4 }))).toBe(false);
    expect(selectMatches(select, spell({ classMask: "128" }))).toBe(false);
    expect(selectMatches(select, spell({}))).toBe(false);
    // Bit 31: a 32-bit unsigned mask still works (JavaScript's own & is signed).
    expect(
      selectMatches(
        {
          kind: "spell",
          where: [{ attr: "m", op: "mask_any", value: 2 ** 31 }],
        },
        spell({ m: 2 ** 31 + 1 }),
      ),
    ).toBe(true);
  });

  test("eq and in compare exact values, and every test must hold", () => {
    const both = {
      kind: "spell" as const,
      where: [
        { attr: "school", op: "in" as const, value: [16, 64] },
        { attr: "passive", op: "eq" as const, value: false },
      ],
    };
    expect(selectMatches(both, spell({ school: 16, passive: false }))).toBe(
      true,
    );
    expect(selectMatches(both, spell({ school: 16, passive: true }))).toBe(
      false,
    );
    expect(selectMatches(both, spell({ school: 4, passive: false }))).toBe(
      false,
    );
  });

  test("the kind must match first, and no where means every node of the kind", () => {
    expect(selectMatches({ kind: "spell" }, spell({}))).toBe(true);
    expect(selectMatches({ kind: "item" }, spell({}))).toBe(false);
  });

  test("AttrMatch is part of the exported contract", () => {
    expect(
      AttrMatchSchema.safeParse({ attr: "a", op: "eq", value: { nested: 1 } })
        .success,
    ).toBe(false);
  });
});

test("a snapshot records the profile's id and its core source's commit", () => {
  expect(
    snapshotProfileOf({
      ...emptyProfile,
      sources: { core: "9d9b6049", "mod-ale": "c3de794" },
    }),
  ).toEqual({ id: "example", coreCommit: "9d9b6049" });
});

describe("every exported schema converts to JSON Schema", () => {
  // The server turns these schemas into JSON Schema for its routes
  // (fastify-type-provider-zod), so a schema that cannot be converted would
  // break a route. These four hold functions (a reader's methods, an edge
  // decode function), which no JSON Schema can describe; they are never
  // sent over the network.
  const holdsFunctions = new Set([
    "ReaderSchema",
    "ReadContextSchema",
    "EdgeDefSchema",
    "ProfileSchema",
  ]);
  const schemas = Object.entries(core).filter(
    ([name, value]) => name.endsWith("Schema") && value instanceof z.ZodType,
  ) as [string, z.ZodType][];

  test("the list covers the contract", () => {
    expect(schemas.length).toBeGreaterThan(30);
  });

  test.each(schemas.filter(([name]) => !holdsFunctions.has(name)))(
    "%s",
    (_name, schema) => {
      expect(() => z.toJSONSchema(schema, { io: "output" })).not.toThrow();
      expect(() => z.toJSONSchema(schema, { io: "input" })).not.toThrow();
    },
  );

  test.each([...holdsFunctions])("%s holds functions, so it cannot", (name) => {
    const schema = (core as Record<string, unknown>)[name] as z.ZodType;
    expect(() => z.toJSONSchema(schema)).toThrow();
  });
});
