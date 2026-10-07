import { createConnection, type Connection } from "mysql2";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  readLiveSchema,
  splitTables,
  streamRows,
  type LiveSchema,
  type LiveTable,
} from "../../../src/index.js";
import { loadMysqlFixture, mysqlTestUrl } from "../../fixtures/mysql/load.js";

const url = mysqlTestUrl();
// Its own database, so it never races the other MySQL test file.
const DB = "canvas_fixture_reader";

/** A fixture profile: two of the fixture's tables, plus one it lacks. */
const profile = {
  databases: {
    world: [
      {
        name: "creature_template",
        primaryKey: ["entry"],
        source: ["core:x:1"],
      },
      {
        name: "trainer_spell",
        primaryKey: ["TrainerId", "SpellId"],
        source: ["core:x:1"],
      },
      { name: "quest_template", primaryKey: ["ID"], source: ["core:x:1"] },
    ],
    characters: [],
    auth: [],
  },
};

describe.skipIf(url === undefined)("against MySQL", () => {
  let connection: Connection;
  let live: LiveSchema;
  const table = (name: string): LiveTable =>
    live.tables.find((t) => t.name === name)!;

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

  test("reads the live schema from information_schema", () => {
    expect(live.databases).toEqual(["world"]);
    expect(live.tables.map((t) => t.name).sort()).toEqual([
      "creature_template",
      "custom_reward",
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
      "creature_template",
      "trainer_spell",
    ]);
    expect(split.custom.map((t) => t.name)).toEqual(["custom_reward"]);
    expect(split.missing).toEqual([
      { database: "world", name: "quest_template" },
    ]);
  });

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
    for await (const row of streamRows(connection, table("creature_template"), {
      highWaterMark: 16,
    })) {
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
        {
          signal: controller.signal,
        },
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
