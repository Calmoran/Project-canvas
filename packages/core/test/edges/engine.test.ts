import { describe, expect, test } from "vitest";
import {
  EdgeDefError,
  EdgeEngine,
  type EdgeDef,
  type KnownNodes,
  type NodeDraft,
  type NodeKind,
} from "../../src/index.js";

const cite = ["core:x:1"];
const known = (...ids: string[]): KnownNodes => {
  const set = new Set(ids);
  return {
    has: (id) => set.has(id),
    ofKind: (kind: NodeKind) =>
      [...set].filter((id) => id.startsWith(`${kind}:`)),
  };
};
const row = (
  table: string,
  pk: Record<string, number>,
  attrs: Record<string, unknown>,
): NodeDraft => ({
  id: `row:world/${table}/${Object.values(pk).join("/")}`,
  kind: "row",
  label: table,
  attrs: attrs as NodeDraft["attrs"],
  origin: { source: "mysql", database: "world", table, pk },
});
const at = (table: string, column: string) => ({
  database: "world" as const,
  table,
  column,
});
const def = (d: Partial<EdgeDef> & Pick<EdgeDef, "type" | "at">): EdgeDef => ({
  from: "row",
  to: "spell",
  cardinality: "N:1",
  confidence: "exact",
  source: cite,
  ...d,
});
const engine = (...edges: EdgeDef[]) => new EdgeEngine({ edges, dbc: [] });

describe("id edges", () => {
  const teaches = def({
    type: "trainer_teaches",
    from: "trainer",
    at: at("trainer_spell", "SpellId"),
    fromAt: at("trainer_spell", "TrainerId"),
    cardinality: "1:N",
  });
  const r = row(
    "trainer_spell",
    { TrainerId: 17, SpellId: 116 },
    { TrainerId: 17, SpellId: 116 },
  );

  test("go from the fromAt key to the at key, with the definition's confidence and the column as origin", () => {
    const { edges, pending } = engine(teaches).apply(
      r,
      known("trainer:17", "spell:116"),
    );
    expect(pending).toEqual([]);
    expect(edges).toEqual([
      {
        type: "trainer_teaches",
        from: "trainer:17",
        to: "spell:116",
        confidence: "exact",
        origin: {
          source: "mysql",
          database: "world",
          table: "trainer_spell",
          column: "SpellId",
          pk: { TrainerId: 17, SpellId: 116 },
        },
        attrs: {},
      },
    ]);
  });

  test("a reference to a key not seen is held as pending, not dropped", () => {
    const { edges, pending } = engine(teaches).apply(r, known("trainer:17"));
    expect(edges).toEqual([]);
    expect(pending.map((e) => e.to)).toEqual(["spell:116"]);
  });

  test("0 names nothing, as AzerothCore writes 0 for 'none'", () => {
    const req = def({
      type: "trainer_requires_spell",
      at: at("trainer_spell", "ReqAbility1"),
    });
    const r0 = row(
      "trainer_spell",
      { TrainerId: 17, SpellId: 116 },
      { ReqAbility1: 0 },
    );
    expect(engine(req).apply(r0, known())).toEqual({ edges: [], pending: [] });
  });

  test("without fromAt the edge starts at the row itself", () => {
    const d = def({ type: "row_spell", at: at("trainer_spell", "SpellId") });
    const { edges } = engine(d).apply(r, known(r.id, "spell:116"));
    expect(edges[0]).toMatchObject({ from: r.id, to: "spell:116" });
  });

  test("rows of tables no definition reads give nothing", () => {
    expect(
      engine(teaches).apply(row("other", { id: 1 }, { SpellId: 116 }), known()),
    ).toEqual({
      edges: [],
      pending: [],
    });
  });
});

describe("mask edges (class mask = 1 << (id-1), 0 = all)", () => {
  const classes = def({
    type: "applies_to_class",
    to: "player_class",
    at: at("playercreateinfo_skills", "classMask"),
    encoding: "mask",
    zero: "all",
    cardinality: "N:M",
  });
  const races = def({
    ...classes,
    type: "applies_to_race",
    to: "race",
    at: at("playercreateinfo_skills", "raceMask"),
  });
  const nodes = known("player_class:3", "player_class:8", "race:1", "race:2");
  const skills = (classMask: number, raceMask: number) =>
    row(
      "playercreateinfo_skills",
      { raceMask, classMask, skill: 6 },
      { classMask, raceMask, skill: 6 },
    );

  test("each set bit is one target", () => {
    const r = skills(128 | 4, 1);
    const { edges } = engine(classes).apply(
      r,
      known(r.id, "player_class:3", "player_class:8"),
    );
    expect(edges.map((e) => e.to)).toEqual([
      "player_class:3",
      "player_class:8",
    ]);
  });

  test("0 means every target of the kind when zero is 'all'", () => {
    const r = skills(128, 0);
    const { edges } = engine(races).apply(r, known(r.id, "race:1", "race:2"));
    expect(edges.map((e) => e.to).sort()).toEqual(["race:1", "race:2"]);
  });

  test("0 means none when zero is 'none'", () => {
    const none = def({ ...races, zero: "none" });
    expect(engine(none).apply(skills(128, 0), nodes).edges).toEqual([]);
  });

  test("a value that is not a mask is refused, naming the row", () => {
    const r = row(
      "playercreateinfo_skills",
      { raceMask: 0, classMask: 0, skill: 6 },
      { classMask: "Mage" },
    );
    expect(() => engine(classes).apply(r, nodes)).toThrow(
      /holds "Mage", not a mask/,
    );
  });
});

