import type { JsonValue, Location } from "@canvas/core";

/**
 * Fixture cases for the PROF-5a edge definitions (architecture section 11:
 * one per EdgeDef, minimal rows or records in, the expected edges out).
 * They are data, not code: the edge engine (CORE-7) runs them once it
 * merges (Alex, 2026-10-07, option b). Until then CI checks that every
 * definition has a case and that each case is well formed.
 *
 * Node IDs follow core's keys: `row:<database>/<table>/<key values>` in the
 * table's key order, `dbc_record:<file>/<id>`, and `<kind>:<id>` for game
 * nodes. Values imitate the research's examples (class 8 is Mage, mask 128).
 */
export interface EdgeFixture {
  /** The definition exercised: its type and the location it reads. */
  readonly type: string;
  readonly at: Location;
  /** Rows of `at`'s table, or records of `at`'s DBC file, keyed by column or field name. */
  readonly records: readonly Readonly<Record<string, JsonValue>>[];
  /** Every edge the definition should produce from these records, and no other. */
  readonly expected: readonly { readonly from: string; readonly to: string }[];
  readonly note?: string;
}

const world = (table: string, column: string): Location => ({
  database: "world",
  table,
  column,
});
const row = (table: string, ...key: (string | number)[]) =>
  `row:world/${[table, ...key].join("/")}`;

const pci = { race: 1, class: 8, map: 1, zone: 14 };
const skills = { raceMask: 5, classMask: 128, skill: 6, rank: 0 };
const custom = { racemask: 5, classmask: 128, Spell: 133 };
const cast = { raceMask: 5, classMask: 128, spell: 133, note: "Frostbolt" };
const ability = {
  ID: 1,
  SkillLine: 6,
  Spell: 133,
  RaceMask: 5,
  ClassMask: 128,
};
const sla = "dbc_record:SkillLineAbility.dbc/1";

