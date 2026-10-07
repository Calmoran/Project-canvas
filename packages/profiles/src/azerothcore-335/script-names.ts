import type { NodeKind, ScriptNameColumn } from "@canvas/core";

/**
 * The 14 columns ObjectMgr::LoadScriptNames gathers script names from, in
 * its one UNION query (ObjectMgr.cpp:10457-10484; schema research section
 * 4; binding catalogue row 12). A row with a name there is bound to the
 * C++ script registered under that name. `kind` is what the row stands for
 * (Alex, 2026-10-07): the game entity where the table is that entity's
 * template or binds one directly, otherwise the row itself.
 */
const OM = "core:src/server/game/Globals/ObjectMgr.cpp";

export const scriptNameColumns: ScriptNameColumn[] = (
  [
    ["achievement_criteria_data", "ScriptName", "row", 10458],
    ["battleground_template", "ScriptName", "row", 10460],
    ["creature", "ScriptName", "row", 10462],
    ["creature_template", "ScriptName", "creature", 10464],
    ["gameobject", "ScriptName", "row", 10466],
    ["gameobject_template", "ScriptName", "gameobject", 10468],
    ["item_template", "ScriptName", "item", 10470],
    ["areatrigger_scripts", "ScriptName", "row", 10472],
    ["spell_script_names", "ScriptName", "spell", 10474],
    ["transports", "ScriptName", "row", 10476],
    ["game_weather", "ScriptName", "row", 10478],
    ["conditions", "ScriptName", "row", 10480],
    ["outdoorpvp_template", "ScriptName", "row", 10482],
    ["instance_template", "script", "map", 10484],
  ] as const satisfies readonly (readonly [string, string, NodeKind, number])[]
).map(([table, column, kind, line]) => ({
  database: "world",
  table,
  column,
  kind,
  // Only criteria data of type 11 (ACHIEVEMENT_CRITERIA_DATA_TYPE_SCRIPT,
  // AchievementMgr.h:70) names a script, as the query's WHERE says.
  ...(table === "achievement_criteria_data"
    ? { where: [{ attr: "type", op: "eq", value: 11 }] as const }
    : {}),
  source:
    table === "achievement_criteria_data"
      ? [
          `${OM}:${line}`,
          "core:src/server/game/Achievements/AchievementMgr.h:70",
        ]
      : [`${OM}:${line}`],
}));
