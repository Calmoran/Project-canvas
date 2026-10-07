/**
 * Until the edge engine (CORE-7) runs the fixtures, this checks that every
 * edge definition has a case and that each case is well formed: the
 * records carry what the definition reads, the expected nodes have the
 * definition's kinds, and row keys follow the table's key columns. For a
 * decoded definition, the decode itself must give exactly the expected
 * targets.
 */
import { locationText, parseNodeId, rowKey, type EdgeDef } from "@canvas/core";
import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";
import { edgeFixtures5a, type EdgeFixture } from "./fixtures/edges-5a.js";

const fixtures: readonly EdgeFixture[] = edgeFixtures5a;
const idOf = (type: string, at: EdgeDef["at"]) =>
  `${type} at ${locationText(at)}`;
const definitions = new Map(
  azerothcore335.edges.map((e) => [idOf(e.type, e.at), e]),
);
const nameOf = (at: EdgeDef["at"]) =>
  "column" in at ? at.column : String(at.field);

test("every edge definition has a fixture, and every fixture a definition", () => {
  const covered = new Set(fixtures.map((f) => idOf(f.type, f.at)));
  expect([...definitions.keys()].filter((id) => !covered.has(id))).toEqual([]);
  expect([...covered].filter((id) => !definitions.has(id))).toEqual([]);
});

describe.each(fixtures.map((f) => [idOf(f.type, f.at), f] as const))(
  "%s",
  (id, fixture) => {
    const edge = definitions.get(id)!;
    const kinds = new Set([edge.to].flat());

    test("each record carries the values the definition reads", () => {
      for (const record of fixture.records) {
        expect(record).toHaveProperty([nameOf(edge.at)]);
        if (edge.fromAt !== undefined) {
          expect(record).toHaveProperty([nameOf(edge.fromAt)]);
        }
      }
    });

    test("expected edges start at the definition's kind and end at one of its kinds", () => {
      for (const { from, to } of fixture.expected) {
        expect(parseNodeId(from).kind).toBe(edge.from);
        expect(kinds.has(parseNodeId(to).kind as never)).toBe(true);
      }
    });

    test("a row's key follows its table's key columns", () => {
      if (edge.from !== "row" || !("column" in edge.at)) return;
      const { database, table } = edge.at;
      const def = azerothcore335.databases[database].find(
        (t) => t.name === table,
      )!;
      const keys = fixture.records.map(
        (r) =>
          `row:${rowKey(
            database,
            table,
            def.primaryKey.map((c) => r[c] as string | number),
          )}`,
      );
      for (const { from } of fixture.expected) {
        expect(keys).toContain(from);
      }
    });

    test.skipIf(edge.decode === undefined)(
      "the decode gives exactly the expected targets",
      () => {
        const single = [edge.to].flat().length === 1 ? edge.to : undefined;
        const produced = fixture.records.flatMap((record) =>
          edge.decode!(record[nameOf(edge.at)] ?? null, record).map(
            (t) => `${t.kind ?? (single as string)}:${t.key}`,
          ),
        );
        expect(produced.sort()).toEqual(
          fixture.expected.map((e) => e.to).sort(),
        );
      },
    );
  },
);
