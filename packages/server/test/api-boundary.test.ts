import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// `@canvas/server/api` is bundled into the browser app, so it may use only
// Zod and its own files. A Fastify or `node:` import here would drag server
// code into the web bundle or break it outright.

// Every static and dynamic import or re-export specifier in a file.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
const importSpecifiers = (text: string): string[] =>
  [...text.matchAll(SPECIFIER)].map((m) => m[1]!);

const API_DIR = fileURLToPath(new URL("../src/api/", import.meta.url));

test("src/api imports nothing but zod and its own files", () => {
  const files = readdirSync(API_DIR, {
    recursive: true,
    encoding: "utf8",
  }).filter((f) => f.endsWith(".ts"));
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const text = readFileSync(join(API_DIR, file), "utf8");
    for (const specifier of importSpecifiers(text)) {
      const allowed =
        specifier === "zod" ||
        (specifier.startsWith("./") && !specifier.includes(".."));
      expect(allowed, `${file} imports "${specifier}"`).toBe(true);
    }
  }
});

test("the package publishes the API as its own subpath", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { exports: Record<string, Record<string, string>> };
  expect(pkg.exports["./api"]).toEqual({
    "@canvas/source": "./src/api/index.ts",
    types: "./dist/api/index.d.ts",
    default: "./dist/api/index.js",
  });
});
