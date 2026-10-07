import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  GraphStore,
  edgeId,
  findingId,
  ftsQuery,
  openBetterSqlite3,
  type EdgeDraft,
  type FindingDraft,
  type NodeDraft,
  type Storage,
} from "../../src/index.js";

let dir: string;
let storage: Storage;
let store: GraphStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "canvas-store-"));
  storage = openBetterSqlite3(join(dir, "workspace.sqlite"));
  store = new GraphStore(storage);
});

afterEach(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

const profile = { id: "azerothcore-335", coreCommit: "9d9b6049" };
const origin = { source: "dbc", file: "Spell.dbc", recordId: 1 } as const;

const node = (
  id: string,
  label: string,
  kind = id.slice(0, id.indexOf(":")),
): NodeDraft => ({ id, kind, label, attrs: {}, origin }) as NodeDraft;
const edge = (
  from: string,
  to: string,
  type = "links",
  confidence: EdgeDraft["confidence"] = "exact",
): EdgeDraft => ({ type, from, to, confidence, origin, attrs: {} });
const fromReader = <T>(item: T) => ({
  item,
  reader: "dbc",
  input: "Spell.dbc",
});

/**
 * The fixture graph, by hop from spell:116 (both directions):
 *   hop 0: spell:116 (Frostbolt)
 *   hop 1: skill:6, trainer:17, script_registration:frostbolt (via a heuristic edge)
 *   hop 2: player_class:8 (from skill:6), creature:1 (to trainer:17)
 *   hop 3: race:1 (from player_class:8)
 * plus spell:1160 (Frostfire) and spell:133 (Fireball), unconnected, for search.
 */
function seed(): string {
  const s = store.createSnapshot({ profile, sources: { gitRef: "main" } }).id;
  store.writeNodes(
    s,
    [
      node("spell:116", "Frostbolt"),
      node("spell:1160", "Frostfire Bolt"),
      node("spell:133", "Fireball"),
      node("skill:6", "Frost"),
      node("trainer:17", "Mage trainer"),
      node("script_registration:frostbolt", "spell_mage_frostbolt"),
      node("player_class:8", "Mage"),
      node("creature:1", "Archmage"),
      node("race:1", "Human"),
    ].map((n) => ({ node: n, reader: "dbc", input: "Spell.dbc" })),
  );
  store.writeEdges(
    s,
    [
      edge("skill:6", "spell:116", "skill_grants_spell"),
      edge("trainer:17", "spell:116", "trainer_teaches"),
      edge(
        "script_registration:frostbolt",
        "spell:116",
        "registers",
        "heuristic",
      ),
      edge("player_class:8", "skill:6", "class_has_skill"),
      edge("creature:1", "trainer:17", "creature_trainer"),
      edge("race:1", "player_class:8", "race_class"),
    ].map((e) => ({ edge: e, reader: "dbc", input: "Spell.dbc" })),
  );
  return s;
}

describe("snapshots", () => {
  test("are created running, with an ID the store makes", () => {
    const s = store.createSnapshot({
      profile,
      sources: { database: "acore_world" },
    });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s).toMatchObject({ status: "running", profile, finishedAt: null });
    expect(store.getSnapshot(s.id)).toEqual(s);
  });

  test("finish and fail stamp the time and the status", () => {
    const a = store.createSnapshot({ profile, sources: {} });
    const b = store.createSnapshot({ profile, sources: {} });
    expect(store.finishSnapshot(a.id)).toMatchObject({ status: "finished" });
    expect(store.failSnapshot(b.id).finishedAt).not.toBeNull();
    expect(() => store.finishSnapshot(a.id)).toThrow(
      /is finished and can no longer change/,
    );
    expect(() => store.finishSnapshot("nope")).toThrow(/No snapshot 'nope'/);
  });

  test("are listed newest first", () => {
    const ids = [1, 2, 3].map(
      () => store.createSnapshot({ profile, sources: {} }).id,
    );
    // Same-millisecond starts are possible; force distinct times.
    ids.forEach((id, i) =>
      storage
        .prepare("UPDATE snapshots SET started_at = ? WHERE id = ?")
        .run([`2026-10-07T00:00:0${i}.000Z`, id]),
    );
    expect(store.listSnapshots().map((s) => s.id)).toEqual([...ids].reverse());
  });

  test("a finished or failed snapshot refuses writes, and a failed one keeps its rows", () => {
    const s = seed();
    store.failSnapshot(s);
    expect(() =>
      store.writeNodes(
        s,
        [fromReader(node("spell:9", "x"))].map(({ item }) => ({
          node: item,
          reader: null,
          input: null,
        })),
      ),
    ).toThrow(/is failed and can no longer change/);
    expect(() => store.writeEdges(s, [])).toThrow(/is failed/);
    expect(() => store.writeFindings(s, [])).toThrow(/is failed/);
    expect(store.getNode(s, "spell:116")?.label).toBe("Frostbolt");
  });
});

