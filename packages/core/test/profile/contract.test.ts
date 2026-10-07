import { describe, expect, test } from "vitest";
import {
  CORE_RULES,
  FindingDraftSchema,
  NodeOrEdgeSchema,
  compileSymbolPattern,
  findingId,
  locationText,
  matchesAll,
  targetsPerRow,
} from "../../src/index.js";

describe("symbol patterns", () => {
  test("* matches any run of identifier characters", () => {
    const re = compileSymbolPattern("AddSC_*");
    expect(re.test("AddSC_mage_spell_scripts")).toBe(true);
    expect(re.test("AddSC_")).toBe(false);
    expect(re.test("xAddSC_mage")).toBe(false);
    expect(re.test("AddSC_a b")).toBe(false);
  });

  test("<Name> is a part the extractor keeps", () => {
    const m =
      compileSymbolPattern("Add<Folder>Scripts").exec("AddSpellsScripts");
    expect(m?.groups).toEqual({ Folder: "Spells" });
    expect(compileSymbolPattern("Add<Folder>Scripts").test("AddScripts")).toBe(
      false,
    );
  });

  test("anything but identifier characters, * and <Name> is refused", () => {
    expect(() => compileSymbolPattern("Add.*")).toThrow(/Not a symbol pattern/);
    expect(() => compileSymbolPattern("Add(x)")).toThrow();
  });
});

test("cardinality says how many targets one row may produce", () => {
  expect(targetsPerRow("1:1")).toBe("one");
  expect(targetsPerRow("N:1")).toBe("one");
  expect(targetsPerRow("1:N")).toBe("many");
  expect(targetsPerRow("N:M")).toBe("many");
});

test("a location reads as text", () => {
  expect(
    locationText({
      database: "world",
      table: "trainer_spell",
      column: "SpellId",
    }),
  ).toBe("world.trainer_spell.SpellId");
  expect(locationText({ dbc: "Spell.dbc", field: 133 })).toBe(
    "Spell.dbc field 133",
  );
});

test("matchesAll needs every test to hold, and no tests always match", () => {
  expect(matchesAll(undefined, {})).toBe(true);
  expect(
    matchesAll(
      [
        { attr: "classMask", op: "mask_any", value: 128 },
        { attr: "spell", op: "eq", value: 116 },
      ],
      { classMask: 128 | 4, spell: 116 },
    ),
  ).toBe(true);
  expect(
    matchesAll([{ attr: "classMask", op: "mask_any", value: 128 }], {
      classMask: 4,
    }),
  ).toBe(false);
});

describe("the duplicate-row finding", () => {
  // Row and table IDs as CORE-6 (#42) names them.
  const row = "row:world/playercreateinfo_cast_spell/0/128/116";
  const table = "table:world/playercreateinfo_cast_spell";
  const draft = {
    kind: "duplicate",
    expected: null,
    node: row,
    related: [table],
    rule: CORE_RULES.duplicateRow,
  } as const;

  test("names the row and its table under a core rule", () => {
    expect(FindingDraftSchema.parse(draft)).toEqual(draft);
    expect(CORE_RULES.duplicateRow).toBe("core.duplicate-row");
  });

  test("a reader emits it as a finding item, with the input it came from", () => {
    expect(
      NodeOrEdgeSchema.safeParse({
        type: "finding",
        finding: draft,
        input: "world/playercreateinfo_cast_spell",
      }).success,
    ).toBe(true);
    expect(
      NodeOrEdgeSchema.safeParse({ type: "finding", finding: draft }).success,
    ).toBe(false);
    expect(
      NodeOrEdgeSchema.safeParse({
        type: "finding",
        finding: { ...draft, id: "f1", snapshot: "s1" },
        input: "x",
      }).success,
    ).toBe(false);
  });

  test("a draft keeps the expected-connection pairing", () => {
    expect(
      FindingDraftSchema.safeParse({ ...draft, expected: "loads" }).success,
    ).toBe(false);
  });

  test("its ID is stable, and changes with anything it says", () => {
    const id = findingId(draft);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(findingId({ ...draft })).toBe(id);
    expect(findingId({ ...draft, related: [table, "table:world/x"] })).toBe(
      findingId({ ...draft, related: ["table:world/x", table] }),
    );
    expect(findingId({ ...draft, node: `${row}x` })).not.toBe(id);
    expect(findingId({ ...draft, rule: "other" })).not.toBe(id);
  });
});
