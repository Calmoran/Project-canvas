import type { LoaderDef } from "@canvas/core";

/**
 * Which C++ function reads which world-database table (code research 2.11).
 * Each citation is the line of the query that names the table, or, where
 * the query is a prepared statement or a shared `FROM {}` template, both the
 * line that supplies the table name and the line that runs the query.
 */

const SM = "src/server/game/Spells/SpellMgr.cpp";
const OM = "src/server/game/Globals/ObjectMgr.cpp";
const WDB = "src/server/database/Database/Implementation/WorldDatabase.cpp";
const CTM = "src/server/game/Texts/CreatureTextMgr.cpp";
const SAI = "src/server/game/AI/SmartScripts/SmartScriptMgr.cpp";
const CM = "src/server/game/Conditions/ConditionMgr.cpp";
const GEM = "src/server/game/Events/GameEventMgr.cpp";
const PM = "src/server/game/Pools/PoolMgr.cpp";
const LM = "src/server/game/Loot/LootMgr.cpp";

const at = (path: string, ...lines: (number | string)[]): string[] =>
  lines.map((line) => `core:${path}:${line}`);

function world(
  table: string,
  fn: string,
  source: readonly string[],
): LoaderDef {
  return { database: "world", table, function: fn, source: [...source] };
}

/** One loader function for several tables, each at its own line. */
function each(
  fn: string,
  path: string,
  rows: readonly (readonly [table: string, line: number])[],
): LoaderDef[] {
  return rows.map(([table, line]) => world(table, fn, at(path, line)));
}

const spellMgr: LoaderDef[] = [
  ["creature_immunities", "LoadCreatureImmunities", 68],
  ["spell_ranks", "LoadSpellRanks", 1287],
  ["spell_required", "LoadSpellRequired", 1398],
  ["spell_target_position", "LoadSpellTargetPositions", 1515],
  ["spell_cone", "LoadSpellCones", 1620],
  ["spell_group", "LoadSpellGroups", 1708],
  ["spell_group_stack_rules", "LoadSpellGroupStackRules", 1791],
  ["spell_proc", "LoadSpellProcs", 2013],
  ["spell_bonus_data", "LoadSpellBonuses", 2302],
  ["spell_threat", "LoadSpellThreats", 2343],
  ["spell_mixology", "LoadSpellMixology", 2384],
  ["spell_pet_auras", "LoadSpellPetAuras", 2442],
  ["spell_enchant_proc_data", "LoadSpellEnchantProcData", 2546],
  ["spell_linked_spell", "LoadSpellLinked", 2591],
  ["spell_area", "LoadSpellAreas", 2821],
  ["spell_cooldown_overrides", "LoadSpellCooldownOverrides", 3059],
  ["spell_jump_distance", "LoadSpellJumpDistances", 3134],
  ["spell_custom_attr", "LoadSpellInfoCustomAttributes", 3172],
].map(([table, fn, line]) =>
  world(table as string, `SpellMgr::${fn as string}`, at(SM, line!)),
);

