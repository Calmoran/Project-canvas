import { describe, expect, test } from "vitest";
import type { Connection } from "mysql2";
import {
  BINARY_LENGTHS_ATTR,
  escapeIdentifier,
  formatFingerprint,
  judgeGrants,
  labelOf,
  mysqlPatternMatches,
  readLiveSchema,
  rowAttrs,
  splitTables,
  type LiveSchema,
  type LiveTable,
} from "../../../src/index.js";

// Pure logic, so it runs everywhere, including Windows without MySQL.

const table = (database: LiveTable["database"], name: string): LiveTable => ({
  database,
  schema: `acore_${database}`,
  name,
  columns: [],
});
const def = (name: string) => ({
  name,
  primaryKey: ["id"],
  source: ["core:x:1"],
});

describe("splitTables", () => {
  const profile = {
    databases: {
      world: [def("creature_template"), def("updates")],
      characters: [def("characters"), def("updates")],
      auth: [],
    },
  };

  test("matches tables per database, so one name in two databases is two tables", () => {
    const live: LiveSchema = {
      databases: ["world", "characters"],
      caseInsensitiveNames: false,
      tables: [
        table("world", "creature_template"),
        table("world", "updates"),
        table("characters", "updates"),
        table("characters", "custom_log"),
      ],
    };
    const split = splitTables(live, profile);
    expect(split.known.map((t) => `${t.database}.${t.name}`)).toEqual([
      "world.creature_template",
      "world.updates",
      "characters.updates",
    ]);
    expect(split.custom.map((t) => `${t.database}.${t.name}`)).toEqual([
      "characters.custom_log",
    ]);
    expect(split.missing).toEqual([
      { database: "characters", name: "characters" },
    ]);
  });

  test("an overlay's tables are no longer custom", () => {
    const live: LiveSchema = {
      databases: ["characters"],
      caseInsensitiveNames: false,
      tables: [table("characters", "custom_log")],
    };
    const split = splitTables(live, profile, [
      { database: "characters", name: "custom_log" },
    ]);
    expect(split.custom).toEqual([]);
    expect(split.known.map((t) => t.name)).toEqual(["custom_log"]);
  });

  test("compares names case-insensitively only when the server does", () => {
    const tables = [table("world", "Creature_Template")];
    const sensitive = splitTables(
      { databases: ["world"], caseInsensitiveNames: false, tables },
      profile,
    );
    expect(sensitive.custom.map((t) => t.name)).toEqual(["Creature_Template"]);
    const insensitive = splitTables(
      { databases: ["world"], caseInsensitiveNames: true, tables },
      profile,
    );
    expect(insensitive.known.map((t) => t.name)).toEqual(["Creature_Template"]);
  });

  test("reports missing tables only for databases that were configured", () => {
    const split = splitTables(
      { databases: [], caseInsensitiveNames: false, tables: [] },
      profile,
    );
    expect(split.missing).toEqual([]);
  });
});

test("escapeIdentifier doubles backquotes and refuses unusable names", () => {
  expect(escapeIdentifier("creature_template")).toBe("creature_template");
  expect(escapeIdentifier("we`ird")).toBe("we``ird");
  expect(() => escapeIdentifier("")).toThrow();
  expect(() => escapeIdentifier("a\0b")).toThrow();
});

describe("readLiveSchema", () => {
  /**
   * A stand-in connection answering the two queries readLiveSchema makes, so
   * this runs without MySQL. `lctn` is the server's lower_case_table_names.
   */
  const fakeConnection = (lctn: number, schema: string): Connection =>
    ({
      promise: () => ({
        query: (sql: string) =>
          Promise.resolve([
            sql.includes("lower_case_table_names")
              ? [{ lctn }]
              : [
                  {
                    TABLE_SCHEMA: schema,
                    TABLE_NAME: "creature_template",
                    COLUMN_NAME: "entry",
                    DATA_TYPE: "int",
                    COLUMN_TYPE: "int unsigned",
                    IS_NULLABLE: "NO",
                    PK_POSITION: 1,
                  },
                ],
          ]),
      }),
    }) as unknown as Connection;

  test("finds each table's database when the server lowercases names", async () => {
    // Configured as "Acore_World"; with lower_case_table_names = 1 (the
    // Windows default) information_schema reports "acore_world".
    const live = await readLiveSchema(fakeConnection(1, "acore_world"), {
      world: "Acore_World",
    });
    expect(live.caseInsensitiveNames).toBe(true);
    expect(live.tables.map((t) => [t.database, t.schema, t.name])).toEqual([
      ["world", "acore_world", "creature_template"],
    ]);
  });

  test("matches database names exactly when the server is case-sensitive", async () => {
    const live = await readLiveSchema(fakeConnection(0, "acore_world"), {
      world: "acore_world",
    });
    expect(live.tables.map((t) => t.database)).toEqual(["world"]);
  });
});