describe("writes", () => {
  test("check every row against the schema before writing, and name the bad one", () => {
    const s = store.createSnapshot({ profile, sources: {} }).id;
    expect(() =>
      store.writeNodes(s, [
        { node: node("spell:1", "ok"), reader: null, input: null },
        {
          node: {
            ...node("spell:2", "bad"),
            kind: "dragon",
          } as unknown as NodeDraft,
          reader: null,
          input: null,
        },
      ]),
    ).toThrow(/node 1 is not valid at kind/);
    // The whole batch was undone.
    expect(store.getNode(s, "spell:1")).toBeUndefined();
  });

  test("a node ID written twice is an error, the batch is undone, and the message names it", () => {
    const s = store.createSnapshot({ profile, sources: {} }).id;
    const a = { node: node("spell:1", "a"), reader: null, input: null };
    expect(() =>
      store.writeNodes(s, [{ ...a, node: node("spell:0", "first") }, a, a]),
    ).toThrow("Node 'spell:1' is already in snapshot");
    expect(store.getNode(s, "spell:0")).toBeUndefined();
  });

  test("a repeated edge (same type, ends and origin) is skipped without error", () => {
    const s = seed();
    const again = {
      edge: edge("skill:6", "spell:116", "skill_grants_spell"),
      reader: null,
      input: null,
    };
    expect(store.writeEdges(s, [again, again])).toBe(0);
    const other = {
      ...again,
      edge: { ...again.edge, origin: { ...origin, recordId: 2 } },
    };
    expect(store.writeEdges(s, [other])).toBe(1);
  });

  test("reader and input come together, or not at all", () => {
    const s = store.createSnapshot({ profile, sources: {} }).id;
    expect(() =>
      store.writeNodes(s, [
        { node: node("spell:1", "a"), reader: "dbc", input: null },
      ]),
    ).toThrow(/reader and input are given together/);
  });

  test("findings get their ID from what they say, are stamped with the snapshot, and read back", () => {
    const s = seed();
    const f2: FindingDraft = {
      kind: "orphan",
      expected: null,
      node: "table:world/x",
      related: [],
      rule: "b-rule",
    };
    const f1: FindingDraft = {
      kind: "missing",
      expected: ["start_spell_custom", "trainer_teaches"],
      node: "spell:133",
      related: [],
      rule: "a-rule",
    };
    const f3: FindingDraft = {
      kind: "dangling",
      expected: null,
      node: "spell:1",
      related: ["file:a.cpp"],
      rule: "a-rule",
    };
    // The same finding twice is stored once.
    expect(store.writeFindings(s, [f2, f1, f3, f2])).toBe(3);
    // By rule, then kind, then node.
    expect(store.findings(s).map((f) => f.node)).toEqual([
      "spell:1",
      "spell:133",
      "table:world/x",
    ]);
    expect(store.findings(s, { kind: "missing" })[0]).toEqual({
      ...f1,
      id: findingId(f1),
      snapshot: s,
    });
    expect(store.findings(s, { rule: "b-rule" }).map((f) => f.id)).toEqual([
      findingId(f2),
    ]);
  });

  test("the same finding has the same ID in another snapshot", () => {
    const a = seed();
    const b = store.createSnapshot({ profile, sources: {} }).id;
    const finding: FindingDraft = {
      kind: "duplicate",
      expected: null,
      node: "script_registration:x",
      related: ["file:a.cpp", "file:b.cpp"],
      rule: "script-name-unique",
    };
    store.writeFindings(a, [finding]);
    store.writeFindings(b, [
      { ...finding, related: ["file:b.cpp", "file:a.cpp"] },
    ]);
    expect(store.findings(a)[0]!.id).toBe(store.findings(b)[0]!.id);
  });

  test("a finding with an ID of its own is refused: the store makes IDs", () => {
    const s = seed();
    expect(() =>
      store.writeFindings(s, [
        {
          id: "mine",
          kind: "orphan",
          expected: null,
          node: "table:world/x",
          related: [],
          rule: "r",
        } as unknown as Parameters<GraphStore["writeFindings"]>[1][number],
      ]),
    ).toThrow(/finding 0 is not valid/);
  });
});

