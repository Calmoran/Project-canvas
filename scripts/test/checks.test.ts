import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { findLoosePins, isExact } from "../check-pins.ts";
import {
  findDependencyProblems,
  importSpecifiers,
  readSourceFiles,
} from "../check-deps.ts";
import { readWorkspace, type WorkspacePackage } from "../workspace.ts";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("pin check", () => {
  test("accepts exact versions, workspace links and exact aliases", () => {
    for (const spec of [
      "1.2.3",
      "13.0.3",
      "1.0.0-beta.2",
      "workspace:*",
      "npm:@typescript/typescript6@6.0.3",
    ]) {
      expect(isExact(spec), spec).toBe(true);
    }
  });

  test("rejects ranges, tags, wildcards and URLs", () => {
    for (const spec of [
      "^1.2.3",
      "~1.2.3",
      ">=1",
      "1.2",
      "1.x",
      "*",
      "latest",
      "workspace:^",
      "github:a/b",
      "npm:x@^1.0.0",
    ]) {
      expect(isExact(spec), spec).toBe(false);
    }
  });

  test("fails on a deliberately broken package.json", () => {
    const broken: WorkspacePackage[] = [
      {
        dir: ".",
        manifest: {
          packageManager: "pnpm@latest",
          devDependencies: { vitest: "5.0.3" },
        },
      },
      { dir: "packages/core", manifest: { dependencies: { zod: "^4.6.5" } } },
    ];
    expect(findLoosePins(broken)).toEqual([
      { dir: ".", field: "packageManager", name: "pnpm", spec: "pnpm@latest" },
      {
        dir: "packages/core",
        field: "dependencies",
        name: "zod",
        spec: "^4.6.5",
      },
    ]);
  });

  test("passes on this repository", () => {
    expect(findLoosePins(readWorkspace(root))).toEqual([]);
  });
});

describe("dependency-direction check", () => {
  test("finds every import form", () => {
    const text = [
      'import { a } from "@canvas/core";',
      'import type { B } from "@canvas/profiles";',
      'import "./side-effect.js";',
      'export * from "../x.js";',
      'const c = await import("@canvas/server");',
      'const d = require("mysql2");',
    ].join("\n");
    expect(importSpecifiers(text)).toEqual([
      "@canvas/core",
      "@canvas/profiles",
      "./side-effect.js",
      "../x.js",
      "@canvas/server",
      "mysql2",
    ]);
  });

  test("fails on core importing server, in code and in package.json", () => {
    const packages: WorkspacePackage[] = [
      {
        dir: "packages/core",
        manifest: { dependencies: { "@canvas/server": "workspace:*" } },
      },
    ];
    const files = [
      {
        path: "packages/core/src/x.ts",
        text: 'import { app } from "@canvas/server";',
      },
    ];
    expect(findDependencyProblems(packages, files)).toEqual([
      expect.objectContaining({
        where: "packages/core/package.json dependencies",
        from: "core",
        to: "server",
      }),
      expect.objectContaining({
        where: "packages/core/src/x.ts",
        from: "core",
        to: "server",
      }),
    ]);
  });

  test("fails on web importing core directly", () => {
    const files = [
      {
        path: "packages/web/src/x.ts",
        text: 'import { nodeId } from "@canvas/core/model";',
      },
    ];
    expect(findDependencyProblems([], files)).toEqual([
      expect.objectContaining({ from: "web", to: "core" }),
    ]);
  });

  test("fails on a relative path into another package", () => {
    const files = [
      {
        path: "packages/profiles/src/x.ts",
        text: 'import { z } from "../../core/src/model/index.js";',
      },
    ];
    expect(findDependencyProblems([], files)).toEqual([
      expect.objectContaining({
        from: "profiles",
        to: "core",
        reason: expect.stringMatching(/relative import/) as unknown,
      }),
    ]);
  });

  test("allows the arrows architecture section 2 draws", () => {
    const files = [
      {
        path: "packages/profiles/src/a.ts",
        text: 'import { z } from "@canvas/core";',
      },
      {
        path: "packages/server/src/a.ts",
        text: 'import "@canvas/core"; import "@canvas/profiles";',
      },
      {
        path: "packages/web/src/a.ts",
        text: 'import type { Api } from "@canvas/server/api";',
      },
      {
        path: "packages/cli/src/a.ts",
        text: 'import type { Api } from "@canvas/server/api";',
      },
      {
        path: "packages/core/src/a/b.ts",
        text: 'import { x } from "../c.js";',
      },
    ];
    expect(findDependencyProblems([], files)).toEqual([]);
  });

  test("passes on this repository", () => {
    expect(
      findDependencyProblems(readWorkspace(root), readSourceFiles(root)),
    ).toEqual([]);
  });
});

describe("pnpm check", () => {
  // `check` repeats the other scripts' commands instead of calling
  // `pnpm <script>`, so it also works as `corepack pnpm check` when no
  // `pnpm` is on PATH. This keeps the copy identical to the originals.
  test("runs exactly the commands of the scripts it stands for", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const s = manifest.scripts;
    const parts = [
      "typecheck",
      "lint",
      "format:check",
      "check:pins",
      "check:deps",
      "test",
    ].map((name) => s[name]!);
    expect(s["check"]).toBe(parts.join(" && "));
    expect(s["check"]).not.toMatch(/\bpnpm\b/);
  });
});
