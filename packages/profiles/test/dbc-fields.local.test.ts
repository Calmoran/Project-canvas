/**
 * Local-only: derives every DBC field name again from DBCStructure.h at the
 * profile's core commit and compares it with the profile's copy, and checks
 * each skipped field against the commented-out member that names it.
 * Skipped when `CANVAS_SOURCE_CORE` is unset, as in CI.
 */
import { parseCitation } from "@canvas/core";
import { describe, expect, test } from "vitest";
import {
  dbcFieldNames,
  skippedFieldNames,
} from "../src/azerothcore-335/dbc-fields.js";
import { azerothcore335 } from "../src/index.js";
import { checkoutEnvName, gitReader } from "./support/citations.js";
import {
  dbcStructs,
  deriveFields,
  integerConstants,
  sizeFrom,
  structMembers,
} from "./support/dbc-struct.js";

const STRUCTS = "src/server/shared/DataStores/DBCStructure.h";
const dir = process.env[checkoutEnvName("core")];

describe.skipIf(dir === undefined || dir === "")(
  "DBC field names at the profile's core commit",
  () => {
    // Opened on first use: a skipped describe still runs this body.
    const linesOf = (() => {
      let read: ReturnType<typeof gitReader> | undefined;
      return (path: string): string[] => {
        read ??= gitReader(dir!, azerothcore335.sources["core"]!);
        return (read(path) ?? "").split("\n");
      };
    })();

    test("each named layout matches its struct, member for member", () => {
      const header = linesOf(STRUCTS);
      const size = sizeFrom(
        integerConstants([
          header,
          linesOf("src/server/shared/DataStores/DBCEnums.h"),
          linesOf("src/server/shared/SharedDefines.h"),
        ]),
      );
      const structOf = dbcStructs(
        linesOf("src/server/game/DataStores/DBCStores.cpp"),
      );
      const formats = new Map(
        azerothcore335.dbc.map((l) => [l.file, l.format]),
      );
      for (const named of dbcFieldNames) {
        expect(structOf.get(named.file), named.file).toBe(named.struct);
        const result = structMembers(header, named.struct, size);
        if (!("members" in result)) throw new Error(result.problem);
        const derived = deriveFields(formats.get(named.file)!, result.members);
        if (!("fields" in derived)) throw new Error(derived.problem);
        expect(named.fields, named.file).toEqual(
          derived.fields.map(({ index, name, signed }) =>
            signed === undefined ? { index, name } : { index, name, signed },
          ),
        );
        const lines = derived.fields.map((f) => f.line);
        expect(named.source, named.file).toEqual([
          `core:${STRUCTS}:${Math.min(...lines)}-${Math.max(...lines)}`,
        ]);
      }
    });

    test("every loaded DBC has its names", () => {
      const named = new Set(dbcFieldNames.map((n) => n.file));
      expect(
        azerothcore335.dbc.map((l) => l.file).filter((f) => !named.has(f)),
      ).toEqual([]);
    });

    test("each skipped field is a commented-out member giving its name and position", () => {
      const header = linesOf(STRUCTS);
      for (const part of skippedFieldNames) {
        const cited = part.source.flatMap((s) => {
          const c = parseCitation(s)!;
          return header.slice(c.first - 1, c.last);
        });
        for (const field of part.fields) {
          const line = cited.find((l) =>
            new RegExp(`^\\s*//.*\\b${field.name}\\b`).test(l),
          );
          expect(line, `${part.file} ${field.name}`).toBeDefined();
          // The comment's position: "// 1-16, unused", "// 18", "// 6-21".
          expect(line!).toMatch(new RegExp(`//\\s*${field.index}\\b[^/]*$`));
        }
      }
    });
  },
);
