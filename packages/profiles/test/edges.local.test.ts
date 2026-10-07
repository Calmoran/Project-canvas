/**
 * Local-only: checks every edge definition against the clean checkout at
 * the profile's core commit. A MySQL location's column must be declared in
 * its table's base SQL (the lines the TableDef cites), and one of the
 * edge's cited lines must name the column or DBC field it reads. Skipped
 * when `CANVAS_SOURCE_CORE` is unset, as in CI.
 */
import { parseCitation, type Location } from "@canvas/core";
import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";
import { checkoutEnvName, gitReader } from "./support/citations.js";

const dir = process.env[checkoutEnvName("core")];

const nameOf = (at: Location): string =>
  "column" in at ? at.column : String(at.field).replace(/\[.*$/, "");

describe.skipIf(dir === undefined || dir === "")(
  "edge definitions at the profile's core commit",
  () => {
    // Opened on first use: a skipped describe still runs this body.
    let read: ReturnType<typeof gitReader> | undefined;
    const files = new Map<string, string[]>();
    const linesOf = (path: string): string[] => {
      read ??= gitReader(dir!, azerothcore335.sources["core"]!);
      if (!files.has(path)) files.set(path, (read(path) ?? "").split("\n"));
      return files.get(path)!;
    };
    const cited = (citations: readonly string[]): string[] =>
      citations.flatMap((s) => {
        const c = parseCitation(s)!;
        return linesOf(c.path).slice(c.first - 1, c.last);
      });

    test("each MySQL column is declared in its table's base SQL", () => {
      const problems: string[] = [];
      for (const edge of azerothcore335.edges) {
        for (const at of [edge.at, edge.fromAt]) {
          if (at === undefined || !("column" in at)) continue;
          const table = azerothcore335.databases[at.database].find(
            (t) => t.name === at.table,
          );
          const declared = cited(table?.source ?? []).some((line) =>
            line.trimStart().startsWith(`\`${at.column}\` `),
          );
          if (!declared)
            problems.push(`${edge.type}: ${at.table}.${at.column}`);
        }
      }
      expect(problems).toEqual([]);
    });

    test("one of each edge's cited lines names what it reads", () => {
      const problems: string[] = [];
      for (const edge of azerothcore335.edges) {
        const lines = cited(edge.source);
        for (const at of [edge.at, edge.fromAt]) {
          if (at === undefined) continue;
          const name = nameOf(at);
          const word = new RegExp(`(^|[^\\w])${name}([^\\w]|$)`);
          if (!lines.some((line) => word.test(line))) {
            problems.push(`${edge.type}: ${name} not on its cited lines`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  },
);