const objectMgrSimple: LoaderDef[] = (
  [
    ["creature_template", "LoadCreatureTemplates", 541],
    ["creature_template_movement", "LoadCreatureTemplates", 541],
    ["creature_template_model", "LoadCreatureTemplateModels", 717],
    ["creature_template_resistance", "LoadCreatureTemplateResistances", 769],
    ["creature_template_spell", "LoadCreatureTemplateSpells", 815],
    ["creature_template_addon", "LoadCreatureTemplateAddons", 861],
    ["creature_template_locale", "LoadCreatureLocales", 401],
    ["creature_addon", "LoadCreatureAddons", 1267],
    ["gameobject_addon", "LoadGameObjectAddons", 1368],
    ["creature_equip_template", "LoadEquipmentTemplates", 1485],
    ["creature_movement_override", "LoadCreatureMovementOverrides", 1564],
    ["creature_model_info", "LoadCreatureModelInfo", 1715],
    ["player_totem_model", "LoadPlayerTotemModels", 1789],
    ["player_shapeshift_model", "LoadPlayerShapeshiftModels", 1848],
    ["linked_respawn", "LoadLinkedRespawn", 1927],
    ["creature_summon_groups", "LoadTempSummons", 2158],
    ["gameobject_summon_groups", "LoadGameObjectSummons", 2246],
    ["creature", "LoadCreatures", 2330],
    ["creature_multispawn", "LoadCreatures", 2501],
    ["creature_sparring", "LoadCreatureSparring", 2751],
    ["gameobject", "LoadGameobjects", 2930],
    ["item_template", "LoadItemTemplates", 3350],
    ["item_template_locale", "LoadItemLocales", 3269],
    ["item_set_names", "LoadItemSetNames", 3988],
    ["item_set_names_locale", "LoadItemSetNameLocales", 3945],
    ["vehicle_template_accessory", "LoadVehicleTemplateAccessories", 4060],
    ["vehicle_accessory", "LoadVehicleAccessories", 4116],
    ["vehicle_seat_addon", "LoadVehicleSeatAddon", 4160],
    ["pet_levelstats", "LoadPetLevelInfo", 4212],
    ["playercreateinfo", "LoadPlayerInfo", 4360],
    ["playercreateinfo_item", "LoadPlayerInfo", 4447],
    ["playercreateinfo_skills", "LoadPlayerInfo", 4518],
    ["playercreateinfo_spell_custom", "LoadPlayerInfo", 4593],
    ["playercreateinfo_cast_spell", "LoadPlayerInfo", 4651],
    ["playercreateinfo_action", "LoadPlayerInfo", 4710],
    ["player_race_stats", "LoadPlayerInfo", 4765],
    ["player_class_stats", "LoadPlayerInfo", 4791],
    ["player_xp_for_level", "LoadPlayerInfo", 4928],
    ["quest_template", "LoadQuests", 5119],
    ["quest_details", "LoadQuests", 5160],
    ["quest_request_items", "LoadQuests", 5183],
    ["quest_offer_reward", "LoadQuests", 5206],
    ["quest_template_addon", "LoadQuests", 5231],
    ["quest_template_locale", "LoadQuestLocales", 5898],
    ["spell_script_names", "LoadSpellScriptNames", 6346],
    ["page_text", "LoadPageTexts", 6475],
    ["page_text_locale", "LoadPageTextLocales", 6527],
    ["instance_template", "LoadInstanceTemplate", 6558],
    ["instance_encounters", "LoadInstanceEncounters", 6609],
    ["npc_text", "LoadGossipText", 6710],
    ["npc_text_locale", "LoadNpcTextLocales", 6782],
    ["areatrigger_involvedrelation", "LoadQuestAreaTriggers", 6814],
    ["quest_greeting", "LoadQuestGreetings", 6891],
    ["quest_greeting_locale", "LoadQuestGreetingsLocales", 6943],
    ["areatrigger_tavern", "LoadTavernAreaTriggers", 7063],
    ["areatrigger_scripts", "LoadAreaTriggerScripts", 7103],
    ["areatrigger", "LoadAreaTriggers", 7251],
    ["areatrigger_teleport", "LoadAreaTriggerTeleports", 7302],
    ["dungeon_access_template", "LoadAccessRequirements", 7389],
    ["dungeon_access_requirements", "LoadAccessRequirements", 7416],
    ["gameobject_template", "LoadGameObjectTemplate", 7774],
    ["gameobject_template_locale", "LoadGameObjectLocales", 7683],
    ["gameobject_template_addon", "LoadGameObjectTemplateAddons", 7958],
    ["exploration_basexp", "LoadExplorationBaseXP", 8036],
    ["pet_name_generation", "LoadPetNames", 8076],
    ["pet_name_generation_locale", "LoadPetNamesLocales", 459],
    ["reputation_reward_rate", "LoadReputationRewardRate", 8163],
    ["creature_onkill_reputation", "LoadReputationOnKill", 8257],
    ["reputation_spillover_template", "LoadReputationSpilloverTemplate", 8325],
    ["points_of_interest", "LoadPointsOfInterest", 8444],
    ["points_of_interest_locale", "LoadPointOfInterestLocales", 501],
    ["quest_poi", "LoadQuestPOI", 8499],
    ["quest_poi_points", "LoadQuestPOI", 8509],
    ["npc_spellclick_spells", "LoadNPCSpellClickSpells", 8572],
    ["spawn_group_template", "LoadSpawnGroupTemplates", 8673],
    ["spawn_group", "LoadSpawnGroups", 8737],
    ["module_string", "LoadModuleStrings", 9465],
    ["module_string_locale", "LoadModuleStringsLocale", 9496],
    ["acore_string", "LoadAcoreStrings", 9557],
    ["skill_fishing_base_level", "LoadFishingBaseSkillLevel", 9607],
    ["game_tele", "LoadGameTele", 9748],
    ["mail_level_reward", "LoadMailLevelRewards", 9888],
    ["trainer", "LoadTrainers", 10006],
    ["trainer_spell", "LoadTrainers", 9950],
    ["trainer_locale", "LoadTrainers", 10047],
    ["creature_default_trainer", "LoadCreatureDefaultTrainers", 10076],
    ["npc_vendor", "LoadVendors", 10157],
    ["gossip_menu", "LoadGossipMenu", 10203],
    ["gossip_menu_option", "LoadGossipMenuItems", 10243],
    ["gossip_menu_option_locale", "LoadGossipMenuItemsLocales", 430],
    ["broadcast_text", "LoadBroadcastTexts", 10532],
    ["broadcast_text_locale", "LoadBroadcastTextLocales", 10615],
    ["creature_classlevelstats", "LoadCreatureClassLevelStats", 10686],
    ["gameobject_questitem", "LoadGameObjectQuestItems", 11055],
    ["creature_questitem", "LoadCreatureQuestItems", 11100],
    ["quest_money_reward", "LoadQuestMoneyRewards", 11147],
  ] as const
).map(([table, fn, line]) => world(table, `ObjectMgr::${fn}`, at(OM, line)));

