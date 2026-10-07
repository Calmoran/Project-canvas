import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";

const layout = (file: string) =>
  azerothcore335.dbc.find((l) => l.file === file)!;
const field = (file: string, index: number) =>
  layout(file).fields?.find((f) => f.index === index);

describe("DBC field names (PROF-3)", () => {
  test("every loaded DBC has named fields, each within its format", () => {
    for (const l of azerothcore335.dbc) {
      expect(l.fields?.length, l.file).toBeGreaterThan(0);
      for (const f of l.fields!) {
        expect(f.index, l.file).toBeLessThan(l.format.length);
      }
    }
  });

  test("Spell spot checks against code research 1.2", () => {
    expect(field("Spell.dbc", 0)).toEqual({ index: 0, name: "Id" });
    expect(field("Spell.dbc", 40)?.name).toBe("DurationIndex");
    expect(field("Spell.dbc", 116)?.name).toBe("EffectTriggerSpell[0]");
    // The family mask is read [effect][word]: 122 + 3 * effect + word.
    expect(field("Spell.dbc", 125)?.name).toBe("EffectSpellClassMask[1][0]");
    expect(field("Spell.dbc", 133)?.name).toBe("SpellIconID");
  });

  test("a localized string is one field at its first slot", () => {
    expect(field("Spell.dbc", 136)).toEqual({ index: 136, name: "SpellName" });
    expect(field("Spell.dbc", 137)).toBeUndefined();
    expect(field("Spell.dbc", 153)?.name).toBe("Rank");
  });

  test("int32 members are signed; unsigned ones are not", () => {
    expect(field("Spell.dbc", 52)).toMatchObject({
      name: "Reagent[0]",
      signed: true,
    });
    expect(field("Spell.dbc", 71)?.signed).toBeUndefined();
  });

  test("skipped fields Canvas needs are named and read as text", () => {
    expect(field("TalentTab.dbc", 1)).toEqual({
      index: 1,
      name: "name",
      readAs: "localized",
    });
    expect(field("TalentTab.dbc", 18)).toEqual({
      index: 18,
      name: "spellicon",
    });
    expect(field("SpellRange.dbc", 23)?.readAs).toBe("localized");
  });

  test("Achievement_Criteria's union positions stay unnamed", () => {
    expect(field("Achievement_Criteria.dbc", 2)?.name).toBe("requiredType");
    expect(field("Achievement_Criteria.dbc", 3)).toBeUndefined();
    expect(field("Achievement_Criteria.dbc", 4)).toBeUndefined();
    expect(field("Achievement_Criteria.dbc", 26)?.name).toBe("flags");
  });

  test("each named layout cites the struct its names come from", () => {
    expect(layout("Spell.dbc").source).toContain(
      "core:src/server/shared/DataStores/DBCStructure.h:1643-1747",
    );
  });
});
