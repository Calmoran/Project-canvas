import type { BindingDef, Confidence } from "@canvas/core";

/**
 * The Lua functions mod-ale gives scripts for attaching a handler to a game
 * event (code research 3.12; binding catalogue rows 30-35). Each is cited at
 * its implementation in `GlobalMethods.h` and at its entry in the table that
 * exports it to Lua (`LuaFunctions.cpp:69-87`). A call emits a `lua_handler`.
 *
 * Confidence follows the catalogue: the server matches the call's literal
 * numbers exactly, except a player gossip menu ID, which the script chooses
 * itself and so names no data row (row 34).
 */

const GLOBAL = "mod-ale:src/LuaEngine/methods/GlobalMethods.h";
const EXPORTS = "mod-ale:src/LuaEngine/LuaFunctions.cpp";

export const luaBindings: BindingDef[] = (
  [
    ["RegisterPacketEvent", 935, 69, "exact"],
    ["RegisterServerEvent", 711, 70, "exact"],
    ["RegisterPlayerEvent", 809, 71, "exact"],
    ["RegisterGuildEvent", 846, 72, "exact"],
    ["RegisterGroupEvent", 878, 73, "exact"],
    ["RegisterCreatureEvent", 1200, 74, "exact"],
    ["RegisterUniqueCreatureEvent", 1272, 75, "exact"],
    ["RegisterCreatureGossipEvent", 962, 76, "exact"],
    ["RegisterGameObjectEvent", 1311, 77, "exact"],
    ["RegisterGameObjectGossipEvent", 989, 78, "exact"],
    ["RegisterItemEvent", 1019, 79, "exact"],
    ["RegisterItemGossipEvent", 1046, 80, "exact"],
    ["RegisterPlayerGossipEvent", 1129, 81, "heuristic"],
    ["RegisterBGEvent", 906, 82, "exact"],
    ["RegisterMapEvent", 1073, 83, "exact"],
    ["RegisterInstanceEvent", 1100, 84, "exact"],
    ["RegisterTicketEvent", 1335, 85, "exact"],
    ["RegisterSpellEvent", 1358, 86, "exact"],
    ["RegisterAllCreatureEvent", 1390, 87, "exact"],
  ] as const satisfies readonly (readonly [
    string,
    number,
    number,
    Confidence,
  ])[]
).map(([symbol, line, exported, confidence]) => ({
  id: `lua.call.${symbol}`,
  language: "lua",
  form: "function_call",
  symbol,
  emits: "lua_handler",
  confidence,
  source: [`${GLOBAL}:${line}`, `${EXPORTS}:${exported}`],
}));
