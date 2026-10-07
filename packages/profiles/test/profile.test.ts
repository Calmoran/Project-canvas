import { ProfileSchema, snapshotProfileOf, type Profile } from "@canvas/core";
import { describe, expect, test } from "vitest";
import { azerothcore335, checkProfile, citationsOf } from "../src/index.js";

describe("azerothcore335", () => {
  test("validates against the core Profile schema", () => {
    expect(() => ProfileSchema.parse(azerothcore335)).not.toThrow();
  });

  test("passes every profile check", () => {
    expect(checkProfile(azerothcore335)).toEqual([]);
  });

  test("is versioned against AzerothCore commit 9d9b6049", () => {
    expect(azerothcore335.id).toBe("azerothcore-335");
    expect(azerothcore335.sources["core"]).toMatch(/^9d9b6049[0-9a-f]{32}$/);
    expect(snapshotProfileOf(azerothcore335).coreCommit).toBe(
      azerothcore335.sources["core"],
    );
  });
});

/**
 * A small profile with one definition in every part. Its paths and names are
 * made up for the test; it describes no real server.
 */
function sample(): Profile {
  const source = ["core:src/example.cpp:10"];
  return {
    id: "sample",
    sources: { core: "0123456789abcdef0123456789abcdef01234567" },
    databases: {
      world: [{ name: "thing", primaryKey: ["id"], source }],
      characters: [{ name: "owner", primaryKey: ["guid"], source }],
      auth: [{ name: "login", primaryKey: ["id"], source }],
    },
    dbc: [{ file: "Thing.dbc", format: "nx", verified: false, source }],
    edges: [
      {
        type: "thing_casts_spell",
        from: "row",
        to: "spell",
        at: {
          source: "mysql",
          database: "world",
          table: "thing",
          column: "spell",
        },
        cardinality: "N:1",
        confidence: "exact",
        source,
      },
    ],
    bindings: [
      {
        id: "register_thing",
        language: "cpp",
        form: "macro",
        symbol: "RegisterThing",
        nameArg: 0,
        emits: "script_registration",
        confidence: "exact",
        source,
      },
    ],
    loaders: [
      { database: "world", table: "thing", function: "ThingMgr::Load", source },
    ],
    overrides: [{ layer: "spell_dbc", order: 0, confidence: "exact", source }],
    expectations: [
      {
        id: "spell_is_cast",
        kind: "missing",
        select: { kind: "spell" },
        expected: "thing_casts_spell",
        direction: "in",
        source,
      },
    ],
    labels: [{ kind: "spell", attrs: ["name"], source }],
    deadTables: ["unused_thing"],
  };
}

describe("checkProfile", () => {
  test("accepts a sound profile with one definition in every part", () => {
    expect(checkProfile(sample())).toEqual([]);
  });

  test("every citation of the sample is found", () => {
    expect(citationsOf(sample())).toHaveLength(10);
  });

  describe("a definition without a source citation", () => {
    test.each([
      ["databases.world", (p: Profile) => p.databases.world[0]!],
      ["dbc", (p: Profile) => p.dbc[0]!],
      ["edges", (p: Profile) => p.edges[0]!],
      ["bindings", (p: Profile) => p.bindings[0]!],
      ["loaders", (p: Profile) => p.loaders[0]!],
      ["overrides", (p: Profile) => p.overrides[0]!],
      ["expectations", (p: Profile) => p.expectations[0]!],
      ["labels", (p: Profile) => p.labels[0]!],
    ])("fails in %s, missing or empty", (part, pick) => {
      const missing = sample();
      delete (pick(missing) as { source?: unknown }).source;
      expect(checkProfile(missing).map((p) => p.path)).toEqual([
        `${part}.0.source`,
      ]);

      const empty = sample();
      (pick(empty) as { source: string[] }).source = [];
      expect(checkProfile(empty).map((p) => p.path)).toEqual([
        `${part}.0.source`,
      ]);
    });
  });

  test("fails on a citation into a source the profile does not list", () => {
    const p = sample();
    p.edges[0]!.source = ["mod-ale:src/x.cpp:1"];
    expect(checkProfile(p).map((x) => x.path)).toEqual(["edges.0.source.0"]);
  });

  describe("an EdgeDef naming a node kind that does not exist", () => {
    test("fails on its from kind", () => {
      const p = sample() as unknown as { edges: { from: string }[] };
      p.edges[0]!.from = "dragon";
      expect(checkProfile(p).map((x) => x.path)).toEqual(["edges.0.from"]);
    });

    test("fails on its to kind, single or in a list", () => {
      const single = sample() as unknown as { edges: { to: unknown }[] };
      single.edges[0]!.to = "dragon";
      expect(checkProfile(single).map((x) => x.path)).toEqual(["edges.0.to"]);

      const list = sample() as unknown as { edges: { to: unknown }[] };
      list.edges[0]!.to = ["spell", "dragon"];
      expect(checkProfile(list).map((x) => x.path)).toContain("edges.0.to");
    });
  });

  describe("anything defined twice", () => {
    test.each([
      [
        "databases.world",
        (p: Profile) => p.databases.world.push({ ...p.databases.world[0]! }),
      ],
      [
        "databases.characters",
        (p: Profile) =>
          p.databases.characters.push({ ...p.databases.characters[0]! }),
      ],
      [
        "databases.auth",
        (p: Profile) => p.databases.auth.push({ ...p.databases.auth[0]! }),
      ],
      ["dbc", (p: Profile) => p.dbc.push({ ...p.dbc[0]!, format: "nxx" })],
      ["edges", (p: Profile) => p.edges.push({ ...p.edges[0]!, to: "item" })],
      [
        "bindings",
        (p: Profile) => p.bindings.push({ ...p.bindings[0]!, symbol: "Other" }),
      ],
      ["loaders", (p: Profile) => p.loaders.push({ ...p.loaders[0]! })],
      [
        "overrides",
        (p: Profile) => p.overrides.push({ ...p.overrides[0]!, order: 1 }),
      ],
      [
        "expectations",
        (p: Profile) => p.expectations.push({ ...p.expectations[0]! }),
      ],
      [
        "labels",
        (p: Profile) => p.labels.push({ ...p.labels[0]!, attrs: ["other"] }),
      ],
      ["deadTables", (p: Profile) => p.deadTables.push("unused_thing")],
    ])("fails in %s", (part, duplicate) => {
      const p = sample();
      duplicate(p);
      const problems = checkProfile(p);
      expect(problems.map((x) => x.path)).toEqual([`${part}.1`]);
      expect(problems[0]!.message).toMatch(/defined twice/);
    });

    test("the same table name in two databases is not a duplicate", () => {
      const p = sample();
      p.databases.characters.push({ ...p.databases.world[0]! });
      expect(checkProfile(p)).toEqual([]);
    });

    test("one table read by two loader functions is not a duplicate", () => {
      const p = sample();
      p.loaders.push({ ...p.loaders[0]!, function: "ThingMgr::LoadMore" });
      expect(checkProfile(p)).toEqual([]);
    });

    test("an edge type that core fixes for the code layer counts as defined twice", () => {
      const p = sample();
      p.edges[0]!.type = "calls";
      expect(checkProfile(p).map((x) => x.path)).toEqual(["edges.0.type"]);
    });
  });
});
