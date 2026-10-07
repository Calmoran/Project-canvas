import { createHash } from "node:crypto";
import type { Connection } from "mysql2";
import type { Attrs, JsonValue } from "../../model/json.js";
import { canonicalJson, nodeId, rowKey, tableKey } from "../../model/ids.js";
import type { Database, LabelRule, Profile } from "../../profile/index.js";
import type { NodeOrEdge, ReadPlan, Reader } from "../../reader/index.js";
import { tableFingerprint } from "./fingerprint.js";
import { streamRows } from "./rows.js";
import {
  readLiveSchema,
  splitTables,
  type DatabaseNames,
  type LiveTable,
} from "./schema.js";
import { rowAttrs } from "./values.js";

export interface MysqlReaderConfig {
  /** An open connection; the server lane opens it (credentials, SSH). */
  readonly connection: Connection;
  /** Which MySQL database holds each profile database. */
  readonly databases: DatabaseNames;
  /** Tables a server overlay has mapped (CORE-17), so they are not custom. */
  readonly overlayTables?: readonly { database: Database; name: string }[];
}

/** How often, in rows, the reader reports progress while reading a table. */
const PROGRESS_EVERY = 5000;

/**
 * The MySQL reader (architecture section 4). It reads the live schema
 * first, then, for each table the profile defines:
 * - fingerprints it (checksum and row count) and records that fingerprint;
 * - if the fingerprint matches the previous scan's, emits `reuse`, so the
 *   pipeline copies the table's nodes from the previous snapshot;
 * - otherwise emits a `table` node and one `row` node per row, streamed.
 *
 * Tables the profile does not define are emitted as `table` nodes marked
 * `custom`, with their columns, and their rows are never read: they go to
 * the custom-table flow, not into the graph as links (architecture
 * section 6). Every node names the input it came from: the table's key.
 *
 * Edges from rows are the edge engine's job (CORE-7), not this reader's.
 */
export const mysqlReader: Reader<MysqlReaderConfig> = {
  id: "mysql",

  async plan(config, profile): Promise<ReadPlan> {
    const live = await readLiveSchema(config.connection, config.databases);
    const { known } = splitTables(live, profile, config.overlayTables);
    return {
      reader: "mysql",
      items: known.map((t) => ({
        id: tableKey(t.database, t.name),
        label: `${t.database}.${t.name}`,
        total: null,
      })),
    };
  },

  async *read(ctx): AsyncGenerator<NodeOrEdge> {
    const { connection, databases, overlayTables } = ctx.config;
    const live = await readLiveSchema(connection, databases);
    const split = splitTables(live, ctx.profile, overlayTables);

    for (const table of split.custom) {
      const input = tableKey(table.database, table.name);
      const columns = table.columns.map((c) => ({
        name: c.name,
        type: c.columnType,
      }));
      const fingerprint = `columns=${createHash("sha256").update(JSON.stringify(columns)).digest("hex")}`;
      ctx.recordInput(input, fingerprint);
      if (ctx.previousFingerprint("mysql", input) === fingerprint) {
        yield { type: "reuse", input };
        continue;
      }
      yield tableNode(table, input, { custom: true, columns });
    }

    for (const table of split.known) {
      if (ctx.signal.aborted) throw new Error("The scan was cancelled");
      const input = tableKey(table.database, table.name);
      const fingerprint = await tableFingerprint(connection, table);
      ctx.recordInput(input, fingerprint);
      if (ctx.previousFingerprint("mysql", input) === fingerprint) {
        yield { type: "reuse", input };
        continue;
      }
      const keys = keyColumns(ctx.profile, table, live.caseInsensitiveNames);
      const columns = table.columns.map((c) => ({
        name: c.name,
        type: c.columnType,
      }));
      yield tableNode(table, input, { custom: false, columns });

      // Rows arrive ordered by the key columns, so rows sharing a key are
      // next to each other. A table without a primary key (for example
      // playercreateinfo_cast_spell) can hold identical rows: they become
      // one node (decided by Alex). The matching `duplicate` finding needs
      // the reader finding item from #47 and is emitted once that lands.
      // Rows that share a key but differ elsewhere are not identical: until
      // Alex decides how to name them, the read fails, so no row is lost
      // without a word.
      let done = 0;
      let previousKey: string | undefined;
      let previousAttrs: string | undefined;
      for await (const row of streamRows(connection, table, {
        signal: ctx.signal,
        orderBy: keys,
      })) {
        done++;
        const item = rowNode(
          table,
          keys,
          rowAttrs(table, row),
          input,
          ctx.profile.labels,
        );
        if (item.type === "node") {
          const attrs = canonicalJson(item.node.attrs);
          if (item.node.id === previousKey) {
            if (attrs === previousAttrs) continue; // an identical row
            throw new Error(
              `${table.database}.${table.name}: two rows share the key ${item.node.id.slice("row:".length)} but differ in other columns, so the key does not identify them`,
            );
          }
          previousKey = item.node.id;
          previousAttrs = attrs;
        }
        yield item;
        if (done % PROGRESS_EVERY === 0) {
          ctx.progress({ item: input, done, total: null });
        }
      }
      ctx.progress({ item: input, done, total: done });
    }
  },
};

