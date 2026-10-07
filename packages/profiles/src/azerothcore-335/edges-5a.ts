import type { EdgeDecode, EdgeDef, JsonValue } from "@canvas/core";

/**
 * Data-layer edges for starting data, learn chains, trainers and
 * spell-to-spell tables (schema research sections 1, 2, 3, 5; PROF-5a).
 * Each reads its target key at `at` and, where the edge starts somewhere
 * other than the row itself, its start key at `fromAt`. Every citation is
 * the line where the server reads that column, at commit 9d9b6049.
 *
 * Start rules stay rows (Alex, 2026-10-07): `applies_to_class` and
 * `applies_to_race` connect a playercreateinfo row to the classes and races
 * it covers, and its content edges (`start_*`) run from the same row.
 */

const OM = "core:src/server/game/Globals/ObjectMgr.cpp";
const SM = "core:src/server/game/Spells/SpellMgr.cpp";

const world = (table: string, column: string) =>
  ({ database: "world", table, column }) as const;

/** A whole number, from a column value that may arrive as a number or text. */
function int(value: JsonValue | undefined): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) ? n : undefined;
}

/**
 * playercreateinfo_action.action: what `type` says it is
 * (`ActionButtonType`, Player.h:220-228). A spell (0x00) or an item (0x80)
 * is content; a macro or an equipment set is the player's own and names
 * nothing in the data.
 */
export const decodeActionButton: EdgeDecode = (value, record) => {
  const action = int(value);
  if (action === undefined || action === 0) return [];
  switch (int(record["type"])) {
    case 0x00:
      return [{ kind: "spell", key: String(action) }];
    case 0x80:
      return [{ kind: "item", key: String(action) }];
    default:
      return [];
  }
};

/**
 * trainer.Requirement: its meaning depends on `Type` (Trainer.h:31-37,
 * checked in Trainer::IsTrainerValidForPlayer, Trainer.cpp:209-228). A
 * class or pet trainer names a class, a mount trainer a race, a tradeskill
 * trainer a spell the player must know; 0 means no requirement.
 */
export const decodeTrainerRequirement: EdgeDecode = (value, record) => {
  const requirement = int(value);
  if (requirement === undefined || requirement === 0) return [];
  const key = String(requirement);
  switch (int(record["Type"])) {
    case 0: // Class
    case 3: // Pet
      return [{ kind: "player_class", key }];
    case 1: // Mount
      return [{ kind: "race", key }];
    case 2: // Tradeskill
      return [{ kind: "spell", key }];
    default:
      return [];
  }
};

/** The race and class edges of a start rule keyed by IDs. */
function startIds(table: string, line: number): EdgeDef[] {
  return [
    {
      type: "applies_to_race",
      from: "row",
      to: "race",
      at: world(table, "race"),
      encoding: "id",
      cardinality: "N:1",
      confidence: "exact",
      source: [`${OM}:${line}`],
    },
    {
      type: "applies_to_class",
      from: "row",
      to: "player_class",
      at: world(table, "class"),
      encoding: "id",
      cardinality: "N:1",
      confidence: "exact",
      source: [`${OM}:${line}`],
    },
  ];
}

/**
 * The race and class edges of a start rule keyed by masks: bit n-1 is
 * race or class n, and 0 means every one (the loader's loops test
 * `mask == 0 || (1 << (id - 1)) & mask`).
 */
function startMasks(
  table: string,
  [raceColumn, classColumn]: readonly [string, string],
  [query, raceLine, classLine]: readonly [number, number, number],
): EdgeDef[] {
  return [
    {
      type: "applies_to_race",
      from: "row",
      to: "race",
      at: world(table, raceColumn),
      encoding: "mask",
      zero: "all",
      cardinality: "N:M",
      confidence: "exact",
      source: [`${OM}:${query}`, `${OM}:${raceLine}`],
    },
    {
      type: "applies_to_class",
      from: "row",
      to: "player_class",
      at: world(table, classColumn),
      encoding: "mask",
      zero: "all",
      cardinality: "N:M",
      confidence: "exact",
      source: [`${OM}:${query}`, `${OM}:${classLine}`],
    },
  ];
}