/**
 * Tables whose name reaches a shared query template (`... FROM {}`) or a
 * prepared statement: the caller's line, then the line naming the table,
 * then the query.
 */
const objectMgrIndirect: LoaderDef[] = [
  // LoadScripts(type) reads the table GetScriptsTableNameByType names.
  world("spell_scripts", "ObjectMgr::LoadSpellScripts", at(OM, 6243, 70, 5948)),
  world("event_scripts", "ObjectMgr::LoadEventScripts", at(OM, 6271, 73, 5948)),
  world(
    "waypoint_scripts",
    "ObjectMgr::LoadWaypointScripts",
    at(OM, 6315, 76, 5948),
  ),
  world("waypoint_data", "ObjectMgr::LoadWaypointScripts", [
    ...at(OM, 6322),
    ...at(WDB, 65),
  ]),
  // LoadQuestRelationsHelper(map, table, ...) runs one query per table.
  world(
    "gameobject_queststarter",
    "ObjectMgr::LoadGameobjectQuestStarters",
    at(OM, 8880, 8841),
  ),
  world(
    "gameobject_questender",
    "ObjectMgr::LoadGameobjectQuestEnders",
    at(OM, 8894, 8841),
  ),
  world(
    "creature_queststarter",
    "ObjectMgr::LoadCreatureQuestStarters",
    at(OM, 8908, 8841),
  ),
  world(
    "creature_questender",
    "ObjectMgr::LoadCreatureQuestEnders",
    at(OM, 8922, 8841),
  ),
  world("pool_quest", "ObjectMgr::LoadQuestRelationsHelper", at(OM, 8841)),
  world("npc_vendor", "ObjectMgr::LoadReferenceVendor", [
    ...at(OM, 10110),
    ...at(WDB, 41),
  ]),
  ...each("ObjectMgr::LoadFactionChangeAchievements", OM, [
    ["player_factionchange_achievement", 10781],
  ]),
  ...each("ObjectMgr::LoadFactionChangeItems", OM, [
    ["player_factionchange_items", 10817],
  ]),
  ...each("ObjectMgr::LoadFactionChangeQuests", OM, [
    ["player_factionchange_quests", 10853],
  ]),
  ...each("ObjectMgr::LoadFactionChangeReputations", OM, [
    ["player_factionchange_reputations", 10889],
  ]),
  ...each("ObjectMgr::LoadFactionChangeSpells", OM, [
    ["player_factionchange_spells", 10925],
  ]),
  ...each("ObjectMgr::LoadFactionChangeTitles", OM, [
    ["player_factionchange_titles", 10961],
  ]),
];

/** The one UNION query that gathers every script name the database uses. */
const scriptNames: LoaderDef[] = each("ObjectMgr::LoadScriptNames", OM, [
  ["achievement_criteria_data", 10458],
  ["battleground_template", 10460],
  ["creature", 10462],
  ["creature_template", 10464],
  ["gameobject", 10466],
  ["gameobject_template", 10468],
  ["item_template", 10470],
  ["areatrigger_scripts", 10472],
  ["spell_script_names", 10474],
  ["transports", 10476],
  ["game_weather", 10478],
  ["conditions", 10480],
  ["outdoorpvp_template", 10482],
  ["instance_template", 10484],
]);