function tableNode(table: LiveTable, input: string, attrs: Attrs): NodeOrEdge {
  return {
    type: "node",
    input,
    node: {
      id: nodeId("table", tableKey(table.database, table.name)),
      kind: "table",
      label: table.name,
      attrs: { database: table.database, name: table.name, ...attrs },
      origin: { source: "mysql", database: table.database, table: table.name },
    },
  };
}

function rowNode(
  table: LiveTable,
  primaryKey: readonly string[],
  attrs: Attrs,
  input: string,
  labels: readonly LabelRule[],
): NodeOrEdge {
  const pk: Record<string, string | number> = {};
  for (const column of primaryKey) {
    const value = attrs[column];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new Error(
        `${table.database}.${table.name}: key column '${column}' is ${value === undefined ? "missing" : "not a plain value"} in a row`,
      );
    }
    pk[column] = value;
  }
  const key = rowKey(table.database, table.name, Object.values(pk));
  return {
    type: "node",
    input,
    node: {
      id: nodeId("row", key),
      kind: "row",
      label: labelOf("row", attrs, key, labels),
      attrs,
      origin: {
        source: "mysql",
        database: table.database,
        table: table.name,
        pk,
      },
    },
  };
}

/**
 * A node's label: the first non-empty attribute named by the kind's label
 * rule, else the node's key (architecture section 3, `LabelRule`).
 */
export function labelOf(
  kind: string,
  attrs: Readonly<Record<string, JsonValue>>,
  key: string,
  labels: readonly LabelRule[],
): string {
  const rule = labels.find((l) => l.kind === kind);
  for (const name of rule?.attrs ?? []) {
    const value = attrs[name];
    if (
      typeof value === "number" ||
      (typeof value === "string" && value.trim() !== "")
    ) {
      return String(value);
    }
  }
  return key;
}

/**
 * The columns that identify a table's rows: the profile's key columns, or,
 * for a table an overlay mapped, the live primary key. For a table without
 * a primary key, the profile's key columns are its identifying columns, and
 * the reader orders by them (decided by Alex).
 */
function keyColumns(
  profile: Profile,
  table: LiveTable,
  caseInsensitive: boolean,
): readonly string[] {
  const norm = (n: string): string => (caseInsensitive ? n.toLowerCase() : n);
  const def = profile.databases[table.database].find(
    (d) => norm(d.name) === norm(table.name),
  );
  if (def !== undefined) return def.primaryKey;
  const live = table.columns
    .filter((c) => c.primaryKeyPosition !== null)
    .sort((a, b) => a.primaryKeyPosition! - b.primaryKeyPosition!)
    .map((c) => c.name);
  if (live.length === 0) {
    throw new Error(
      `${table.database}.${table.name} has no primary key to name its rows by`,
    );
  }
  return live;
}
