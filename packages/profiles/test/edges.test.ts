import { describe, expect, test } from "vitest";
import {
  decodeActionButton,
  decodeGrantedSkill,
  decodeLearnedSpell,
  decodeTrainerRequirement,
} from "../src/azerothcore-335/edges-5a.js";
import { azerothcore335 } from "../src/index.js";

describe("decodeActionButton (Player.h:220-228)", () => {
  test.each([
    [{ type: 0 }, [{ kind: "spell", key: "133" }]],
    [{ type: "0" }, [{ kind: "spell", key: "133" }]],
    [{ type: 128 }, [{ kind: "item", key: "133" }]],
    [{ type: 64 }, []], // a macro names nothing in the data
    [{ type: 32 }, []], // an equipment set
  ])("action 133 with %j", (record, expected) => {
    expect(decodeActionButton(133, record)).toEqual(expected);
  });

  test("an empty slot names nothing", () => {
    expect(decodeActionButton(0, { type: 0 })).toEqual([]);
  });
});

describe("decodeTrainerRequirement (Trainer.cpp:209-228)", () => {
  test.each([
    [0, [{ kind: "player_class", key: "8" }]], // class trainer: Mage
    [3, [{ kind: "player_class", key: "8" }]], // pet trainer
    [1, [{ kind: "race", key: "8" }]], // mount trainer
    [2, [{ kind: "spell", key: "8" }]], // tradeskill trainer
    [9, []],
  ])("Type %i, Requirement 8", (type, expected) => {
    expect(decodeTrainerRequirement(8, { Type: type })).toEqual(expected);
  });

  test("Requirement 0 means no requirement", () => {
    expect(decodeTrainerRequirement(0, { Type: 0 })).toEqual([]);
  });
});

describe("edge locations", () => {
  test("each DBC location names a field its layout defines", () => {
    for (const edge of azerothcore335.edges) {
      for (const at of [edge.at, edge.fromAt]) {
        if (at === undefined || !("dbc" in at)) continue;
        const layout = azerothcore335.dbc.find((l) => l.file === at.dbc);
        expect(
          layout?.fields?.some((f) => f.name === at.field),
          `${edge.type}: ${at.dbc} ${at.field}`,
        ).toBe(true);
      }
    }
  });

  test("a decoded edge lists every kind its decode can return", () => {
    const decoded = azerothcore335.edges.filter((e) => e.decode !== undefined);
    expect([...new Set(decoded.map((e) => e.type))].sort()).toEqual([
      "spell_grants_skill",
      "start_action",
      "teaches_spell",
      "trainer_for_class",
    ]);
    expect(decoded.find((e) => e.type === "start_action")?.to).toEqual([
      "spell",
      "item",
    ]);
  });
});

describe("Spell.dbc effect decodes (keyed by PROF-3 field names)", () => {
  const learn = decodeLearnedSpell(1);
  const skill = decodeGrantedSkill(0);

  test("a LEARN_SPELL effect teaches its trigger spell", () => {
    expect(learn(5143, { Id: 1, "Effect[1]": 36 })).toEqual([{ key: "5143" }]);
    expect(learn(5143, { Id: 1, "Effect[1]": 6 })).toEqual([]);
    expect(learn(0, { Id: 1, "Effect[1]": 36 })).toEqual([]);
  });

  test("spells 483 and 55884 learn a computed value, not the trigger spell", () => {
    expect(learn(5143, { Id: 483, "Effect[1]": 36 })).toEqual([]);
    expect(learn(5143, { Id: 55884, "Effect[1]": 36 })).toEqual([]);
  });

  test("a SKILL effect grants its MiscValue; DUAL_WIELD grants Dual Wield", () => {
    expect(skill(164, { "Effect[0]": 118 })).toEqual([{ key: "164" }]);
    expect(skill(0, { "Effect[0]": 40 })).toEqual([{ key: "118" }]);
    expect(skill(164, { "Effect[0]": 36 })).toEqual([]);
  });

  test("one definition per effect slot", () => {
    const slots = azerothcore335.edges
      .filter((e) => e.type === "teaches_spell")
      .map((e) => ("dbc" in e.at ? e.at.field : ""));
    expect(slots).toEqual([
      "EffectTriggerSpell[0]",
      "EffectTriggerSpell[1]",
      "EffectTriggerSpell[2]",
    ]);
  });
});