describe("neighborhood", () => {
  const ids = (r: { nodes: { id: string }[] }) => r.nodes.map((n) => n.id);

  test("0 hops is the focus alone; each hop adds the next ring, both directions", () => {
    const s = seed();
    expect(
      ids(store.neighborhood(s, { node: "spell:116", hops: 0, cap: 100 })),
    ).toEqual(["spell:116"]);
    expect(
      ids(store.neighborhood(s, { node: "spell:116", hops: 1, cap: 100 })),
    ).toEqual([
      "spell:116",
      "script_registration:frostbolt",
      "skill:6",
      "trainer:17",
    ]);
    const two = store.neighborhood(s, { node: "spell:116", hops: 2, cap: 100 });
    expect(ids(two)).toEqual([
      "spell:116",
      "script_registration:frostbolt",
      "skill:6",
      "trainer:17",
      "creature:1",
      "player_class:8",
    ]);
    expect(two.truncated).toBe(false);
    expect(
      ids(store.neighborhood(s, { node: "spell:116", hops: 3, cap: 100 })),
    ).toContain("race:1");
  });

  test("returns the edges between the nodes it returns, the outermost ring included", () => {
    const s = seed();
    const two = store.neighborhood(s, { node: "spell:116", hops: 2, cap: 100 });
    expect(two.edges.map((e) => e.type).sort()).toEqual(
      [
        "class_has_skill",
        "creature_trainer",
        "registers",
        "skill_grants_spell",
        "trainer_teaches",
      ].sort(),
    );
    expect(two.edges[0]!.id).toBe(
      edgeId(two.edges[0]!.type, two.edges[0]!.from, two.edges[0]!.to, origin),
    );
  });

  test("walks only the edge types and confidences asked for", () => {
    const s = seed();
    expect(
      ids(
        store.neighborhood(s, {
          node: "spell:116",
          hops: 3,
          cap: 100,
          edgeTypes: ["skill_grants_spell", "class_has_skill"],
        }),
      ),
    ).toEqual(["spell:116", "skill:6", "player_class:8"]);
    expect(
      ids(
        store.neighborhood(s, {
          node: "spell:116",
          hops: 1,
          cap: 100,
          confidences: ["heuristic"],
        }),
      ),
    ).toEqual(["spell:116", "script_registration:frostbolt"]);
    expect(
      ids(
        store.neighborhood(s, {
          node: "spell:116",
          hops: 2,
          cap: 100,
          edgeTypes: [],
        }),
      ),
    ).toEqual(["spell:116"]);
  });

  test("the cap keeps the nearest nodes in ID order and says it cut", () => {
    const s = seed();
    const cut = store.neighborhood(s, { node: "spell:116", hops: 2, cap: 3 });
    expect(ids(cut)).toEqual([
      "spell:116",
      "script_registration:frostbolt",
      "skill:6",
    ]);
    expect(cut.truncated).toBe(true);
    // Exactly full after a hop, with more one hop out: still truncated.
    const full = store.neighborhood(s, { node: "spell:116", hops: 2, cap: 4 });
    expect(ids(full)).toHaveLength(4);
    expect(full.truncated).toBe(true);
    // Exactly full with nothing further: not truncated.
    expect(
      store.neighborhood(s, { node: "spell:116", hops: 1, cap: 4 }).truncated,
    ).toBe(false);
  });

  test("an unknown focus gives an empty answer; bad hops or cap are refused", () => {
    const s = seed();
    expect(
      store.neighborhood(s, { node: "spell:9", hops: 2, cap: 10 }),
    ).toEqual({ nodes: [], edges: [], truncated: false });
    expect(() =>
      store.neighborhood(s, { node: "spell:116", hops: -1, cap: 10 }),
    ).toThrow(/hops/);
    expect(() =>
      store.neighborhood(s, { node: "spell:116", hops: 1, cap: 0 }),
    ).toThrow(/cap/);
  });

  test("an edge to a node that does not exist is not walked into", () => {
    const s = seed();
    store.writeEdges(s, [
      { edge: edge("spell:116", "spell:404"), reader: null, input: null },
    ]);
    expect(
      ids(store.neighborhood(s, { node: "spell:116", hops: 1, cap: 100 })),
    ).not.toContain("spell:404");
  });
});

