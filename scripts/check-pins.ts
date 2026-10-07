/**
 * Fails if any dependency in any package.json is not an exact version.
 *
 * Why: several of Canvas's dependencies are under three months old (stack
 * research, risk 9). A range such as `^5.0.0` would let a fresh install pick
 * up a newer release nobody tested. An exact version (`5.0.3`) plus the
 * lockfile means every install gets exactly what CI tested.
 *
 * Run: `pnpm check:pins`.
 */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  DEPENDENCY_FIELDS,
  readWorkspace,
  type WorkspacePackage,
} from "./workspace.ts";

/** `1.2.3` or `1.2.3-beta.1`; no ranges, tags, URLs or wildcards. */
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** A link to another package in this repository, always the local copy. */
const WORKSPACE = "workspace:*";

export interface PinProblem {
  readonly dir: string;
  readonly field: string;
  readonly name: string;
  readonly spec: string;
}

export function isExact(spec: string): boolean {
  if (spec === WORKSPACE) return true;
  // An alias such as `npm:@typescript/typescript6@6.0.3` is exact when its version is.
  const alias = /^npm:(?:@[^@/]+\/)?[^@]+@(.+)$/.exec(spec);
  return EXACT.test(alias?.[1] ?? spec);
}

export function findLoosePins(
  packages: readonly WorkspacePackage[],
): PinProblem[] {
  const problems: PinProblem[] = [];
  for (const { dir, manifest } of packages) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (!isExact(spec)) problems.push({ dir, field, name, spec });
      }
    }
    const pm = manifest.packageManager;
    if (pm !== undefined && !/^pnpm@\d+\.\d+\.\d+$/.test(pm)) {
      problems.push({ dir, field: "packageManager", name: "pnpm", spec: pm });
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const problems = findLoosePins(readWorkspace(root));
  for (const p of problems) {
    console.error(
      `${p.dir}/package.json ${p.field}: ${p.name} "${p.spec}" is not an exact version`,
    );
  }
  if (problems.length > 0) process.exit(1);
  console.log("All dependency versions are exact.");
}
