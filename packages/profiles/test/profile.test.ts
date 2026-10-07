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
        args: [{ index: 0, holds: "name" }],
        bound: "db",
        emits: "script_registration",
        confidence: "exact",
        source,
      },
    ],
    scriptNames: [
      {
        database: "world",
        table: "thing",
        column: "ScriptName",
        kind: "creature",
        source,
      },
    ],
    hooks: [
      {
        id: "ThingEvents",
        events: [{ value: 1, name: "THING_EVENT_ON_USE" }],
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
    expect(citationsOf(sample())).toHaveLength(12);
  });

  describe("a definition without a source citation", () => {
    test.each([
      ["databases.world", (p: Profile) => p.databases.world[0]!],
      ["dbc", (p: Profile) => p.dbc[0]!],
      ["edges", (p: Profile) => p.edges[0]!],
      ["bindings", (p: Profile) => p.bindings[0]!],
      ["scriptNames", (p: Profile) => p.scriptNames[0]!],
      ["hooks", (p: Profile) => p.hooks[0]!],
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
      [
        "scriptNames",
        (p: Profile) =>
          p.scriptNames.push({ ...p.scriptNames[0]!, kind: "gameobject" }),
      ],
      [
        "hooks",
        (p: Profile) =>
          p.hooks.push({
            ...p.hooks[0]!,
            events: [{ value: 2, name: "OTHER" }],
          }),
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

    test("a label rule narrowed to another table is not a duplicate", () => {
      const p = sample();
      p.labels = [
        {
          kind: "row",
          table: "thing",
          attrs: ["name"],
          source: ["core:src/example.cpp:10"],
        },
        {
          kind: "row",
          table: "owner",
          attrs: ["name"],
          source: ["core:src/example.cpp:10"],
        },
      ];
      expect(checkProfile(p)).toEqual([]);
      p.labels.push({ ...p.labels[0]!, attrs: ["title"] });
      expect(checkProfile(p)[0]!.message).toContain(
        "'row table thing' is defined twice",
      );
    });

    test("a binding that names a hook table the profile lacks fails", () => {
      const p = sample();
      p.bindings[0]!.args = [
        { index: 0, holds: "event", hooks: "MissingEvents" },
        { index: 1, holds: "handler" },
      ];
      expect(checkProfile(p).map((x) => x.path)).toEqual([
        "bindings.0.args.0.hooks",
      ]);
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

    test("one edge type read from two locations is not a duplicate", () => {
      const p = sample();
      const edge = p.edges[0]!;
      p.edges.push(
        { ...edge, at: { ...edge.at, column: "spell2" } },
        { ...edge, at: { dbc: "Thing.dbc", field: 1 } },
      );
      expect(checkProfile(p)).toEqual([]);
    });

    test("one edge type at one location twice is a duplicate, and says where", () => {
      const p = sample();
      p.edges.push({ ...p.edges[0]!, cardinality: "N:M" });
      expect(checkProfile(p)).toEqual([
        {
          path: "edges.1",
          message:
            "'thing_casts_spell at world.thing.spell' is defined twice in edges (first at index 0)",
        },
      ]);
    });

    test("a DBC field named or numbered is part of the location", () => {
      const p = sample();
      const edge = p.edges[0]!;
      p.edges = [
        { ...edge, at: { dbc: "Thing.dbc", field: 1 } },
        { ...edge, at: { dbc: "Thing.dbc", field: 1 } },
      ];
      expect(checkProfile(p)[0]!.message).toContain(
        "thing_casts_spell at Thing.dbc field 1",
      );
    });

    test("an edge type that core fixes for the code layer counts as defined twice", () => {
      const p = sample();
      p.edges[0]!.type = "calls";
      expect(checkProfile(p).map((x) => x.path)).toEqual(["edges.0.type"]);
    });
  });
});
