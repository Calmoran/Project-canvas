import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";

const { bindings, loaders } = azerothcore335;
const binding = (id: string) => bindings.find((b) => b.id === id);

describe("registration macros (code research 2.6)", () => {
  test("a class-name macro registers the stringified first argument", () => {
    expect(binding("cpp.macro.RegisterSpellScript")).toMatchObject({
      form: "macro",
      nameArg: 0,
      stringify: true,
      emits: "script_registration",
      source: [
        "core:src/server/game/Scripting/ScriptDefines/SpellScriptLoader.h:88",
      ],
    });
  });

  test("a ...WithArgs macro takes the name as a plain argument", () => {
    expect(binding("cpp.macro.RegisterSpellScriptWithArgs")).toMatchObject({
      nameArg: 1,
      stringify: false,
    });
    expect(
      binding("cpp.macro.RegisterSpellAndAuraScriptPairWithArgs"),
    ).toMatchObject({ nameArg: 2, stringify: false });
  });

  test("a spell and aura pair is named after its first class", () => {
    expect(binding("cpp.macro.RegisterSpellAndAuraScriptPair")).toMatchObject({
      nameArg: 0,
      stringify: true,
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
      expect(c).toMatchObject({ nameArg: 0, stringify: false });
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