const otherManagers: LoaderDef[] = [
  world("creature_text", "CreatureTextMgr::LoadCreatureTexts", [
    ...at(CTM, 90),
    ...at(WDB, 29),
  ]),
  world(
    "creature_text_locale",
    "CreatureTextMgr::LoadCreatureTextLocales",
    at(CTM, 176),
  ),
  ...["creature_text_options", "creature_text_option_sets"].map((table) =>
    world(table, "CreatureTextMgr::LoadCreatureTextOptions", [
      ...at(CTM, 207),
      ...at(WDB, 30),
    ]),
  ),
  world("smart_scripts", "SmartAIMgr::LoadSmartAIFromDB", [
    ...at(SAI, 124),
    ...at(WDB, 31),
  ]),
  world("waypoints", "SmartWaypointMgr::LoadFromDB", [
    ...at(SAI, 53),
    ...at(WDB, 32),
  ]),
  world("conditions", "ConditionMgr::LoadConditions", at(CM, "1155-1156")),
  ...each("PoolMgr::LoadFromDB", PM, [
    ["pool_template", 594],
    ["pool_creature", 629],
    ["pool_gameobject", 697],
    ["pool_pool", 776],
  ]),
  world("pool_quest", "PoolMgr::LoadFromDB", [...at(PM, 881), ...at(WDB, 26)]),
];

/** GameEventMgr's loaders, each through a prepared statement. */
const gameEvents: LoaderDef[] = (
  [
    ["game_event", "LoadEvents", 331, 89],
    ["game_event_prerequisite", "LoadEventPrerequisiteData", 447, 90],
    ["game_event_creature", "LoadEventCreatureData", 500, 91],
    ["game_event_gameobject", "LoadEventGameObjectData", 550, 92],
    ["creature", "LoadEventModelEquipmentChangeData", 600, 93],
    ["game_event_model_equip", "LoadEventModelEquipmentChangeData", 600, 93],
    ["game_event_creature_quest", "LoadEventQuestData", 659, 94],
    ["game_event_gameobject_quest", "LoadEventGameObjectQuestData", 701, 95],
    ["game_event_quest_condition", "LoadEventQuestConditionData", 743, 96],
    ["game_event_condition", "LoadEventConditionData", 787, 97],
    ["game_event_npcflag", "LoadEventNPCFlags", 879, 98],
    [
      "game_event_seasonal_questrelation",
      "LoadEventSeasonalQuestRelations",
      919,
      99,
    ],
    ["game_event_battleground_holiday", "LoadEventBattlegroundData", 967, 100],
    ["pool_template", "LoadEventPoolData", 1006, 101],
    ["game_event_pool", "LoadEventPoolData", 1006, 101],
    ["game_event_npc_vendor", "LoadEventVendors", 244, 105],
  ] as const
)
  .map(([table, fn, line, statement]) =>
    world(table, `GameEventMgr::${fn}`, [
      ...at(GEM, line),
      ...at(WDB, statement),
    ]),
  )
  .concat([
    world("game_event", "GameEventMgr::LoadHolidayDates", at(GEM, 1152)),
    world("game_event", "GameEventMgr::Initialize", at(GEM, 1211)),
  ]);

/** LootStore::LoadLootTable runs one query per store; the stores name the tables. */
const loot: LoaderDef[] = (
  [
    ["creature_loot_template", 44],
    ["disenchant_loot_template", 45],
    ["fishing_loot_template", 46],
    ["gameobject_loot_template", 47],
    ["item_loot_template", 48],
    ["mail_loot_template", 49],
    ["milling_loot_template", 50],
    ["pickpocketing_loot_template", 51],
    ["prospecting_loot_template", 52],
    ["reference_loot_template", 53],
    ["skinning_loot_template", 54],
    ["spell_loot_template", 55],
    ["player_loot_template", 56],
  ] as const
).map(([table, line]) =>
  world(table, "LootStore::LoadLootTable", at(LM, 151, line)),
);

export const loaders: LoaderDef[] = [
  ...spellMgr,
  ...objectMgrSimple,
  ...objectMgrIndirect,
  ...scriptNames,
  ...otherManagers,
  ...gameEvents,
  ...loot,
];
