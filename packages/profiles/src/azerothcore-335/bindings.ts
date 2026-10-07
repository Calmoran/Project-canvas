import type { BindingArg, BindingDef, Confidence } from "@canvas/core";

/**
 * How C++ code registers a script under a name (code research 2.6, 2.7;
 * binding catalogue rows 1, 3-10). A registration emits a
 * `script_registration` node whose name the server later matches against
 * the database's ScriptName columns.
 */

const DEFINES = "src/server/game/Scripting/ScriptDefines";

/**
 * Registration macros. The C preprocessor's `#` operator turns a macro
 * argument into a string, so `RegisterSpellScript(spell_mage_blink)`
 * registers the name "spell_mage_blink": `stringify`. The `...WithArgs`
 * forms take the name as an ordinary argument instead. Every one is bound
 * through the database: the name must appear in a ScriptName column
 * (binding catalogue rows 1, 3, 4, 6). `RegisterInstanceScript` also takes
 * the instance's Map.dbc ID (row 6).
 */
const nameArg = (index: number): BindingArg => ({ index, holds: "name" });
const mapArg = (index: number): BindingArg => ({ index, holds: "map" });
const macros: BindingDef[] = (
  [
    ["RegisterSpellScriptWithArgs", "SpellScriptLoader.h", 87, 1, false],
    ["RegisterSpellScript", "SpellScriptLoader.h", 88, 0, true],
    [
      "RegisterSpellAndAuraScriptPairWithArgs",
      "SpellScriptLoader.h",
      89,
      2,
      false,
    ],
    // The pair is registered under its first class's name (`#script_1`).
    ["RegisterSpellAndAuraScriptPair", "SpellScriptLoader.h", 90, 0, true],
    ["RegisterCreatureAI", "CreatureScript.h", 71, 0, true],
    ["RegisterCreatureAIWithFactory", "CreatureScript.h", 81, 0, true],
    ["RegisterGameObjectAI", "GameObjectScript.h", 77, 0, true],
    ["RegisterGameObjectAIWithFactory", "GameObjectScript.h", 86, 0, true],
    ["RegisterInstanceScript", "InstanceMapScript.h", 45, 0, true],
  ] as const
).map(([symbol, file, line, name, stringify]) => ({
  id: `cpp.macro.${symbol}`,
  language: "cpp",
  form: "macro",
  symbol,
  args:
    symbol === "RegisterInstanceScript"
      ? [nameArg(name), mapArg(1)]
      : [nameArg(name)],
  bound: "db",
  stringify,
  emits: "script_registration",
  confidence: "by-name",
  source: [`core:${DEFINES}/${file}:${line}`],
}));

/**
 * Script base classes whose constructor's first argument is the script
 * name, e.g. `npc_x() : CreatureScript("npc_x") { }`. Confidence follows
 * the binding catalogue: a database-bound script is joined to data by name
 * (`by-name`); a map-bound or global one names no data row, so its
 * registration is the server's own literal (`exact`). How each reaches
 * content (`bound`) follows the same catalogue rows: database-bound by its
 * ScriptName (rows 1, 3-6, 8, 9), map-bound by a Map.dbc ID in its second
 * argument (row 7, and InstanceMapScript's map in row 6), or global (row
 * 10).
 */
const MAP_BOUND = new Set(["WorldMapScript", "BattlegroundMapScript"]);
const constructors: BindingDef[] = (
  [
    // Database-bound: the name must appear in a ScriptName column.
    ["SpellScriptLoader", 28, "by-name"],
    ["CreatureScript", 27, "by-name"],
    ["GameObjectScript", 27, "by-name"],
    ["ItemScript", 26, "by-name"],
    ["InstanceMapScript", 26, "by-name"],
    ["AreaTriggerScript", 26, "by-name"],
    ["OutdoorPvPScript", 26, "by-name"],
    ["BattlegroundScript", 26, "by-name"],
    ["AchievementCriteriaScript", 26, "by-name"],
    ["ConditionScript", 26, "by-name"],
    ["TransportScript", 26, "by-name"],
    ["WeatherScript", 26, "by-name"],
    // Map-bound: the second argument is a Map.dbc ID.
    ["WorldMapScript", 26, "exact"],
    ["BattlegroundMapScript", 26, "exact"],
    // Global: fire for every object of their type.
    ["VehicleScript", 26, "exact"],
    ["DynamicObjectScript", 26, "exact"],
    ["CommandScript", 27, "exact"],
    ["PlayerScript", 225, "exact"],
    ["WorldScript", 46, "exact"],
    ["UnitScript", 57, "exact"],
    ["AllCreatureScript", 26, "exact"],
    ["AllGameObjectScript", 26, "exact"],
    ["AllItemScript", 26, "exact"],
    ["AllMapScript", 39, "exact"],
    ["AllSpellScript", 49, "exact"],
    ["AllBattlegroundScript", 60, "exact"],
    ["AllCommandScript", 36, "exact"],
    ["GlobalScript", 57, "exact"],
    ["ServerScript", 40, "exact"],
    ["DatabaseScript", 35, "exact"],
    ["AccountScript", 41, "exact"],
    ["AchievementScript", 39, "exact"],
    ["ArenaScript", 42, "exact"],
    ["ArenaTeamScript", 38, "exact"],
    ["AuctionHouseScript", 43, "exact"],
    ["BattlefieldScript", 42, "exact"],
    ["FormulaScript", 43, "exact"],
    ["GameEventScript", 35, "exact"],
    ["GroupScript", 42, "exact"],
    ["GuildScript", 45, "exact"],
    ["LootScript", 33, "exact"],
    ["MailScript", 33, "exact"],
    ["MiscScript", 51, "exact"],
    ["MovementHandlerScript", 34, "exact"],
    ["PetScript", 38, "exact"],
    ["TicketScript", 38, "exact"],
    ["WorldObjectScript", 37, "exact"],
    ["ModuleScript", 28, "exact"],
    ["ALEScript", 26, "exact"],
  ] as const satisfies readonly (readonly [string, number, Confidence])[]
).map(([symbol, line, confidence]) => ({
  id: `cpp.ctor.${symbol}`,
  language: "cpp",
  form: "constructor",
  symbol,
  args:
    MAP_BOUND.has(symbol) || symbol === "InstanceMapScript"
      ? [nameArg(0), mapArg(1)]
      : [nameArg(0)],
  bound: MAP_BOUND.has(symbol)
    ? "map"
    : confidence === "by-name"
      ? "db"
      : "global",
  stringify: false,
  emits: "script_registration",
  confidence,
  source: [`core:${DEFINES}/${symbol}.h:${line}`],
}));

/** Inherits AreaTriggerScript's constructor (`using`), so it takes a name too. */
const onlyOnceAreaTrigger: BindingDef = {
  id: "cpp.ctor.OnlyOnceAreaTriggerScript",
  language: "cpp",
  form: "constructor",
  symbol: "OnlyOnceAreaTriggerScript",
  args: [nameArg(0)],
  bound: "db",
  stringify: false,
  emits: "script_registration",
  confidence: "by-name",
  source: [`core:${DEFINES}/AreaTriggerScript.h:35-37`],
};

export const bindings: BindingDef[] = [
  ...macros,
  ...constructors,
  onlyOnceAreaTrigger,
];
