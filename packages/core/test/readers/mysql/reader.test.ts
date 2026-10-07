import { createConnection, type Connection } from "mysql2";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  checkReadOnly,
  mysqlReader,
  readLiveSchema,
  splitTables,
  streamRows,
  type LiveSchema,
  type LiveTable,
  type MysqlReaderConfig,
  type NodeOrEdge,
  type Profile,
  type ReadContext,
} from "../../../src/index.js";
import { loadMysqlFixture, mysqlTestUrl } from "../../fixtures/mysql/load.js";

const url = mysqlTestUrl();
// Its own database, so it never races the other MySQL test file.
const DB = "canvas_fixture_reader";
const cite = ["core:x:1"];

/** A fixture profile: four of the fixture's tables, plus one it lacks. */
const profile: Profile = {
  id: "fixture",
  sources: { core: "9d9b6049" },
  databases: {
    world: [
      { name: "creature_template", primaryKey: ["entry"], source: cite },
      {
        name: "trainer_spell",
        primaryKey: ["TrainerId", "SpellId"],
        source: cite,
      },
      {
        name: "playercreateinfo_cast_spell",
        primaryKey: ["raceMask", "classMask", "spell"],
        source: cite,
      },
      { name: "canvas_values", primaryKey: ["id"], source: cite },
      { name: "quest_template", primaryKey: ["ID"], source: cite },
    ],
    characters: [],
    auth: [],
  },
  dbc: [],
  edges: [],
  bindings: [],
  loaders: [],
  overrides: [],
  expectations: [],
  labels: [{ kind: "row", attrs: ["name"], source: cite }],
  deadTables: [],
  scriptNames: [],
  hooks: [],
};

/** A read context like the pipeline's, recording what the reader hands back. */
function context(
  config: MysqlReaderConfig,
  previous: ReadonlyMap<string, string> = new Map(),
) {
  const recorded = new Map<string, string>();
  const ctx: ReadContext<MysqlReaderConfig> = {
    snapshot: "s1",
    config,
    profile,
    plan: { reader: "mysql", items: [] },
    signal: new AbortController().signal,
    progress: () => undefined,
    previousFingerprint: (reader, key) =>
      reader === "mysql" ? previous.get(key) : undefined,
    recordInput: (key, fingerprint) => recorded.set(key, fingerprint),
  };
  return { ctx, recorded };
}

async function readAll(
  ctx: ReadContext<MysqlReaderConfig>,
): Promise<NodeOrEdge[]> {
  const items: NodeOrEdge[] = [];
  for await (const item of mysqlReader.read(ctx)) items.push(item);
  return items;
}