describe("search", () => {
  const found = (hits: { node: { id: string }; match: string }[]) =>
    hits.map((h) => `${h.match} ${h.node.id}`);

  test("ranks an exact ID first, then exact keys, ID prefixes, then label words", () => {
    const s = seed();
    expect(found(store.search(s, "spell:116"))).toEqual([
      "id spell:116",
      "id_prefix spell:1160",
    ]);
    // "116" is a key of spell:116; "Frost" words match labels.
    expect(found(store.search(s, "116"))).toEqual(["key spell:116"]);
    expect(found(store.search(s, "frost"))).toEqual([
      "label skill:6",
      "label spell:116",
      "label spell:1160",
      // The label "spell_mage_frostbolt" splits into words at "_".
      "label script_registration:frostbolt",
    ]);
  });

  test("each word is a prefix, and every word must match", () => {
    const s = seed();
    // "Frostbolt" is one word, so only "Frostfire Bolt" has a word starting "bo".
    expect(found(store.search(s, "frost bo"))).toEqual(["label spell:1160"]);
    expect(found(store.search(s, "fire ball"))).toEqual([]);
  });

  test("typed text is only words: full-text syntax can't break the query", () => {
    const s = seed();
    expect(() => store.search(s, 'frost" OR *')).not.toThrow();
    expect(ftsQuery('frost" OR *')).toBe('"frost"* "OR"*');
    expect(store.search(s, "   ")).toEqual([]);
  });

  test("stops at the limit, 50 by default", () => {
    const s = store.createSnapshot({ profile, sources: {} }).id;
    store.writeNodes(
      s,
      Array.from({ length: 60 }, (_, i) => ({
        node: node(`spell:${i}`, `Bolt ${i}`),
        reader: null,
        input: null,
      })),
    );
    expect(store.search(s, "bolt")).toHaveLength(50);
    expect(store.search(s, "bolt", { limit: 5 })).toHaveLength(5);
  });

  test("only finds nodes in the snapshot asked for", () => {
    const s = seed();
    const other = store.createSnapshot({ profile, sources: {} }).id;
    expect(store.search(other, "frost")).toEqual([]);
    expect(store.search(s, "frost")).toHaveLength(4);
  });
});
