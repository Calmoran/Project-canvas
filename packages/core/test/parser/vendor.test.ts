import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  GRAMMARS,
  sha256,
  vendorDir,
  type Manifest,
} from "../../scripts/vendor-grammars.ts";

const manifest = JSON.parse(
  readFileSync(join(vendorDir, "manifest.json"), "utf8"),
) as Manifest;

describe("vendored grammars", () => {
  test("every vendored file matches the hash recorded in the manifest", () => {
    for (const [file, entry] of Object.entries(manifest)) {
      expect(sha256(join(vendorDir, file)), file).toBe(entry.sha256);
    }
  });

  test("the manifest lists exactly the files in vendor/", () => {
    const onDisk = readdirSync(vendorDir).filter((f) => f !== "manifest.json");
    expect(onDisk.sort()).toEqual(Object.keys(manifest).sort());
  });

  test("each grammar comes from the package and version this repository pins", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { devDependencies: Record<string, string> };
    for (const grammar of GRAMMARS) {
      const version = pkg.devDependencies[grammar.package];
      for (const vendored of Object.values(grammar.files)) {
        expect(manifest[vendored]?.from).toMatch(
          new RegExp(`^${grammar.package.replace("/", "\\/")}@${version}/`),
        );
      }
    }
  });

  test("Lua comes from the maintained scoped package, not the unscoped one", () => {
    expect(manifest["tree-sitter-lua.wasm"]?.from).toMatch(
      /^@tree-sitter-grammars\/tree-sitter-lua@/,
    );
  });

  test("the check would catch a changed file", () => {
    // A single changed byte gives a different hash.
    const bytes = readFileSync(join(vendorDir, "tree-sitter-lua.wasm"));
    const last = bytes.length - 1;
    bytes.writeUInt8(bytes.readUInt8(last) ^ 0xff, last);
    expect(createHash("sha256").update(bytes).digest("hex")).not.toBe(
      manifest["tree-sitter-lua.wasm"]?.sha256,
    );
  });
});
