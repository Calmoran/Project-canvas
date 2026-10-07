import { readFileSync } from "node:fs";
import { threadId } from "node:worker_threads";
import { afterAll, describe, expect, test } from "vitest";
import {
  ParserPool,
  type ExtractorRef,
  type SyntaxTree,
} from "../../src/index.js";
import type { Names } from "./fixtures/extract-names.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const names: ExtractorRef = {
  module: new URL("./fixtures/extract-names.ts", import.meta.url).href,
};

const pool = new ParserPool({ size: 2 });
afterAll(() => pool.close());

describe("parsing", () => {
  test("returns the whole syntax tree when no extractor is named", async () => {
    const { value, errors } = await pool.parse({
      language: "cpp",
      path: "a.cpp",
      source: "int main() { return 0; }",
    });
    const tree: SyntaxTree = value;
    expect(tree.type).toBe("translation_unit");
    expect(tree.children[0]!.type).toBe("function_definition");
    expect(tree.start).toEqual({ line: 1, col: 1, index: 0 });
    expect(errors).toEqual([]);
  });

  test("parses C++ and Lua with the vendored grammars, and runs the extractor", async () => {
    const cpp = await pool.parse<Names>({
      language: "cpp",
      path: "spell_mage.cpp",
      source:
        "class spell_mage_frostbolt : public SpellScript { void Register() override {} };\nvoid AddSC_mage() {}",
      extractor: names,
    });
    expect(cpp.value.classes).toEqual(["spell_mage_frostbolt"]);
    expect(cpp.value.functions).toEqual(["Register", "AddSC_mage"]);

    const lua = await pool.parse<Names>({
      language: "lua",
      path: "login.lua",
      source:
        "local function OnLogin(e, p) end\nRegisterPlayerEvent(3, OnLogin)",
      extractor: names,
    });
    expect(lua.value.functions).toEqual(["OnLogin"]);
  });
});

describe("the main thread is never the one parsing", () => {
  test("extractors run on worker threads, and the pool uses more than one", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        pool.parse<Names>({
          language: "cpp",
          path: `f${i}.cpp`,
          // Big enough that tasks overlap and both workers get some.
          source: Array.from(
            { length: 2000 },
            (_, n) => `void f${n}() { int x = ${n}; }`,
          ).join("\n"),
          extractor: names,
        }),
      ),
    );
    const threads = new Set(results.map((r) => r.value.threadId));
    expect(threads.has(threadId)).toBe(false);
    expect(threads.size).toBe(2);
    expect(results.every((r) => r.value.functions.length === 2000)).toBe(true);
  });

  test("the main thread keeps running while a large file parses", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    const source = Array.from(
      { length: 40_000 },
      (_, n) => `void g${n}() { if (${n}) { return; } }`,
    ).join("\n");
    await pool.parse({
      language: "cpp",
      path: "big.cpp",
      source,
      extractor: names,
    });
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(0);
  });
});

describe("files with parse errors", () => {
  test("C++: every construct outside the error region is still extracted", async () => {
    const { value, errors } = await pool.parse<Names>({
      language: "cpp",
      path: "broken.cpp",
      source: fixture("broken.cpp"),
      extractor: names,
    });
    expect(errors.length).toBeGreaterThan(0);
    // The deliberate errors sit on lines 17 and 18, inside BrokenFunction,
    // and go no further.
    for (const e of errors) {
      expect(e.start.line).toBeGreaterThanOrEqual(17);
      expect(e.end.line).toBeLessThanOrEqual(18);
    }
    // Everything else is still found: before, around and after the errors.
    expect(value.classes).toEqual(["BeforeTheError", "AfterTheError"]);
    expect(value.functions).toEqual([
      "OnLogin",
      "FirstFunction",
      "BrokenFunction",
      "LastFunction",
    ]);
  });

  test("Lua: every construct outside the error region is still extracted", async () => {
    const { value, errors } = await pool.parse<Names>({
      language: "lua",
      path: "broken.lua",
      source: fixture("broken.lua"),
      extractor: names,
    });
    expect(errors.length).toBeGreaterThan(0);
    // The deliberate error is the `Broken` function, lines 8 to 10.
    for (const e of errors) {
      expect(e.start.line).toBeGreaterThanOrEqual(8);
      expect(e.end.line).toBeLessThanOrEqual(10);
    }
    expect(value.functions).toEqual(["OnLogin", "OnLogout"]);
  });

  test("a file with no errors reports none", async () => {
    const { errors } = await pool.parse({
      language: "lua",
      path: "ok.lua",
      source: "local x = 1",
    });
    expect(errors).toEqual([]);
  });
});

describe("failures", () => {
  test("an extractor that throws fails only its own file", async () => {
    await expect(
      pool.parse({
        language: "cpp",
        path: "x.cpp",
        source: "int a;",
        extractor: { ...names, name: "explode" },
      }),
    ).rejects.toThrow("extractor failed on purpose");
    await expect(
      pool.parse({
        language: "cpp",
        path: "x.cpp",
        source: "int a;",
        extractor: { ...names, name: "nope" },
      }),
    ).rejects.toThrow(/no exported function 'nope'/);
    const ok = await pool.parse({
      language: "cpp",
      path: "y.cpp",
      source: "int b;",
    });
    expect(ok.errors).toEqual([]);
  });

  test("a crashed worker fails its file, names it, and is replaced", async () => {
    await expect(
      pool.parse({
        language: "cpp",
        path: "crash.cpp",
        source: "int a;",
        extractor: { ...names, name: "crash" },
      }),
    ).rejects.toThrow(/stopped while parsing crash\.cpp/);
    const ok = await pool.parse({
      language: "cpp",
      path: "after.cpp",
      source: "int b;",
    });
    expect(ok.path).toBe("after.cpp");
  });

  test("a closed pool refuses new work and rejects what was waiting", async () => {
    const small = new ParserPool({ size: 1 });
    const running = small.parse({
      language: "cpp",
      path: "a.cpp",
      source: "int a;",
    });
    const waiting = small.parse({
      language: "cpp",
      path: "b.cpp",
      source: "int b;",
    });
    // Handlers first, so the rejections close() causes are expected ones.
    const outcomes = [
      expect(waiting).rejects.toThrow(/closed/),
      expect(running).rejects.toThrow(/closed/),
    ];
    await small.close();
    await Promise.all(outcomes);
    await expect(
      small.parse({ language: "cpp", path: "c.cpp", source: "" }),
    ).rejects.toThrow(/closed/);
  });
});
