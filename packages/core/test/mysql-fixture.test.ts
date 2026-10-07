import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadMysqlFixture, mysqlTestUrl } from "./fixtures/mysql/load.js";

const url = mysqlTestUrl();

describe.skipIf(url === undefined)("MySQL fixture", () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await loadMysqlFixture(url!);
  });

  afterAll(async () => {
    await connection.end();
  });

  test("loads and can be read back", async () => {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT TrainerId, SpellId FROM trainer_spell ORDER BY SpellId",
    );
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { TrainerId: 1, SpellId: 116 },
      { TrainerId: 1, SpellId: 133 },
    ]);
  });

  test("reports its live schema through information_schema", async () => {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
    );
    expect(rows.map((r) => r["name"] as string)).toEqual([
      "creature_template",
      "custom_reward",
      "trainer_spell",
    ]);
  });
});