/** Section 1: what a new character starts with. */
const startingData: EdgeDef[] = [
  ...startIds("playercreateinfo", 4360),
  {
    type: "start_location",
    from: "row",
    to: "map",
    at: world("playercreateinfo", "map"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${OM}:4360`],
  },
  {
    type: "start_item",
    from: "row",
    to: "item",
    at: world("playercreateinfo_item", "itemid"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${OM}:4447`],
  },
  ...startMasks(
    "playercreateinfo_skills",
    ["raceMask", "classMask"],
    [4518, 4563, 4567],
  ),
  {
    type: "start_skill",
    from: "row",
    to: "skill",
    at: world("playercreateinfo_skills", "skill"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${OM}:4518`, `${OM}:4555`],
  },
  ...startMasks(
    "playercreateinfo_spell_custom",
    ["racemask", "classmask"],
    [4593, 4624, 4628],
  ),
  {
    type: "start_spell_custom",
    from: "row",
    to: "spell",
    at: world("playercreateinfo_spell_custom", "Spell"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${OM}:4593`],
  },
  ...startMasks(
    "playercreateinfo_cast_spell",
    ["raceMask", "classMask"],
    [4651, 4682, 4686],
  ),
  {
    type: "start_cast_spell",
    from: "row",
    to: "spell",
    at: world("playercreateinfo_cast_spell", "spell"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${OM}:4651`],
  },
  ...startIds("playercreateinfo_action", 4710),
  {
    type: "start_action",
    from: "row",
    to: ["spell", "item"],
    at: world("playercreateinfo_action", "action"),
    cardinality: "N:1",
    confidence: "exact",
    decode: decodeActionButton,
    source: [
      `${OM}:4710`,
      "core:src/server/game/Entities/Player/Player.h:220-228",
    ],
  },
  {
    // The skill's own spells: SkillLineAbility.dbc, the real source of
    // most class spells (Player::learnSkillRewardedSpells).
    type: "skill_grants_spell",
    from: "skill",
    fromAt: { dbc: "SkillLineAbility.dbc", field: "SkillLine" },
    to: "spell",
    at: { dbc: "SkillLineAbility.dbc", field: "Spell" },
    encoding: "id",
    cardinality: "N:M",
    confidence: "exact",
    source: [
      // The records are grouped by SkillLine; learning a skill walks its group.
      "core:src/server/game/DataStores/DBCStores.cpp:459",
      "core:src/server/game/Entities/Player/Player.cpp:12231-12287",
    ],
  },
  {
    type: "applies_to_race",
    from: "dbc_record",
    to: "race",
    at: { dbc: "SkillLineAbility.dbc", field: "RaceMask" },
    encoding: "mask",
    zero: "all",
    cardinality: "N:M",
    confidence: "exact",
    source: ["core:src/server/game/Entities/Player/Player.cpp:12259"],
  },
  {
    type: "applies_to_class",
    from: "dbc_record",
    to: "player_class",
    at: { dbc: "SkillLineAbility.dbc", field: "ClassMask" },
    encoding: "mask",
    zero: "all",
    cardinality: "N:M",
    confidence: "exact",
    source: ["core:src/server/game/Entities/Player/Player.cpp:12265"],
  },
];

/** Section 2: learn chains and crafting requirements. */
const learnChains: EdgeDef[] = [
  {
    type: "spell_requires_spell",
    from: "spell",
    fromAt: world("spell_required", "spell_id"),
    to: "spell",
    at: world("spell_required", "req_spell"),
    encoding: "id",
    cardinality: "N:M",
    confidence: "exact",
    source: [`${SM}:1398`],
  },
  {
    type: "spell_rank_of",
    from: "spell",
    fromAt: world("spell_ranks", "spell_id"),
    to: "spell",
    at: world("spell_ranks", "first_spell_id"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${SM}:1287`],
  },
  {
    type: "craft_extra_requires",
    from: "spell",
    fromAt: world("skill_extra_item_template", "spellId"),
    to: "spell",
    at: world("skill_extra_item_template", "requiredSpecialization"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: ["core:src/server/game/Skills/SkillExtraItems.cpp:145"],
  },
  {
    type: "craft_perfect",
    from: "spell",
    fromAt: world("skill_perfect_item_template", "spellId"),
    to: "spell",
    at: world("skill_perfect_item_template", "requiredSpecialization"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: ["core:src/server/game/Skills/SkillExtraItems.cpp:59"],
  },
  {
    type: "craft_perfect",
    from: "spell",
    fromAt: world("skill_perfect_item_template", "spellId"),
    to: "item",
    at: world("skill_perfect_item_template", "perfectItemType"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: ["core:src/server/game/Skills/SkillExtraItems.cpp:59"],
  },
];

/** Section 3: trainers. */
const trainers: EdgeDef[] = [
  {
    type: "creature_trainer",
    from: "creature",
    fromAt: world("creature_default_trainer", "CreatureId"),
    to: "trainer",
    at: world("creature_default_trainer", "TrainerId"),
    encoding: "id",
    cardinality: "N:1",
    confidence: "exact",
    source: [`${OM}:10076`],
  },
  {
    type: "trainer_teaches",
    from: "trainer",
    fromAt: world("trainer_spell", "TrainerId"),
    to: "spell",
    at: world("trainer_spell", "SpellId"),
    encoding: "id",
    cardinality: "1:N",
    confidence: "exact",
    source: [`${OM}:9950`, `${OM}:9957-9958`],
  },
  {
    type: "trainer_for_class",
    from: "trainer",
    fromAt: world("trainer", "Id"),
    to: ["player_class", "race", "spell"],
    at: world("trainer", "Requirement"),
    cardinality: "N:1",
    confidence: "exact",
    decode: decodeTrainerRequirement,
    source: [
      `${OM}:10006`,
      "core:src/server/game/Entities/Creature/Trainer.h:31-37",
      "core:src/server/game/Entities/Creature/Trainer.cpp:209-228",
    ],
  },
];

/** Section 5: spell-to-spell tables whose keys need no sign rule. */
const spellTables: EdgeDef[] = [
  {
    type: "spell_teleport_target",
    from: "spell",
    fromAt: world("spell_target_position", "ID"),
    to: "map",
    at: world("spell_target_position", "MapID"),
    encoding: "id",
    cardinality: "1:N",
    confidence: "exact",
    source: [`${SM}:1515`],
  },
  {
    // A spell_dbc row replaces or adds the Spell.dbc record with its ID.
    type: "spell_override_row",
    from: "row",
    to: "spell",
    at: world("spell_dbc", "ID"),
    encoding: "id",
    cardinality: "1:1",
    confidence: "exact",
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:355",
      "core:src/server/shared/DataStores/DBCDatabaseLoader.cpp:42",
    ],
  },
];

/** Effect numbers from `enum SpellEffects` (SharedDefines.h). */
const SPELL_EFFECT_LEARN_SPELL = 36; // SharedDefines.h:802
const SPELL_EFFECT_DUAL_WIELD = 40; // SharedDefines.h:806
const SPELL_EFFECT_SKILL = 118; // SharedDefines.h:884
const SKILL_DUAL_WIELD = 118; // SharedDefines.h:3121

/**
 * Spell.dbc effect slot `i`'s trigger spell, when that effect teaches a
 * spell (Spell::EffectLearnSpell, SpellEffects.cpp:2582). Spells 483 and
 * 55884 learn the cast's computed value instead, which no field holds, so
 * they name nothing here.
 */
export function decodeLearnedSpell(effect: number): EdgeDecode {
  return (value, record) => {
    const id = int(record["Id"]);
    if (id === 483 || id === 55884) return [];
    const spell = int(value);
    if (int(record[`Effect[${effect}]`]) !== SPELL_EFFECT_LEARN_SPELL)
      return [];
    return spell === undefined || spell === 0 ? [] : [{ key: String(spell) }];
  };
}

/**
 * The skill Spell.dbc effect slot `i` grants (SpellMgr::LoadSpellLearnSkills,
 * SpellMgr.cpp:1473-1489): a SKILL effect grants its MiscValue, a
 * DUAL_WIELD effect always grants the Dual Wield skill.
 */
export function decodeGrantedSkill(effect: number): EdgeDecode {
  return (value, record) => {
    switch (int(record[`Effect[${effect}]`])) {
      case SPELL_EFFECT_SKILL: {
        const skill = int(value);
        return skill === undefined || skill === 0
          ? []
          : [{ key: String(skill) }];
      }
      case SPELL_EFFECT_DUAL_WIELD:
        return [{ key: String(SKILL_DUAL_WIELD) }];
      default:
        return [];
    }
  };
}

const SPELL_STORE = "core:src/server/game/DataStores/DBCStores.cpp:355";
/** Where SpellInfo copies each Spell.dbc field the server code then reads. */
const SPELL_INFO = "core:src/server/game/Spells/SpellInfo.cpp";
const DEFINES = "core:src/server/shared/SharedDefines.h";

/** Section 2: spells that teach a spell or a skill through their effects (via DBC). */
const effectEdges: EdgeDef[] = [0, 1, 2].flatMap((i): EdgeDef[] => [
  {
    type: "teaches_spell",
    from: "spell",
    fromAt: { dbc: "Spell.dbc", field: "Id" },
    to: "spell",
    at: { dbc: "Spell.dbc", field: `EffectTriggerSpell[${i}]` },
    cardinality: "N:M",
    confidence: "exact",
    decode: decodeLearnedSpell(i),
    source: [
      SPELL_STORE,
      `${SPELL_INFO}:788`, // Id
      `${SPELL_INFO}:330`, // Effect
      `${SPELL_INFO}:348`, // TriggerSpell
      "core:src/server/game/Spells/SpellEffects.cpp:2582",
      `${DEFINES}:802`,
    ],
  },
  {
    type: "spell_grants_skill",
    from: "spell",
    fromAt: { dbc: "Spell.dbc", field: "Id" },
    to: "skill",
    at: { dbc: "Spell.dbc", field: `EffectMiscValue[${i}]` },
    cardinality: "N:M",
    confidence: "exact",
    decode: decodeGrantedSkill(i),
    source: [
      SPELL_STORE,
      `${SPELL_INFO}:788`, // Id
      `${SPELL_INFO}:330`, // Effect
      `${SPELL_INFO}:340`, // MiscValue
      `${SM}:1473-1489`,
      `${DEFINES}:806`,
      `${DEFINES}:884`,
      `${DEFINES}:3121`,
    ],
  },
]);

export const edges5a: EdgeDef[] = [
  ...effectEdges,
  ...startingData,
  ...learnChains,
  ...trainers,
  ...spellTables,
];
