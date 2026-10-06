import { describe, expect, test } from "vitest";
import type { z } from "zod";
import {
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

const cite = ["src/server/game/Globals/ObjectMgr.cpp:4567"];
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
  source: ["src/server/shared/DataStores/DBCStructure.h:1637"],
};
const emptyProfile: Profile = {
  id: "example",
  coreCommit: "9d9b6049",
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
      { source: "mysql", table: "creature_template", pk: { entry: 1234 } },
      {
        source: "mysql",
        table: "trainer_spell",
        column: "SpellId",
        pk: { TrainerId: 1, SpellId: 2 },
      },
      { source: "dbc", file: "Spell.dbc", recordId: 116, field: "SpellIconID" },
      { source: "dbc", file: "Spell.dbc", recordId: 116, field: 133 },
      fileOrigin,
      { ...fileOrigin, col: 3 },
      { source: "override", layer: "hardcoded_fix", path: "x.cpp", line: 69 },
      { source: "override", layer: "spell_dbc" },
    ],
    invalid: [
      { source: "mysql", table: "creature_template", pk: {} },
      { source: "mysql", table: "t", pk: { a: 1 }, extra: true },
      { source: "dbc", file: "Spell.dbc", recordId: -1 },
      { ...fileOrigin, line: 0 },
      { source: "file", path: "a.cpp", line: 1 },
      { source: "override", layer: "patch" },
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
      {
        id: "f1",
        kind: "missing",
        expected: "trainer_teaches",
        node: "spell:12345",
        related: [],
        rule: "class-spell-reachable",
        snapshot: "s1",
      },
      {
        id: "f2",
        kind: "duplicate",
        expected: null,
        node: "script_registration:spell_x",
        related: ["file:a.cpp", "file:b.cpp"],
        rule: "script-name-unique",
        snapshot: "s1",
      },
    ],
    invalid: [
      {
        id: "f",
        kind: "missing",
        expected: null,
        node: "spell:1",
        related: [],
        rule: "r",
        snapshot: "s",
      },
      {
        id: "f",
        kind: "orphan",
        expected: "loads",
        node: "table:t",
        related: [],
        rule: "r",
        snapshot: "s",
      },
      {
        id: "f",
        kind: "wrong",
        expected: null,
        node: "spell:1",
        related: [],
        rule: "r",
        snapshot: "s",
      },
      {
        id: "f",
        kind: "orphan",
        expected: null,
        node: "table:t",
        related: [],
        rule: "r",
        snapshot: "s",
        severity: "high",
      },
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
      { type: "node", node },
      { type: "edge", edge: edgeDraft },
    ],
    invalid: [
      { type: "node", node: edgeDraft },
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
      },
    ],
    invalid: [
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
      "src/server/game/DataStores/DBCStores.cpp:355",
      "src/a.h:272-383",
      "CMakeLists.txt:1",
    ],
    invalid: [
      "src/a.cpp",
      "/abs/a.cpp:1",
      "C:/x/a.cpp:1",
      "src\\a.cpp:1",
      "../outside/a.cpp:1",
      "src/a.cpp:0",
      "src/a.cpp:9-3",
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
      {
        id: "table-loaded",
        kind: "orphan",
        select: { kind: "table" },
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
      {
        id: "t",
        kind: "orphan",
        select: { kind: "table" },
        expected: "loads",
        source: cite,
      },
      {
        id: "t",
        kind: "orphan",
        select: { kind: "table" },
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
      { ...emptyProfile, coreCommit: undefined },
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
