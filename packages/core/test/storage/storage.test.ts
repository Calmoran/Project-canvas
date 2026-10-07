import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  MIGRATIONS,
  migrate,
  openBetterSqlite3,
  quoteIdentifier,
  type Storage,
} from "../../src/index.js";

let dir: string;
let path: string;
let storage: Storage;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "canvas-storage-"));
  path = join(dir, "workspace.sqlite");
  storage = openBetterSqlite3(path);
});

afterEach(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

const addSnapshot = (id = "s1"): void => {
  storage
    .prepare(
      `INSERT INTO snapshots (id, status, profile_id, core_commit, started_at)
       VALUES (?, 'running', 'azerothcore-335', '9d9b6049', '2026-10-06T00:00:00Z')`,
    )
    .run([id]);
};

const objectNames = (type: string): string[] =>
  storage
    .prepare<{ name: string }>(
      "SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all([type])
    .map((r) => r.name);

describe("migrations", () => {
  test("apply schema v1 on an empty file", () => {
    expect(migrate(storage)).toEqual({ from: 0, to: 1, applied: [1] });
    const tables = objectNames("table");
    for (const t of [
      "snapshots",
      "nodes",
      "edges",
      "findings",
      "overlays",
      "scan_log",
      "scan_inputs",
      "nodes_fts",
    ]) {
      expect(tables).toContain(t);
    }
    expect(objectNames("index")).toEqual(
      expect.arrayContaining([
        "nodes_snapshot_kind",
        "edges_snapshot_from",
        "edges_snapshot_to",
        "edges_snapshot_type",
      ]),
    );
  });

  test("are a no-op on a migrated file, including after reopening it", () => {
    migrate(storage);
    expect(migrate(storage)).toEqual({ from: 1, to: 1, applied: [] });
    storage.close();
    storage = openBetterSqlite3(path);
    expect(migrate(storage)).toEqual({ from: 1, to: 1, applied: [] });
  });

  test("refuse a file from a newer Canvas", () => {
    storage.exec("PRAGMA user_version = 99");
    expect(() => migrate(storage)).toThrow(/newer than this Canvas knows/);
  });

  test("leave nothing behind when one fails partway", () => {
    const broken = [
      ...MIGRATIONS,
      {
        version: 2,
        name: "broken",
        sql: "CREATE TABLE half (x); SELECT * FROM missing_table;",
      },
    ];
    expect(() => migrate(storage, broken)).toThrow();
    expect(objectNames("table")).not.toContain("half");
    expect(migrate(storage)).toEqual({ from: 1, to: 1, applied: [] });
  });

  test("must be numbered in sequence", () => {
    expect(() =>
      migrate(storage, [{ version: 2, name: "skip", sql: "" }]),
    ).toThrow(/numbered/);
  });
});

describe("schema v1", () => {
  const insertFinding = (kind: string, expected: string | null): void => {
    storage
      .prepare(
        "INSERT INTO findings (snapshot, id, kind, expected, node, rule) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(["s1", "f1", kind, expected, "spell:1", "r"]);
  };

  beforeEach(() => {
    migrate(storage);
    addSnapshot();
  });

  test("rejects attrs that are not JSON", () => {
    expect(() =>
      storage
        .prepare(
          "INSERT INTO nodes (snapshot, id, kind, label, attrs, origin) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(["s1", "spell:1", "spell", "x", "not json", "{}"]),
    ).toThrow(/CHECK constraint/);
  });

  test.each([
    ["missing", '"trainer_teaches"'],
    ["missing", '["start_spell_custom","trainer_teaches"]'],
    ["orphan", '"loads"'],
    ["orphan", null],
    ["dangling", null],
    ["duplicate", null],
    ["unapplied", null],
  ])("stores a %s finding with expected %s", (kind, expected) => {
    insertFinding(kind, expected);
    expect(storage.prepare("SELECT count(*) AS n FROM findings").get()).toEqual(
      { n: 1 },
    );
  });

  test.each<[string, string | null, string]>([
    ["missing", null, "missing must name what it expected"],
    ["dangling", '"registers"', "only missing and orphan carry one"],
    ["duplicate", '["registers"]', "only missing and orphan carry one"],
    ["unapplied", '"loads"', "only missing and orphan carry one"],
    ["missing", "[]", "an any-of list is never empty"],
    ["missing", '["trainer_teaches"]', "a single type is stored as a string"],
    ["missing", "trainer_teaches", "it is JSON, so a bare word is refused"],
    ["missing", "42", "it is an edge type or a list of them"],
  ])("rejects a %s finding with expected %s: %s", (kind, expected) => {
    expect(() => insertFinding(kind, expected)).toThrow(/CHECK constraint/);
  });

  test("records input fingerprints once per snapshot, reader and input", () => {
    const record = storage.prepare(
      "INSERT INTO scan_inputs (snapshot, reader, input_key, fingerprint) VALUES (?, ?, ?, ?)",
    );
    record.run(["s1", "dbc", "Spell.dbc", "sha256:aa"]);
    record.run(["s1", "source", "Spell.dbc", "sha256:bb"]);
    expect(() => record.run(["s1", "dbc", "Spell.dbc", "sha256:cc"])).toThrow(
      /UNIQUE|PRIMARY KEY/,
    );
    storage.prepare("DELETE FROM snapshots WHERE id = ?").run(["s1"]);
    expect(
      storage.prepare("SELECT count(*) AS n FROM scan_inputs").get(),
    ).toEqual({ n: 0 });
  });

  test("lets the pipeline copy an unchanged input's nodes and edges by input", () => {
    addSnapshot("s2");
    storage.bulkInsert(
      "nodes",
      ["snapshot", "id", "kind", "label", "origin", "input"],
      [
        ["s1", "spell:116", "spell", "Frostbolt", "{}", "Spell.dbc"],
        ["s1", "spell:133", "spell", "Fireball", "{}", "Spell.dbc"],
        ["s1", "file:a.cpp", "file", "a.cpp", "{}", "src/a.cpp"],
        // Made by the pipeline (a derived game-layer node): no reader input.
        ["s1", "spell:1", "spell", "Derived", "{}", null],
      ],
    );
    storage.bulkInsert(
      "edges",
      [
        "snapshot",
        "id",
        "type",
        "from_id",
        "to_id",
        "confidence",
        "origin",
        "input",
      ],
      [
        [
          "s1",
          "e1",
          "defines",
          "file:a.cpp",
          "spell:116",
          "exact",
          "{}",
          "src/a.cpp",
        ],
      ],
    );
    // What the pipeline does on a `reuse` item for Spell.dbc.
    const copied = storage
      .prepare(
        `INSERT INTO nodes (snapshot, id, kind, label, attrs, origin, input)
         SELECT ?, id, kind, label, attrs, origin, input FROM nodes
         WHERE snapshot = ? AND input = ?`,
      )
      .run(["s2", "s1", "Spell.dbc"]);
    expect(copied.changes).toBe(2);
    expect(
      storage
        .prepare("SELECT id FROM nodes WHERE snapshot = ? ORDER BY id")
        .all(["s2"]),
    ).toEqual([{ id: "spell:116" }, { id: "spell:133" }]);
    expect(
      storage
        .prepare("SELECT input FROM edges WHERE snapshot = ? AND id = ?")
        .get(["s1", "e1"]),
    ).toEqual({ input: "src/a.cpp" });
  });

  test("rejects a node in a snapshot that does not exist", () => {
    expect(() =>
      storage
        .prepare(
          "INSERT INTO nodes (snapshot, id, kind, label, origin) VALUES (?, ?, ?, ?, ?)",
        )
        .run(["nope", "spell:1", "spell", "x", "{}"]),
    ).toThrow(/FOREIGN KEY/);
  });

  test("finds nodes by label through the full-text index", () => {
    storage.bulkInsert(
      "nodes",
      ["snapshot", "id", "kind", "label", "origin"],
      [
        ["s1", "spell:116", "spell", "Frostbolt", "{}"],
        ["s1", "spell:133", "spell", "Fireball", "{}"],
      ],
    );
    const hits = storage
      .prepare<{ id: string }>(
        "SELECT n.id FROM nodes_fts JOIN nodes n ON n.seq = nodes_fts.rowid WHERE nodes_fts MATCH ?",
      )
      .all(["frostbolt"]);
    expect(hits.map((h) => h.id)).toEqual(["spell:116"]);
  });

  test("keeps the full-text index pointing at the right rows after deletes and VACUUM", () => {
    // `seq` must be the table's INTEGER PRIMARY KEY: only then does SQLite
    // keep the numbers the full-text index stores, VACUUM included.
    const seq = storage
      .prepare<{ name: string; type: string; pk: number }>(
        "SELECT name, type, pk FROM pragma_table_info('nodes') WHERE pk > 0",
      )
      .all();
    expect(seq).toEqual([{ name: "seq", type: "INTEGER", pk: 1 }]);

    addSnapshot("s2");
    const columns = ["snapshot", "id", "kind", "label", "origin"];
    const rows = (snapshot: string, from: number): string[][] =>
      Array.from({ length: 50 }, (_, i) => [
        snapshot,
        `spell:${from + i}`,
        "spell",
        `Spell${from + i} Frost`,
        "{}",
      ]);
    storage.bulkInsert("nodes", columns, rows("s1", 0));
    storage.bulkInsert("nodes", columns, rows("s2", 1000));

    // Removing the first snapshot leaves a gap at the start of the table,
    // which is exactly what a VACUUM that renumbered rows would close up.
    storage.prepare("DELETE FROM snapshots WHERE id = ?").run(["s1"]);
    storage.exec("VACUUM");

    // With rank = 1 the check also compares the index against the nodes
    // table's current labels, not just against itself.
    storage.exec(
      "INSERT INTO nodes_fts (nodes_fts, rank) VALUES ('integrity-check', 1)",
    );
    const search = (term: string): string[] =>
      storage
        .prepare<{ id: string; label: string }>(
          `SELECT n.id, n.label FROM nodes_fts JOIN nodes n ON n.seq = nodes_fts.rowid
           WHERE nodes_fts MATCH ? ORDER BY n.seq`,
        )
        .all([term])
        .map((r) => `${r.id} ${r.label}`);
    expect(search("spell1007")).toEqual(["spell:1007 Spell1007 Frost"]);
    expect(search("spell7")).toEqual([]);
    expect(search("frost")).toHaveLength(50);
  });
});

describe("transactions", () => {
  beforeEach(() => migrate(storage));

  const count = (): number =>
    Number(storage.prepare("SELECT count(*) AS n FROM snapshots").get()?.["n"]);

  test("keep everything when the function returns", () => {
    expect(
      storage.transaction(() => (addSnapshot("a"), addSnapshot("b"), "done")),
    ).toBe("done");
    expect(count()).toBe(2);
  });

  test("roll back everything when the function throws", () => {
    expect(() =>
      storage.transaction(() => {
        addSnapshot("a");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(count()).toBe(0);
  });

  test("undo only the inner part when a nested transaction throws", () => {
    storage.transaction(() => {
      addSnapshot("outer");
      try {
        storage.transaction(() => {
          addSnapshot("inner");
          throw new Error("inner failure");
        });
      } catch {
        // the outer transaction carries on
      }
    });
    expect(storage.prepare("SELECT id FROM snapshots").all()).toEqual([
      { id: "outer" },
    ]);
  });

  test("refuse an async function, which would commit before it finished", () => {
    // A promise-returning function: better-sqlite3 must refuse it and roll back.
    expect(() =>
      storage.transaction(() => Promise.resolve().then(() => addSnapshot("a"))),
    ).toThrow();
    expect(count()).toBe(0);
  });
});

describe("bulkInsert", () => {
  beforeEach(() => {
    migrate(storage);
    addSnapshot();
  });

  test("writes 100,000 nodes that can be read back", () => {
    const total = 100_000;
    function* rows(): Generator<string[]> {
      for (let i = 0; i < total; i++) {
        yield [
          "s1",
          `spell:${i}`,
          "spell",
          `Spell ${i}`,
          JSON.stringify({ i }),
          '{"source":"dbc"}',
        ];
      }
    }
    const written = storage.bulkInsert(
      "nodes",
      ["snapshot", "id", "kind", "label", "attrs", "origin"],
      rows(),
    );
    expect(written).toBe(total);

    const stats = storage
      .prepare(
        "SELECT count(*) AS n, sum(json_extract(attrs, '$.i')) AS s FROM nodes WHERE snapshot = ? AND kind = ?",
      )
      .get(["s1", "spell"]);
    expect(stats).toEqual({ n: total, s: (total * (total - 1)) / 2 });
    expect(
      storage
        .prepare("SELECT label FROM nodes WHERE snapshot = ? AND id = ?")
        .get(["s1", "spell:99999"]),
    ).toEqual({
      label: "Spell 99999",
    });
  }, 60_000);

  test("writes nothing when one row is bad", () => {
    expect(() =>
      storage.bulkInsert(
        "nodes",
        ["snapshot", "id", "kind", "label", "origin"],
        [
          ["s1", "spell:1", "spell", "a", "{}"],
          ["s1", "spell:2", "spell", "b"],
        ],
      ),
    ).toThrow(/4 values for 5 columns/);
    expect(storage.prepare("SELECT count(*) AS n FROM nodes").get()).toEqual({
      n: 0,
    });
  });

  test("refuses table and column names that are not plain identifiers", () => {
    expect(() =>
      storage.bulkInsert('nodes"; DROP TABLE nodes; --', ["id"], []),
    ).toThrow(/identifier/);
    expect(() => quoteIdentifier("from")).not.toThrow();
    expect(() => quoteIdentifier("a b")).toThrow();
  });
});
