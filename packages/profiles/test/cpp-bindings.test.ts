import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";

const { bindings, loaders } = azerothcore335;
const binding = (id: string) => bindings.find((b) => b.id === id);

describe("registration macros (code research 2.6)", () => {
  test("a class-name macro registers the stringified first argument", () => {
    expect(binding("cpp.macro.RegisterSpellScript")).toMatchObject({
      form: "macro",
      args: [{ index: 0, holds: "name" }],
      bound: "db",
      stringify: true,
      emits: "script_registration",
      source: [
        "core:src/server/game/Scripting/ScriptDefines/SpellScriptLoader.h:88",
      ],
    });
  });

  test("a ...WithArgs macro takes the name as a plain argument", () => {
    expect(binding("cpp.macro.RegisterSpellScriptWithArgs")).toMatchObject({
      args: [{ index: 1, holds: "name" }],
      stringify: false,
    });
    expect(
      binding("cpp.macro.RegisterSpellAndAuraScriptPairWithArgs"),
    ).toMatchObject({ args: [{ index: 2, holds: "name" }], stringify: false });
  });

  test("a spell and aura pair is named after its first class", () => {
    expect(binding("cpp.macro.RegisterSpellAndAuraScriptPair")).toMatchObject({
      args: [{ index: 0, holds: "name" }],
      stringify: true,
    });
  });

  test("an instance script also carries its Map.dbc ID (catalogue row 6)", () => {
    expect(binding("cpp.macro.RegisterInstanceScript")).toMatchObject({
      args: [
        { index: 0, holds: "name" },
        { index: 1, holds: "map" },
      ],
      bound: "db",
    });
  });

  test("all nine macros are present", () => {
    expect(bindings.filter((b) => b.form === "macro")).toHaveLength(9);
  });
});

describe("script base classes (code research 2.7)", () => {
  const ctors = bindings.filter((b) => b.form === "constructor");

  test("every one takes the script name as its first argument, as written", () => {
    expect(ctors.length).toBe(50);
    for (const c of ctors) {
      expect(c.args?.[0]).toEqual({ index: 0, holds: "name" });
      expect(c.stringify).toBe(false);
    }
  });

  test("database-bound scripts are joined to data by name", () => {
    for (const symbol of [
      "CreatureScript",
      "SpellScriptLoader",
      "ItemScript",
    ]) {
      expect(binding(`cpp.ctor.${symbol}`)?.confidence).toBe("by-name");
    }
  });

  test("each is bound as the catalogue says: by database name, by map, or not at all", () => {
    expect(binding("cpp.ctor.CreatureScript")?.bound).toBe("db");
    expect(binding("cpp.ctor.InstanceMapScript")).toMatchObject({
      bound: "db",
      args: [
        { index: 0, holds: "name" },
        { index: 1, holds: "map" },
      ],
    });
    for (const symbol of ["WorldMapScript", "BattlegroundMapScript"]) {
      expect(binding(`cpp.ctor.${symbol}`)).toMatchObject({
        bound: "map",
        args: [
          { index: 0, holds: "name" },
          { index: 1, holds: "map" },
        ],
      });
    }
    for (const symbol of ["PlayerScript", "GlobalScript", "WorldScript"]) {
      expect(binding(`cpp.ctor.${symbol}`)?.bound).toBe("global");
    }
    // Every database-bound constructor is joined by name, and the reverse.
    for (const c of ctors) {
      expect(c.bound === "db", c.id).toBe(c.confidence === "by-name");
    }
  });

  test("global and map-bound scripts register exactly", () => {
    for (const symbol of ["PlayerScript", "GlobalScript", "WorldMapScript"]) {
      expect(binding(`cpp.ctor.${symbol}`)?.confidence).toBe("exact");
    }
  });
});

describe("loader map (code research 2.11)", () => {
  const loader = (table: string, fn: string) =>
    loaders.find((l) => l.table === table && l.function === fn);

  test("every loader reads the world database through a qualified function", () => {
    for (const l of loaders) {
      expect(l.database).toBe("world");
      expect(l.function).toMatch(/^\w+::\w+$/);
    }
  });

  test("spot checks against the research's table", () => {
    expect(loader("spell_ranks", "SpellMgr::LoadSpellRanks")?.source).toEqual([
      "core:src/server/game/Spells/SpellMgr.cpp:1287",
    ]);
    expect(
      loader("spell_script_names", "ObjectMgr::LoadSpellScriptNames")?.source,
    ).toEqual(["core:src/server/game/Globals/ObjectMgr.cpp:6346"]);
    expect(
      loader("smart_scripts", "SmartAIMgr::LoadSmartAIFromDB"),
    ).toBeDefined();
    expect(
      loader("creature_loot_template", "LootStore::LoadLootTable"),
    ).toBeDefined();
  });

  test("LoadScriptNames reads the 14 ScriptName sources", () => {
    const tables = loaders
      .filter((l) => l.function === "ObjectMgr::LoadScriptNames")
      .map((l) => l.table)
      .sort();
    expect(tables).toEqual(
      [
        "achievement_criteria_data",
        "areatrigger_scripts",
        "battleground_template",
        "conditions",
        "creature",
        "creature_template",
        "game_weather",
        "gameobject",
        "gameobject_template",
        "instance_template",
        "item_template",
        "outdoorpvp_template",
        "spell_script_names",
        "transports",
      ].sort(),
    );
  });

  test("all 13 loot stores are loaded", () => {
    expect(
      loaders.filter((l) => l.function === "LootStore::LoadLootTable"),
    ).toHaveLength(13);
  });
});

describe("spell ID references (code research 1.5c, 1.5d, 2.10)", () => {
  const refs = azerothcore335.bindings.filter((b) => b.emits === "id_literal");

  test("each names the spell its first argument holds, bound through data", () => {
    expect(refs.map((b) => b.id).sort()).toEqual(
      [
        "cpp.call.ApplySpellFix",
        "cpp.call.SpellMgr::AssertSpellInfo",
        "cpp.call.SpellMgr::GetSpellInfo",
        "cpp.call.Unit::RemoveAurasDueToSpell",
        "cpp.call.ValidateSpellInfo",
        "cpp.case.SpellMgr::LoadSpellInfoCustomAttributes",
      ].sort(),
    );
    for (const b of refs) {
      expect(b).toMatchObject({
        language: "cpp",
        bound: "db",
        confidence: "exact",
      });
      expect(b.args?.[0]).toMatchObject({
        index: 0,
        holds: "id",
        kind: "spell",
      });
    }
  });

  test("ID lists are marked as lists", () => {
    const listed = refs
      .filter((b) => b.args?.[0]?.list === true)
      .map((b) => b.symbol);
    expect(listed).toEqual(["ApplySpellFix", "ValidateSpellInfo"]);
  });

  test("the custom-attribute cases are read inside their loader", () => {
    expect(refs.find((b) => b.form === "case")).toMatchObject({
      symbol: "SpellMgr::LoadSpellInfoCustomAttributes",
      source: ["core:src/server/game/Spells/SpellMgr.cpp:3166"],
    });
  });
});
