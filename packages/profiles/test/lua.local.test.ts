/**
 * Local-only: checks the Lua parts of the profile against the mod-ale
 * checkout named by `CANVAS_SOURCE_MOD_ALE`, at the profile's mod-ale
 * commit. Each hook table must match its enum in Hooks.h entry for entry,
 * every event enum must be present, and each Register function's lines must
 * be its implementation and its export. Skipped when the variable is unset.
 */
import { parseCitation } from "@canvas/core";
import { describe, expect, test } from "vitest";
import { luaHookTables } from "../src/azerothcore-335/lua-hooks.js";
import { azerothcore335 } from "../src/index.js";
import { checkoutEnvName, gitReader } from "./support/citations.js";

const dir = process.env[checkoutEnvName("mod-ale")];

describe.skipIf(dir === undefined || dir === "")(
  "Lua citations at the profile's mod-ale commit",
  () => {
    // Opened on first use: a skipped describe still runs this body.
    let read: ReturnType<typeof gitReader> | undefined;
    const linesOf = (path: string): string[] => {
      read ??= gitReader(dir!, azerothcore335.sources["mod-ale"]!);
      return (read(path) ?? "").split("\n");
    };

    test("each hook table is exactly its enum's live entries", () => {
      for (const table of luaHookTables) {
        const c = parseCitation(table.source[0]!)!;
        const range = linesOf(c.path).slice(c.first - 1, c.last);
        expect(range[0]).toMatch(new RegExp(`^\\s*enum ${table.id}\\b`));
        expect(range.at(-1)).toMatch(/^\s*};/);
        const live = range.flatMap((line) => {
          const m = /^\s*([A-Z_]+)\s*=\s*(\d+)\s*,/.exec(line);
          return m === null ? [] : [{ value: Number(m[2]), name: m[1]! }];
        });
        expect(table.events).toEqual(live);
      }
    });

    test("every event enum in Hooks.h has a table", () => {
      const enums = linesOf("src/LuaEngine/Hooks.h").flatMap((line) => {
        const m = /^\s*enum (\w+Events)\b/.exec(line);
        return m === null ? [] : [m[1]!];
      });
      expect(luaHookTables.map((t) => t.id)).toEqual(enums);
    });

    test("each Register function is cited at its implementation and its export", () => {
      const problems: string[] = [];
      for (const b of azerothcore335.bindings) {
        if (b.language !== "lua") continue;
        // Every Lua binding names one exact function, not a pattern.
        const symbol = typeof b.symbol === "string" ? b.symbol : "";
        const [impl, exported] = b.source.map((s) => parseCitation(s)!);
        const implLine = linesOf(impl!.path)[impl!.first - 1] ?? "";
        const exportLine = linesOf(exported!.path)[exported!.first - 1] ?? "";
        if (
          !new RegExp(`\\bint ${symbol}\\(lua_State\\* L\\)`).test(implLine)
        ) {
          problems.push(`${b.id} implementation: ${implLine.trim()}`);
        }
        if (
          !exportLine.includes(
            `{ "${symbol}", &LuaGlobalFunctions::${symbol} }`,
          )
        ) {
          problems.push(`${b.id} export: ${exportLine.trim()}`);
        }
      }
      expect(problems).toEqual([]);
    });
  },
);