describe.skipIf(url === undefined)("against MySQL", () => {
  let connection: Connection;
  let live: LiveSchema;
  const table = (name: string): LiveTable =>
    live.tables.find((t) => t.name === name)!;
  const as = (user: string, password: string): Connection => {
    const u = new URL(url!);
    u.username = user;
    u.password = password;
    return createConnection({ uri: u.toString(), database: DB });
  };

  beforeAll(async () => {
    const promise = await loadMysqlFixture(url!, DB);
    // Many rows, generated in the database, to show streaming stays bounded.
    // MySQL stops recursive queries at 1,000 steps by default; this session
    // needs 20,000.
    await promise.query("SET SESSION cte_max_recursion_depth = 20000");
    await promise.query(
      `INSERT INTO creature_template (entry, name)
       WITH RECURSIVE n (i) AS (SELECT 100 UNION ALL SELECT i + 1 FROM n WHERE i < 20099)
       SELECT i, CONCAT('Fixture ', i) FROM n`,
    );
    await promise.end();
    connection = createConnection({ uri: url!, database: DB });
    live = await readLiveSchema(connection, { world: DB });
  });

  afterAll(async () => {
    // Only if setup got as far as opening it.
    await (connection as Connection | undefined)?.promise().end();
  });

  describe("live schema", () => {
    test("is read from information_schema", () => {
      expect(live.databases).toEqual(["world"]);
      expect(live.tables.map((t) => t.name).sort()).toEqual([
        "canvas_values",
        "creature_template",
        "custom_reward",
        "playercreateinfo_cast_spell",
        "trainer_spell",
      ]);
      const ts = table("trainer_spell");
      expect(ts.database).toBe("world");
      expect(ts.schema).toBe(DB);
      expect(ts.columns.map((c) => [c.name, c.primaryKeyPosition])).toEqual([
        ["TrainerId", 1],
        ["SpellId", 2],
      ]);
      expect(table("creature_template").columns[1]).toMatchObject({
        name: "name",
        dataType: "char",
        columnType: "char(100)",
        nullable: false,
        primaryKeyPosition: null,
      });
    });

    test("lists a table the profile does not define as custom, never as known", () => {
      const split = splitTables(live, profile);
      expect(split.known.map((t) => t.name).sort()).toEqual([
        "canvas_values",
        "creature_template",
        "playercreateinfo_cast_spell",
        "trainer_spell",
      ]);
      expect(split.custom.map((t) => t.name)).toEqual(["custom_reward"]);
      expect(split.missing).toEqual([
        { database: "world", name: "quest_template" },
      ]);
    });

    test("refuses two profile databases set to one MySQL database", async () => {
      await expect(
        readLiveSchema(connection, { world: DB, characters: DB }),
      ).rejects.toThrow(
        `The world and characters databases are both set to MySQL database '${DB}'`,
      );
    });
  });

  describe("streaming", () => {
    test("streams rows in primary-key order", async () => {
      const rows: unknown[] = [];
      for await (const row of streamRows(connection, table("trainer_spell"))) {
        rows.push(row);
      }
      expect(rows).toEqual([
        { TrainerId: 1, SpellId: 116 },
        { TrainerId: 1, SpellId: 133 },
      ]);
    });

    test("streams a large table without holding it all, and stops cleanly midway", async () => {
      let seen = 0;
      let last = 0;
      for await (const row of streamRows(
        connection,
        table("creature_template"),
        { highWaterMark: 16 },
      )) {
        last = row["entry"] as number;
        if (++seen === 1000) break;
      }
      expect(seen).toBe(1000);
      // Entries 1 and 2, then 100 onwards: row k (from the third) is 97 + k.
      expect(last).toBe(1097);
      // The connection is still usable after stopping early.
      let total = 0;
      for await (const row of streamRows(
        connection,
        table("creature_template"),
      )) {
        void row;
        total++;
      }
      expect(total).toBe(20002);
    });

    test("stops when the scan is cancelled", async () => {
      const controller = new AbortController();
      const read = async (): Promise<number> => {
        let n = 0;
        for await (const row of streamRows(
          connection,
          table("creature_template"),
          { signal: controller.signal },
        )) {
          void row;
          if (++n === 10) controller.abort();
        }
        return n;
      };
      await expect(read()).rejects.toThrow(/was cancelled/);
      const [rows] = await connection.promise().query("SELECT 1 AS ok");
      expect(rows).toEqual([{ ok: 1 }]);
    });
  });

  describe("the reader", () => {
    let items: NodeOrEdge[];
    let recorded: Map<string, string>;
    const nodes = () => items.flatMap((i) => (i.type === "node" ? [i] : []));
    const node = (id: string) => nodes().find((i) => i.node.id === id);

    beforeAll(async () => {
      const run = context({ connection, databases: { world: DB } });
      items = await readAll(run.ctx);
      recorded = run.recorded;
    });

    test("emits a table node per table, keyed by database and table", () => {
      const t = node("table:world/trainer_spell")!;
      expect(t.input).toBe("world/trainer_spell");
      expect(t.node.attrs).toMatchObject({
        database: "world",
        name: "trainer_spell",
        custom: false,
      });
      expect(t.node.origin).toEqual({
        source: "mysql",
        database: "world",
        table: "trainer_spell",
      });
    });

    test("emits rows keyed '<database>/<table>/<pk>', with their origin and input", () => {
      const r = node("row:world/trainer_spell/1/116")!;
      expect(r.input).toBe("world/trainer_spell");
      expect(r.node.origin).toEqual({
        source: "mysql",
        database: "world",
        table: "trainer_spell",
        pk: { TrainerId: 1, SpellId: 116 },
      });
      expect(
        nodes().filter((i) =>
          i.node.id.startsWith("row:world/creature_template/"),
        ),
      ).toHaveLength(20002);
    });

    test("labels rows by the profile's label rule, else by their key", () => {
      expect(node("row:world/creature_template/1")!.node.label).toBe(
        "Fixture Trainer",
      );
      expect(node("row:world/trainer_spell/1/116")!.node.label).toBe(
        "world/trainer_spell/1/116",
      );
    });

    test("emits custom tables as table nodes with their columns, and never their rows", () => {
      const c = node("table:world/custom_reward")!;
      expect(c.node.attrs).toMatchObject({ custom: true });
      const columns = c.node.attrs["columns"] as { name: string }[];
      expect(columns.map((x) => x.name)).toEqual(["id", "spell", "note"]);
      expect(
        nodes().some((i) => i.node.id.startsWith("row:world/custom_reward/")),
      ).toBe(false);
    });

    test("names a no-primary-key table's rows by its identifying columns, one node per key", () => {
      const ids = nodes()
        .map((i) => i.node.id)
        .filter((id) =>
          id.startsWith("row:world/playercreateinfo_cast_spell/"),
        );
      // Three rows, two identical: two nodes, ordered by the key columns.
      // The duplicate finding waits on #47.
      expect(ids).toEqual([
        "row:world/playercreateinfo_cast_spell/0/128/116",
        "row:world/playercreateinfo_cast_spell/1/0/133",
      ]);
    });

    test("converts values as decided: exact big numbers, decimals and dates as text, binary left out", () => {
      expect(node("row:world/canvas_values/1")!.node.attrs).toEqual({
        id: 1,
        big: "18446744073709551615",
        safe_big: 42,
        price: "12.50",
        happened: "2026-10-07 12:34:56",
        day: "2026-10-07",
        doc: { a: [1, 2] },
        maybe: null,
        $binaryLengths: { data: 4, flags: 1 },
      });
    });

    test("records a checksum-and-count fingerprint for every table", () => {
      expect([...recorded.keys()].sort()).toEqual([
        "world/canvas_values",
        "world/creature_template",
        "world/custom_reward",
        "world/playercreateinfo_cast_spell",
        "world/trainer_spell",
      ]);
      expect(recorded.get("world/trainer_spell")).toMatch(
        /^checksum=\d+;rows=2$/,
      );
      expect(recorded.get("world/creature_template")).toMatch(/;rows=20002$/);
    });

    test("fails loudly when rows share a key but differ outside it, rather than drop one", async () => {
      // Same key (0, 128, 116) as the identical pair, a different note.
      await connection
        .promise()
        .query(
          "INSERT INTO playercreateinfo_cast_spell VALUES (0, 128, 116, 'Another note')",
        );
      try {
        await expect(
          readAll(context({ connection, databases: { world: DB } }).ctx),
        ).rejects.toThrow(
          "world.playercreateinfo_cast_spell: two rows share the key world/playercreateinfo_cast_spell/0/128/116 but differ in other columns",
        );
      } finally {
        await connection
          .promise()
          .query(
            "DELETE FROM playercreateinfo_cast_spell WHERE note = 'Another note'",
          );
      }
    });

    test("reuses every unchanged table on the next scan, and reads a changed one again", async () => {
      const config = { connection, databases: { world: DB } };
      const again = await readAll(context(config, recorded).ctx);
      expect(again.every((i) => i.type === "reuse")).toBe(true);
      expect(again).toHaveLength(5);

      await connection
        .promise()
        .query("INSERT INTO trainer_spell VALUES (2, 116)");
      try {
        const third = await readAll(context(config, recorded).ctx);
        const read = third.flatMap((i) =>
          i.type === "node" ? [i.node.id] : [],
        );
        expect(read).toContain("row:world/trainer_spell/2/116");
        expect(third.filter((i) => i.type === "reuse")).toHaveLength(4);
      } finally {
        await connection
          .promise()
          .query("DELETE FROM trainer_spell WHERE TrainerId = 2");
      }
    });
  });

  describe("checkReadOnly", () => {
    test("a SELECT-only user is read-only", async () => {
      const ro = as(`${DB}_ro`, "fixture-ro-pass");
      try {
        const report = await checkReadOnly(ro, [DB]);
        expect(report).toMatchObject({
          readOnly: true,
          beyondSelect: [],
          roles: [],
        });
        expect(report.user).toBe(`'${DB}_ro'@'%'`);
      } finally {
        await ro.promise().end();
      }
    });

    test("a user who may also INSERT is not, and the report says what it may do", async () => {
      const rw = as(`${DB}_rw`, "fixture-rw-pass");
      try {
        const report = await checkReadOnly(rw, [DB]);
        expect(report.readOnly).toBe(false);
        expect(report.beyondSelect).toEqual([{ privilege: "INSERT", on: DB }]);
      } finally {
        await rw.promise().end();
      }
    });
  });
});
