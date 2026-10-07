import { describe, expect, test } from "vitest";
import {
  canonicalJson,
  edgeId,
  nodeId,
  parseNodeId,
  type MysqlOrigin,
  type Origin,
} from "../../src/index.js";

const mysqlOrigin: MysqlOrigin = {
  source: "mysql",
  table: "trainer_spell",
  column: "SpellId",
  pk: { TrainerId: 17, SpellId: 116 },
};
const dbcOrigin: Origin = {
  source: "dbc",
  file: "SkillLineAbility.dbc",
  recordId: 4021,
};

describe("nodeId", () => {
  test("is '<kind>:<key>'", () => {
    expect(nodeId("spell", "116")).toBe("spell:116");
    expect(nodeId("row", "creature_template/1234")).toBe(
      "row:creature_template/1234",
    );
  });

  test("rejects an empty key", () => {
    expect(() => nodeId("spell", "")).toThrow(/Empty key/);
  });

  test("round-trips through parseNodeId, keeping colons inside the key", () => {
    const id = nodeId("function", "src/a.cpp#Ns::Fn");
    expect(parseNodeId(id)).toEqual({
      kind: "function",
      key: "src/a.cpp#Ns::Fn",
    });
    expect(() => parseNodeId("nokind")).toThrow();
    expect(() => parseNodeId("spell:")).toThrow();
  });
});

describe("edgeId", () => {
  // Fixed expected value, checked with `sha256sum` over the canonical JSON
  // (row key values as text, after normalization)
  // text. If this changes, every stored edge ID changes,
  // which breaks diffs against older snapshots. It must never change by accident.
  test("is the same across runs for the same inputs", () => {
    expect(
      edgeId("trainer_teaches", "trainer:17", "spell:116", mysqlOrigin),
    ).toBe("e1b71a245f19071b045fedc9e12c0d18");
  });

  test("does not depend on the order origin fields were written in", () => {
    const reordered: Origin = {
      pk: { SpellId: 116, TrainerId: 17 },
      column: "SpellId",
      table: "trainer_spell",
      source: "mysql",
    };
    expect(edgeId("t", "a:1", "b:2", reordered)).toBe(
      edgeId("t", "a:1", "b:2", mysqlOrigin),
    );
  });

  test("gives a numeric row key and its text form the same ID", () => {
    const asText: MysqlOrigin = {
      source: "mysql",
      table: "trainer_spell",
      column: "SpellId",
      pk: { TrainerId: "17", SpellId: "116" },
    };
    expect(edgeId("t", "a:1", "b:2", asText)).toBe(
      edgeId("t", "a:1", "b:2", mysqlOrigin),
    );
    // Also inside an override's own origin.
    const override = (at: MysqlOrigin): Origin => ({
      source: "override",
      layer: "spell_dbc",
      at,
    });
    expect(edgeId("t", "a:1", "b:2", override(asText))).toBe(
      edgeId("t", "a:1", "b:2", override(mysqlOrigin)),
    );
  });

  test("still tells different key values apart", () => {
    const other: Origin = {
      ...mysqlOrigin,
      pk: { TrainerId: 17, SpellId: 117 },
    };
    expect(edgeId("t", "a:1", "b:2", other)).not.toBe(
      edgeId("t", "a:1", "b:2", mysqlOrigin),
    );
  });

  test("differs when only the origin differs", () => {
    const a = edgeId("skill_grants_spell", "skill:6", "spell:116", mysqlOrigin);
    const b = edgeId("skill_grants_spell", "skill:6", "spell:116", dbcOrigin);
    expect(a).not.toBe(b);
  });

  test("differs when the type, start or end differs", () => {
    const base = edgeId("t", "a:1", "b:2", dbcOrigin);
    expect(edgeId("u", "a:1", "b:2", dbcOrigin)).not.toBe(base);
    expect(edgeId("t", "a:9", "b:2", dbcOrigin)).not.toBe(base);
    expect(edgeId("t", "a:1", "b:9", dbcOrigin)).not.toBe(base);
  });

  test("is 32 lowercase hex characters", () => {
    expect(edgeId("t", "a:1", "b:2", dbcOrigin)).toMatch(/^[0-9a-f]{32}$/);
  });
});

test("canonicalJson sorts keys at every depth and drops undefined fields", () => {
  expect(
    canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } }),
  ).toBe('{"a":{"d":[{"y":2,"z":1}]},"b":1}');
});
