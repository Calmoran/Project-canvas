import type { Profile } from "@canvas/core";
import { bindings } from "./bindings.js";
import { dbc } from "./dbc.js";
import { labelRules } from "./labels.js";
import { loaders } from "./loaders.js";
import { luaBindings } from "./lua-bindings.js";
import { luaHookTables } from "./lua-hooks.js";
import { characterTables, worldTables } from "./tables.js";

/**
 * The clean AzerothCore 3.3.5 profile (architecture section 5). Every
 * citation names one of the sources below and points into it at that
 * source's commit, so a line number means that line at that commit. The Lua
 * engine, mod-ale, is its own repository with its own commit. A newer AzerothCore becomes a
 * new profile version with a documented delta.
 * The parts fill in issue by issue; each definition cites where in the
 * clean source it was learned.
 */
export const azerothcore335: Profile = {
  id: "azerothcore-335",
  sources: {
    // azerothcore-wotlk, 2026-09-06.
    core: "9d9b6049a3ce38f31042899e1c6f4141dc526baa",
    // mod-ale (the Lua engine, modules/mod-ale), 2026-09-06.
    "mod-ale": "c3de79426b03b02d2762536d727f8d40b0f8f24a",
  },
  databases: {
    world: worldTables,
    characters: characterTables,
    auth: [],
  },
  dbc,
  edges: [],
  bindings: [...bindings, ...luaBindings],
  scriptNames: [],
  hooks: luaHookTables,
  loaders,
  overrides: [],
  expectations: [],
  labels: labelRules,
  // Schema research 0.5: in the dump, nothing reads these
  // (docs/research/azerothcore-schema.md).
  deadTables: ["npc_trainer", "spell_proc_event"],
};