export const edgeFixtures5a: readonly EdgeFixture[] = [
  // Section 1: start rules keyed by IDs.
  {
    type: "applies_to_race",
    at: world("playercreateinfo", "race"),
    records: [pci],
    expected: [{ from: row("playercreateinfo", 1, 8), to: "race:1" }],
  },
  {
    type: "applies_to_class",
    at: world("playercreateinfo", "class"),
    records: [pci],
    expected: [{ from: row("playercreateinfo", 1, 8), to: "player_class:8" }],
  },
  {
    type: "start_location",
    at: world("playercreateinfo", "map"),
    records: [pci],
    expected: [{ from: row("playercreateinfo", 1, 8), to: "map:1" }],
    note: "Map 0 (Eastern Kingdoms) is a real map: this definition needs zero: 'id' once #67 lands, with a case for map 0.",
  },
  {
    type: "start_item",
    at: world("playercreateinfo_item", "itemid"),
    records: [{ race: 1, class: 8, itemid: 35, amount: 1 }],
    expected: [{ from: row("playercreateinfo_item", 1, 8, 35), to: "item:35" }],
  },
  // Section 1: start rules keyed by masks (bit n-1 = id n; 5 = races 1 and 3).
  {
    type: "applies_to_race",
    at: world("playercreateinfo_skills", "raceMask"),
    records: [skills],
    expected: [
      { from: row("playercreateinfo_skills", 5, 128, 6), to: "race:1" },
      { from: row("playercreateinfo_skills", 5, 128, 6), to: "race:3" },
    ],
  },
  {
    type: "applies_to_class",
    at: world("playercreateinfo_skills", "classMask"),
    records: [skills],
    expected: [
      { from: row("playercreateinfo_skills", 5, 128, 6), to: "player_class:8" },
    ],
  },
  {
    type: "start_skill",
    at: world("playercreateinfo_skills", "skill"),
    records: [skills],
    expected: [
      { from: row("playercreateinfo_skills", 5, 128, 6), to: "skill:6" },
    ],
  },
  {
    type: "applies_to_race",
    at: world("playercreateinfo_spell_custom", "racemask"),
    records: [custom],
    expected: [
      { from: row("playercreateinfo_spell_custom", 5, 128, 133), to: "race:1" },
      { from: row("playercreateinfo_spell_custom", 5, 128, 133), to: "race:3" },
    ],
  },
  {
    type: "applies_to_class",
    at: world("playercreateinfo_spell_custom", "classmask"),
    records: [custom],
    expected: [
      {
        from: row("playercreateinfo_spell_custom", 5, 128, 133),
        to: "player_class:8",
      },
    ],
  },
  {
    type: "start_spell_custom",
    at: world("playercreateinfo_spell_custom", "Spell"),
    records: [custom],
    expected: [
      {
        from: row("playercreateinfo_spell_custom", 5, 128, 133),
        to: "spell:133",
      },
    ],
  },
  {
    type: "applies_to_race",
    at: world("playercreateinfo_cast_spell", "raceMask"),
    records: [cast],
    expected: [
      {
        from: row("playercreateinfo_cast_spell", 5, 128, 133, "Frostbolt"),
        to: "race:1",
      },
      {
        from: row("playercreateinfo_cast_spell", 5, 128, 133, "Frostbolt"),
        to: "race:3",
      },
    ],
  },
  {
    type: "applies_to_class",
    at: world("playercreateinfo_cast_spell", "classMask"),
    records: [cast],
    expected: [
      {
        from: row("playercreateinfo_cast_spell", 5, 128, 133, "Frostbolt"),
        to: "player_class:8",
      },
    ],
  },
  {
    type: "start_cast_spell",
    at: world("playercreateinfo_cast_spell", "spell"),
    records: [cast],
    expected: [
      {
        from: row("playercreateinfo_cast_spell", 5, 128, 133, "Frostbolt"),
        to: "spell:133",
      },
    ],
  },
  {
    type: "applies_to_race",
    at: world("playercreateinfo_action", "race"),
    records: [{ race: 1, class: 8, button: 0, action: 133, type: 0 }],
    expected: [{ from: row("playercreateinfo_action", 1, 8, 0), to: "race:1" }],
  },
  {
    type: "applies_to_class",
    at: world("playercreateinfo_action", "class"),
    records: [{ race: 1, class: 8, button: 0, action: 133, type: 0 }],
    expected: [
      { from: row("playercreateinfo_action", 1, 8, 0), to: "player_class:8" },
    ],
  },
  {
    type: "start_action",
    at: world("playercreateinfo_action", "action"),
    records: [
      { race: 1, class: 8, button: 0, action: 133, type: 0 },
      { race: 1, class: 8, button: 1, action: 35, type: 128 },
      { race: 1, class: 8, button: 2, action: 7, type: 64 },
    ],
    expected: [
      { from: row("playercreateinfo_action", 1, 8, 0), to: "spell:133" },
      { from: row("playercreateinfo_action", 1, 8, 1), to: "item:35" },
    ],
    note: "A macro (type 64) names nothing in the data.",
  },
  // Section 1: a skill's own spells, from SkillLineAbility.dbc.
  {
    type: "skill_grants_spell",
    at: { dbc: "SkillLineAbility.dbc", field: "Spell" },
    records: [ability],
    expected: [{ from: "skill:6", to: "spell:133" }],
  },
  {
    type: "applies_to_race",
    at: { dbc: "SkillLineAbility.dbc", field: "RaceMask" },
    records: [ability],
    expected: [
      { from: sla, to: "race:1" },
      { from: sla, to: "race:3" },
    ],
  },
  {
    type: "applies_to_class",
    at: { dbc: "SkillLineAbility.dbc", field: "ClassMask" },
    records: [ability],
    expected: [{ from: sla, to: "player_class:8" }],
  },
  // Section 2: learn chains and crafting.
  {
    type: "spell_requires_spell",
    at: world("spell_required", "req_spell"),
    records: [{ spell_id: 2, req_spell: 1 }],
    expected: [{ from: "spell:2", to: "spell:1" }],
  },
  {
    type: "spell_rank_of",
    at: world("spell_ranks", "first_spell_id"),
    records: [{ first_spell_id: 116, spell_id: 205, rank: 2 }],
    expected: [{ from: "spell:205", to: "spell:116" }],
  },
  {
    type: "craft_extra_requires",
    at: world("skill_extra_item_template", "requiredSpecialization"),
    records: [{ spellId: 2, requiredSpecialization: 3 }],
    expected: [{ from: "spell:2", to: "spell:3" }],
  },
  {
    type: "craft_perfect",
    at: world("skill_perfect_item_template", "requiredSpecialization"),
    records: [{ spellId: 2, requiredSpecialization: 3, perfectItemType: 35 }],
    expected: [{ from: "spell:2", to: "spell:3" }],
  },
  {
    type: "craft_perfect",
    at: world("skill_perfect_item_template", "perfectItemType"),
    records: [{ spellId: 2, requiredSpecialization: 3, perfectItemType: 35 }],
    expected: [{ from: "spell:2", to: "item:35" }],
  },
  // Section 3: trainers.
  {
    type: "creature_trainer",
    at: world("creature_default_trainer", "TrainerId"),
    records: [{ CreatureId: 198, TrainerId: 16 }],
    expected: [{ from: "creature:198", to: "trainer:16" }],
  },
  {
    type: "trainer_teaches",
    at: world("trainer_spell", "SpellId"),
    records: [{ TrainerId: 16, SpellId: 133 }],
    expected: [{ from: "trainer:16", to: "spell:133" }],
  },
  {
    type: "trainer_for_class",
    at: world("trainer", "Requirement"),
    records: [
      { Id: 16, Type: 0, Requirement: 8 },
      { Id: 30, Type: 1, Requirement: 3 },
      { Id: 31, Type: 2, Requirement: 2259 },
      { Id: 32, Type: 0, Requirement: 0 },
    ],
    expected: [
      { from: "trainer:16", to: "player_class:8" },
      { from: "trainer:30", to: "race:3" },
      { from: "trainer:31", to: "spell:2259" },
    ],
    note: "Requirement 0 means no requirement.",
  },
  // Section 5.
  {
    type: "spell_teleport_target",
    at: world("spell_target_position", "MapID"),
    records: [{ ID: 3561, EffectIndex: 0, MapID: 1 }],
    expected: [{ from: "spell:3561", to: "map:1" }],
    note: "Map 0 (Eastern Kingdoms) is a real map: this definition needs zero: 'id' once #67 lands, with a case for map 0.",
  },
  {
    type: "spell_override_row",
    at: world("spell_dbc", "ID"),
    records: [{ ID: 100000 }],
    expected: [{ from: row("spell_dbc", 100000), to: "spell:100000" }],
  },
  // Section 2 (via DBC): one case per effect slot.
  ...[0, 1, 2].flatMap((i): EdgeFixture[] => [
    {
      type: "teaches_spell",
      at: { dbc: "Spell.dbc", field: `EffectTriggerSpell[${i}]` },
      records: [
        { Id: 2, [`Effect[${i}]`]: 36, [`EffectTriggerSpell[${i}]`]: 133 },
        { Id: 3, [`Effect[${i}]`]: 6, [`EffectTriggerSpell[${i}]`]: 133 },
        { Id: 483, [`Effect[${i}]`]: 36, [`EffectTriggerSpell[${i}]`]: 133 },
      ],
      expected: [{ from: "spell:2", to: "spell:133" }],
      note: "Only a LEARN_SPELL effect teaches; spell 483 learns a computed value.",
    },
    {
      type: "spell_grants_skill",
      at: { dbc: "Spell.dbc", field: `EffectMiscValue[${i}]` },
      records: [
        { Id: 2, [`Effect[${i}]`]: 118, [`EffectMiscValue[${i}]`]: 164 },
        { Id: 3, [`Effect[${i}]`]: 40, [`EffectMiscValue[${i}]`]: 0 },
        { Id: 4, [`Effect[${i}]`]: 6, [`EffectMiscValue[${i}]`]: 164 },
      ],
      expected: [
        { from: "spell:2", to: "skill:164" },
        { from: "spell:3", to: "skill:118" },
      ],
      note: "DUAL_WIELD grants the Dual Wield skill (118) whatever the value.",
    },
  ]),
];
