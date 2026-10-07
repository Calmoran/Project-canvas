/**
 * Copies the tree-sitter grammar files Canvas parses with into
 * `packages/core/vendor/`, and records each file's SHA-256 in
 * `vendor/manifest.json`.
 *
 * Why vendor: Canvas needs only each grammar's prebuilt `.wasm` file (a
 * portable compiled parser that runs anywhere, no compiler needed), not the
 * native Node binding the grammar packages also contain. Keeping the exact
 * files in the repository, with their hashes, means every install and every
 * release parses with byte-identical grammars (stack research section 6).
 * A test fails if a vendored file no longer matches its recorded hash.
 *
 * Run after changing a grammar package version:
 *   pnpm --filter @canvas/core vendor:grammars
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Each grammar: its npm package and the files Canvas ships from it. */
export const GRAMMARS = [
  {
    language: "cpp",
    package: "tree-sitter-cpp",
    files: {
      "tree-sitter-cpp.wasm": "tree-sitter-cpp.wasm",
      LICENSE: "LICENSE-tree-sitter-cpp",
    },
  },
  {
    // The maintained grammar; the unscoped `tree-sitter-lua` package is
    // unmaintained since 2022 (stack research section 6).
    language: "lua",
    package: "@tree-sitter-grammars/tree-sitter-lua",
    files: {
      "tree-sitter-lua.wasm": "tree-sitter-lua.wasm",
      "LICENSE.md": "LICENSE-tree-sitter-lua.md",
    },
  },
] as const;

export interface ManifestEntry {
  /** Where the file came from: `<package>@<version>/<file in the package>`. */
  readonly from: string;
  readonly sha256: string;
}

export type Manifest = Record<string, ManifestEntry>;

export const coreDir = dirname(dirname(fileURLToPath(import.meta.url)));
export const vendorDir = join(coreDir, "vendor");

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function vendor(): Manifest {
  const require = createRequire(join(coreDir, "package.json"));
  mkdirSync(vendorDir, { recursive: true });
  const manifest: Manifest = {};
  for (const grammar of GRAMMARS) {
    const packageJson = require.resolve(`${grammar.package}/package.json`);
    const version = (
      JSON.parse(readFileSync(packageJson, "utf8")) as { version: string }
    ).version;
    for (const [inPackage, vendored] of Object.entries(grammar.files)) {
      const target = join(vendorDir, vendored);
      copyFileSync(join(dirname(packageJson), inPackage), target);
      manifest[vendored] = {
        from: `${grammar.package}@${version}/${inPackage}`,
        sha256: sha256(target),
      };
    }
  }
  writeFileSync(
    join(vendorDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [file, entry] of Object.entries(vendor())) {
    console.log(`${file}  ${entry.sha256}  (from ${entry.from})`);
  }
}
