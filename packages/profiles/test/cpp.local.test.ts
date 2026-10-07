/**
 * Local-only: checks that each C++ citation of the AzerothCore profile
 * points at what the definition says, at the profile's commit. A loader's
 * cited lines name its table and sit inside its function; a binding's line
 * is the macro's `#define` or the class's name-taking constructor. Skipped
 * when `CANVAS_SOURCE_CORE` is unset, as in CI.
 */
import { describe, expect, test } from "vitest";
import { parseCitation } from "@canvas/core";
import { azerothcore335 } from "../src/index.js";
import { checkoutEnvName, gitReader } from "./support/citations.js";
import {
  declaresFunction,
  declaresNamedConstructor,
  definesMacro,
  enclosingFunction,
  namesTable,
} from "./support/cpp.js";

const dir = process.env[checkoutEnvName("core")];

describe.skipIf(dir === undefined || dir === "")(
  "C++ citations at the profile's core commit",
  () => {
    // Opened on first use: a skipped describe still runs this body.
    let read: ReturnType<typeof gitReader> | undefined;
    const files = new Map<string, string[]>();
    const linesOf = (path: string): string[] => {
      read ??= gitReader(dir!, azerothcore335.sources["core"]!);
      if (!files.has(path)) files.set(path, (read(path) ?? "").split("\n"));
      return files.get(path)!;
    };

    test("each loader's lines name its table, inside its function", () => {
      const problems: string[] = [];
      for (const loader of azerothcore335.loaders) {
        const cites = loader.source.map((c) => parseCitation(c)!);
        const named = cites.some((c) =>
          linesOf(c.path)
            .slice(c.first - 1, c.last)
            .some((text) => namesTable(text, loader.table)),
        );
        // The first citation outside the prepared-statement list is the code.
        const code = cites.find((c) => !c.path.endsWith("/WorldDatabase.cpp"));
        const fn =
          code === undefined
            ? undefined
            : enclosingFunction(linesOf(code.path), code.last);
        if (!named || fn !== loader.function) {
          problems.push(
            `${loader.table} by ${loader.function}: named=${named}, enclosing=${fn}`,
          );
        }
      }
      expect(problems).toEqual([]);
    }, 60_000);

    test("each binding's lines are its macro, constructor or function", () => {
      const problems: string[] = [];
      for (const binding of azerothcore335.bindings) {
        if (binding.language !== "cpp") continue;
        // Every C++ binding so far names one exact symbol, not a pattern.
        const symbol = typeof binding.symbol === "string" ? binding.symbol : "";
        for (const citation of binding.source) {
          const c = parseCitation(citation)!;
          const text = linesOf(c.path)[c.first - 1] ?? "";
          const ok =
            binding.form === "macro"
              ? definesMacro(text, symbol)
              : binding.form === "constructor"
                ? declaresNamedConstructor(text, symbol)
                : declaresFunction(text, symbol);
          if (!ok) problems.push(`${binding.id}: ${text.trim()}`);
        }
      }
      expect(problems).toEqual([]);
    }, 60_000);

    test("each ScriptName column is read by LoadScriptNames on its cited line", () => {
      const problems: string[] = [];
      for (const column of azerothcore335.scriptNames) {
        const c = parseCitation(column.source[0]!)!;
        const text = linesOf(c.path)[c.first - 1] ?? "";
        const wanted = `SELECT DISTINCT(${column.column}) FROM ${column.table} `;
        if (!text.includes(wanted))
          problems.push(`${column.table}: ${text.trim()}`);
      }
      expect(problems).toEqual([]);
    }, 60_000);
  },
);
