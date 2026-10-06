/**
 * Fails if a package depends on, or imports, a Canvas package it must not.
 *
 * Why: architecture section 2 fixes the direction. `core` depends on
 * nothing in the repo; `profiles` on `core`; `server` on `core` and
 * `profiles`; `web` and `cli` on `server`'s API types. Keeping the arrows one
 * way means no cycles, and a lane can change its package without breaking a
 * package below it.
 *
 * It reads both package.json dependencies and the import lines of every
 * TypeScript file, and also rejects relative paths (`../../core/src/...`)
 * that reach into another package's folder past its public entry point.
 *
 * Run: `pnpm check:deps`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPENDENCY_FIELDS,
  readWorkspace,
  type WorkspacePackage,
} from "./workspace.ts";

/** Which Canvas packages each package may use (architecture section 2). */
export const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  core: [],
  profiles: ["core"],
  server: ["core", "profiles"],
  web: ["server"],
  cli: ["server"],
};

export interface DepProblem {
  readonly where: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface SourceFile {
  /** Path relative to the repo root, forward slashes. */
  readonly path: string;
  readonly text: string;
}

const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bexport\s+\*\s+from\s*)["']([^"']+)["']/g;

export function importSpecifiers(text: string): string[] {
  return [...text.matchAll(SPECIFIER)].map((m) => m[1]!);
}

const packageOf = (path: string): string | undefined =>
  /^packages\/([^/]+)\//.exec(path)?.[1];

function checkEdge(
  from: string,
  to: string,
  where: string,
  problems: DepProblem[],
): void {
  if (to === from) return;
  const allowed = ALLOWED[from];
  if (allowed === undefined) {
    problems.push({
      where,
      from,
      to,
      reason: `"${from}" has no entry in ALLOWED`,
    });
  } else if (!allowed.includes(to)) {
    problems.push({
      where,
      from,
      to,
      reason: `${from} may use only [${allowed.join(", ")}]`,
    });
  }
}

export function findDependencyProblems(
  packages: readonly WorkspacePackage[],
  files: readonly SourceFile[],
): DepProblem[] {
  const problems: DepProblem[] = [];

  for (const { dir, manifest } of packages) {
    const from = packageOf(`${dir}/`);
    if (from === undefined) continue;
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        const to = /^@canvas\/(.+)$/.exec(name)?.[1];
        if (to !== undefined) {
          checkEdge(from, to, `${dir}/package.json ${field}`, problems);
        }
      }
    }
  }

  for (const file of files) {
    const from = packageOf(file.path);
    if (from === undefined) continue;
    for (const spec of importSpecifiers(file.text)) {
      const named = /^@canvas\/([^/]+)/.exec(spec)?.[1];
      if (named !== undefined) {
        checkEdge(from, named, file.path, problems);
        continue;
      }
      if (spec.startsWith(".")) {
        const target = resolve("/", dirname(file.path), spec)
          .split(sep)
          .join("/")
          .replace(/^[A-Za-z]:/, "")
          .replace(/^\//, "");
        const to = packageOf(target);
        if (to !== undefined && to !== from) {
          problems.push({
            where: file.path,
            from,
            to,
            reason: `relative import "${spec}" reaches into packages/${to}; import @canvas/${to} instead`,
          });
        }
      }
    }
  }
  return problems;
}

/** Every .ts/.tsx/.js/.mjs file under packages/, skipping build output. */
export function readSourceFiles(root: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
        out.push({
          path: relative(root, full).split(sep).join("/"),
          text: readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(join(root, "packages"));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const problems = findDependencyProblems(
    readWorkspace(root),
    readSourceFiles(root),
  );
  for (const p of problems) {
    console.error(`${p.where}: ${p.from} -> ${p.to}: ${p.reason}`);
  }
  if (problems.length > 0) process.exit(1);
  console.log("Package dependencies follow architecture section 2.");
}