describe("decode functions", () => {
  test("a sign trick: a negative spell ID means every rank", () => {
    const scripts = def({
      type: "spell_has_script",
      at: at("spell_script_names", "spell_id"),
      decode: (value) => {
        const id = Number(value);
        return id < 0
          ? [{ key: String(-id), attrs: { allRanks: true } }]
          : [{ key: String(id) }];
      },
    });
    const r = row(
      "spell_script_names",
      { spell_id: -116 },
      { spell_id: -116, ScriptName: "spell_x" },
    );
    const { edges } = engine(scripts).apply(r, known(r.id, "spell:116"));
    expect(edges).toEqual([
      expect.objectContaining({ to: "spell:116", attrs: { allRanks: true } }),
    ]);
  });

  test("a decode that names a kind outside the definition's is refused", () => {
    const bad = def({
      type: "start_action",
      to: ["spell", "item"],
      at: at("playercreateinfo_action", "action"),
      cardinality: "N:M",
      decode: () => [{ kind: "creature", key: "1" }],
    });
    const r = row("playercreateinfo_action", { button: 1 }, { action: 116 });
    expect(() => engine(bad).apply(r, known())).toThrow(/kind 'creature'/);
  });

  test("cardinality is enforced: one promised, two produced, is a profile bug", () => {
    const twice = def({
      type: "x_spell",
      at: at("t", "spell"),
      cardinality: "N:1",
      decode: () => [{ key: "1" }, { key: "2" }],
    });
    expect(() =>
      engine(twice).apply(row("t", { id: 1 }, { spell: 5 }), known()),
    ).toThrow(
      /promises one target per row \(N:1\) but row:world\/t\/1 gives 2/,
    );
  });
});

test("a by-name string edge: a ScriptName names a script registration", () => {
  const byName = def({
    type: "uses_script",
    to: "script_registration",
    at: at("creature_template", "ScriptName"),
    confidence: "by-name",
  });
  const r = row(
    "creature_template",
    { entry: 1 },
    { entry: 1, ScriptName: "npc_archmage" },
  );
  const { edges } = engine(byName).apply(
    r,
    known(r.id, "script_registration:npc_archmage"),
  );
  expect(edges).toEqual([
    expect.objectContaining({
      to: "script_registration:npc_archmage",
      confidence: "by-name",
    }),
  ]);
  // An empty name names nothing.
  const blank = row("creature_template", { entry: 2 }, { ScriptName: "" });
  expect(engine(byName).apply(blank, known()).pending).toEqual([]);
});

describe("DBC records", () => {
  const layout = {
    file: "SkillLineAbility.dbc",
    format: "niii",
    fields: [{ index: 2, name: "Spell" }],
    verified: true,
    source: cite,
  };
  const record: NodeDraft = {
    id: "dbc_record:SkillLineAbility.dbc/4021",
    kind: "dbc_record",
    label: "x",
    attrs: { "0": 4021, "1": 6, Spell: 116, "3": 0 },
    origin: { source: "dbc", file: "SkillLineAbility.dbc", recordId: 4021 },
  };
  const grants = (field: string | number): EdgeDef =>
    def({
      type: "skill_grants_spell",
      from: "skill",
      at: { dbc: "SkillLineAbility.dbc", field },
      fromAt: { dbc: "SkillLineAbility.dbc", field: 1 },
      cardinality: "N:M",
    });

  test("read a field by its layout name or by its position", () => {
    for (const field of ["Spell", 2] as const) {
      const e = new EdgeEngine({ edges: [grants(field)], dbc: [layout] });
      const { edges } = e.apply(record, known("skill:6", "spell:116"));
      expect(edges).toEqual([
        expect.objectContaining({
          from: "skill:6",
          to: "spell:116",
          origin: {
            source: "dbc",
            file: "SkillLineAbility.dbc",
            recordId: 4021,
            field,
          },
        }),
      ]);
    }
  });
});

describe("definitions the engine refuses at load", () => {
  test("a from kind that can't be the row itself, without fromAt", () => {
    expect(() =>
      engine(
        def({ type: "t", from: "trainer", at: at("trainer_spell", "SpellId") }),
      ),
    ).toThrow(/'from' must be 'row', not 'trainer'/);
  });

  test("a fromAt in another table", () => {
    expect(() =>
      engine(
        def({
          type: "t",
          from: "trainer",
          at: at("a", "x"),
          fromAt: at("b", "y"),
        }),
      ),
    ).toThrow(EdgeDefError);
  });

  test("a row target, or several kinds, with no decode to say which key", () => {
    expect(() =>
      engine(def({ type: "t", to: "row", at: at("a", "x") })),
    ).toThrow(/needs a decode function/);
    expect(() =>
      engine(
        def({
          type: "t",
          to: ["spell", "item"],
          at: at("a", "x"),
          cardinality: "N:M",
        }),
      ),
    ).toThrow(/several target kinds/);
  });
});
