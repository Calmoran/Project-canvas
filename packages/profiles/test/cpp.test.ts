import { describe, expect, test } from "vitest";
import {
  declaresFunction,
  declaresNamedConstructor,
  definesMacro,
  enclosingFunction,
  namesTable,
} from "./support/cpp.js";

describe("enclosingFunction", () => {
  const lines = [
    "void ObjectMgr::LoadA()",
    "{",
    '    WorldDatabase.Query("SELECT x FROM a");',
    "}",
    "",
    "uint32 LootStore::LoadLootTable()",
    "{",
    "    if (x) Foo::Bar(1);",
    "}",
  ];

  test("finds the definition above the line", () => {
    expect(enclosingFunction(lines, 3)).toBe("ObjectMgr::LoadA");
  });

  test("ignores indented calls inside the body", () => {
    expect(enclosingFunction(lines, 8)).toBe("LootStore::LoadLootTable");
  });

  test("is undefined above every definition", () => {
    expect(enclosingFunction(["// header", "#include <x>"], 2)).toBeUndefined();
  });
});

describe("namesTable", () => {
  test.each([
    ['"SELECT a FROM spell_ranks ORDER BY a"', "spell_ranks", true],
    ["FROM `quest_money_reward` ORDER", "quest_money_reward", true],
    ['res = "spell_scripts";', "spell_scripts", true],
    ["FROM spell_ranks_extra", "spell_ranks", false],
    ["FROM creature_template ct", "creature", false],
  ])("%s names %s: %s", (text, table, expected) => {
    expect(namesTable(text, table)).toBe(expected);
  });
});

test("definesMacro matches only that macro's #define", () => {
  expect(
    definesMacro(
      "#define RegisterSpellScript(spell_script) X",
      "RegisterSpellScript",
    ),
  ).toBe(true);
  expect(
    definesMacro(
      "#define RegisterSpellScriptWithArgs(a, b) X",
      "RegisterSpellScript",
    ),
  ).toBe(false);
});

test("declaresNamedConstructor matches the constructor or the inheriting class", () => {
  expect(
    declaresNamedConstructor("    ItemScript(char const* name);", "ItemScript"),
  ).toBe(true);
  expect(
    declaresNamedConstructor(
      "class OnlyOnceAreaTriggerScript : public AreaTriggerScript",
      "OnlyOnceAreaTriggerScript",
    ),
  ).toBe(true);
  expect(
    declaresNamedConstructor(
      "    AllItemScript(char const* name);",
      "ItemScript",
    ),
  ).toBe(false);
});

test("declaresFunction matches a declaration or definition, not a call", () => {
  expect(
    declaresFunction(
      "inline void ApplySpellFix(std::initializer_list<uint32> spellIds, void(*fix)(SpellInfo*))",
      "ApplySpellFix",
    ),
  ).toBe(true);
  expect(
    declaresFunction(
      "    [[nodiscard]] SpellInfo const* GetSpellInfo(uint32 spellId) const",
      "GetSpellInfo",
    ),
  ).toBe(true);
  expect(
    declaresFunction(
      "void SpellMgr::LoadSpellInfoCustomAttributes()",
      "SpellMgr::LoadSpellInfoCustomAttributes",
    ),
  ).toBe(true);
  expect(
    declaresFunction(
      "    ApplySpellFix({ 42533 }, [](SpellInfo* spellInfo)",
      "ApplySpellFix",
    ),
  ).toBe(false);
  expect(
    declaresFunction("    return sSpellMgr->GetSpellInfo(id);", "GetSpellInfo"),
  ).toBe(false);
});
