/**
 * Local-only: every TableDef citation must span exactly the table's column
 * block in its SQL file at the profile's core commit, from the first column
 * line to the line before the closing parenthesis (keys included). A range
 * that starts at the CREATE TABLE line, stops short, or points at a single
 * column fails here. Skipped when the variable is unset, as in CI.
 */
import { describe, expect, test } from "vitest";
import { parseCitation } from "@canvas/core";
import { azerothcore335 } from "../src/index.js";
import { checkoutEnvName, gitReader } from "./support/citations.js";

const worldTables = azerothcore335.databases.world;
const characterTables = azerothcore335.databases.characters;

/**
 * The first column line and the last line before `)`, as 1-based line
 * numbers, or undefined when the file has no CREATE TABLE for the table.
 */
function columnBlock(text: string, name: string): [number, number] | undefined {
  const lines = text.split("\n");
  const create = new RegExp(
    `^\\s*CREATE TABLE(?:\\s+IF NOT EXISTS)?\\s+\`${name}\``,
  );
  const start = lines.findIndex((line) => create.test(line));
  if (start === -1) return undefined;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\)/.test(lines[i]!)) return [start + 2, i];
  }
  return undefined;
}

const tables = [...worldTables, ...characterTables];

for (const [source, commit] of Object.entries(azerothcore335.sources)) {
  const envName = checkoutEnvName(source);
  const dir = process.env[envName];
  describe.skipIf(dir === undefined || dir === "")(
    `table citations into '${source}' (checkout from ${envName})`,
    () => {
      // Reads each cited file from the checkout with two git processes;
      // the profile cites hundreds of files, which outgrows the default
      // timeout on Windows.
      test(`every citation spans the table's column block at ${commit.slice(0, 8)}`, () => {
        const read = gitReader(dir!, commit);
        for (const table of tables) {
          const citation = table.source
            .map((text) => parseCitation(text))
            .find((c) => c !== undefined && c.source === source);
          if (citation === undefined) continue;
          const text = read(citation.path);
          expect(
            text,
            `${table.name}: ${citation.path} does not exist`,
          ).toBeDefined();
          const block = columnBlock(text!, table.name);
          expect(
            block,
            `${table.name}: no CREATE TABLE in ${citation.path}`,
          ).toBeDefined();
          expect(
            [citation.first, citation.last],
            `${table.name}: ${citation.source}:${citation.path}:${citation.first}-${citation.last} is not the column block ${block![0]}-${block![1]}`,
          ).toEqual(block!);
        }
      }, 120_000);
    },
  );
}