describe("the read-only decision", () => {
  const base = {
    user: "'canvas'@'%'",
    databases: ["acore_world"],
    global: [],
    schema: [],
    table: [],
    roles: [],
  };

  test("only SELECT and USAGE is read-only", () => {
    const report = judgeGrants({
      ...base,
      global: [{ privilege: "USAGE", on: "*.*" }],
      schema: [{ privilege: "SELECT", on: "acore_world" }],
    });
    expect(report.readOnly).toBe(true);
    expect(report.beyondSelect).toEqual([]);
  });

  test("any other privilege on a configured database, or globally, is not", () => {
    expect(
      judgeGrants({
        ...base,
        schema: [{ privilege: "UPDATE", on: "acore_world" }],
      }).beyondSelect,
    ).toEqual([{ privilege: "UPDATE", on: "acore_world" }]);
    expect(
      judgeGrants({ ...base, global: [{ privilege: "PROCESS", on: "*.*" }] })
        .readOnly,
    ).toBe(false);
    expect(
      judgeGrants({
        ...base,
        table: [{ privilege: "DELETE", on: "acore_world.creature_template" }],
      }).readOnly,
    ).toBe(false);
  });

  test("a database pattern counts when it matches a configured database", () => {
    expect(
      judgeGrants({
        ...base,
        schema: [{ privilege: "INSERT", on: "acore\\_%" }],
      }).readOnly,
    ).toBe(false);
    // Grants on other databases don't affect what Canvas reads.
    expect(
      judgeGrants({ ...base, schema: [{ privilege: "INSERT", on: "my_site" }] })
        .readOnly,
    ).toBe(true);
  });

  test("a user with roles is 'unknown', never read-only", () => {
    expect(judgeGrants({ ...base, roles: ["'admin'@'%'"] }).readOnly).toBe(
      "unknown",
    );
    // But a privilege seen directly still answers 'no'.
    expect(
      judgeGrants({
        ...base,
        roles: ["'admin'@'%'"],
        global: [{ privilege: "SUPER", on: "*.*" }],
      }).readOnly,
    ).toBe(false);
  });

  test("MySQL database patterns: % any run, _ one character, backslash literal", () => {
    expect(mysqlPatternMatches("acore\\_%", "acore_world")).toBe(true);
    expect(mysqlPatternMatches("acore\\_%", "acoreXworld")).toBe(false);
    expect(mysqlPatternMatches("acore_world", "acoreXworld")).toBe(true);
    expect(mysqlPatternMatches("%", "anything")).toBe(true);
    expect(mysqlPatternMatches("a.b", "aXb")).toBe(false);
  });
});

describe("row values", () => {
  const columns = (...specs: [string, string][]) => ({
    columns: specs.map(([name, dataType]) => ({
      name,
      dataType,
      columnType: dataType,
      nullable: true,
      primaryKeyPosition: null,
    })),
  });

  test("binary columns are left out, with their length kept", () => {
    expect(
      rowAttrs(columns(["id", "int"], ["data", "blob"], ["none", "blob"]), {
        id: 1,
        data: Buffer.from([1, 2, 3]),
        none: null,
      }),
    ).toEqual({ id: 1, none: null, [BINARY_LENGTHS_ATTR]: { data: 3 } });
  });

  test("big integers stay exact, as numbers when safe and text when not", () => {
    expect(
      rowAttrs(columns(["a", "bigint"], ["b", "bigint"]), {
        a: 42n,
        b: 18446744073709551615n,
      }),
    ).toEqual({ a: 42, b: "18446744073709551615" });
  });

  test("a row's label is the first non-empty attribute its rule names, else its key", () => {
    const labels = [
      {
        kind: "row" as const,
        attrs: ["name", "LogTitle"],
        source: ["core:x:1"],
      },
    ];
    expect(labelOf("row", { name: "", LogTitle: "Quest" }, "k", labels)).toBe(
      "Quest",
    );
    expect(labelOf("row", { name: "  " }, "world/t/1", labels)).toBe(
      "world/t/1",
    );
    expect(labelOf("row", { name: "Bob" }, "k", [])).toBe("k");
  });

  test("a fingerprint is readable text", () => {
    expect(formatFingerprint("123", "5")).toBe("checksum=123;rows=5");
  });
});
