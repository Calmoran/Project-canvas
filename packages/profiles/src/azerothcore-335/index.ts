import type { Profile } from "@canvas/core";
import { dbc } from "./dbc.js";
import { labelRules } from "./labels.js";
import { characterTables, worldTables } from "./tables.js";

/**
 * The clean AzerothCore 3.3.5 profile (architecture section 5). Every
 * citation in it points into the `core` source at the commit below, so a
 * line number means that line at that commit. A newer AzerothCore becomes a
 * new profile version with a documented delta.
 * The parts fill in issue by issue; each definition cites where in the
 * clean source it was learned.
 */
export const azerothcore335: Profile = {
  id: "azerothcore-335",
  sources: {
    // azerothcore-wotlk, 2026-09-06.
    core: "9d9b6049a3ce38f31042899e1c6f4141dc526baa",
  },
  databases: {
    world: worldTables,
    characters: characterTables,
    auth: [],
  },
  dbc,
  edges: [],
  bindings: [],
  loaders: [],
  overrides: [],
  expectations: [],
  labels: labelRules,
  // Schema research 0.5: in the dump, nothing reads these
  // (docs/research/azerothcore-schema.md).
  deadTables: ["npc_trainer", "spell_proc_event"],
};
