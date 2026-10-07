import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";

const tableNames = (db: "world" | "characters" | "auth") =>
  new Set(azerothcore335.databases[db].map((t) => t.name));

describe("azerothcore335 tables", () => {
  test("every edge reads its source table from a defined TableDef", () => {
    // PROF-5 lands the edges; the check is the contract this issue owes it.
    for (const edge of azerothcore335.edges) {
      if ("dbc" in edge.at) continue;
      expect(
        tableNames(edge.at.database).has(edge.at.table),
        `${edge.type}: no TableDef for ${edge.at.database}.${edge.at.table}`,
      ).toBe(true);
    }
  });

  test("deadTables lists npc_trainer and spell_proc_event", () => {
    expect(azerothcore335.deadTables).toEqual(
      expect.arrayContaining(["npc_trainer", "spell_proc_event"]),
    );
  });
});
