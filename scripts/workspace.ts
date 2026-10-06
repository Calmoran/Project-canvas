import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The parts of a package.json the checks read. */
export interface Manifest {
  readonly name?: string;
  readonly packageManager?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

export interface WorkspacePackage {
  /** Folder relative to the repo root, e.g. `packages/core`. */
  readonly dir: string;
  readonly manifest: Manifest;
}

export const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

/** The root package.json plus every `packages/*` package.json. */
export function readWorkspace(root: string): WorkspacePackage[] {
  const read = (dir: string): WorkspacePackage => ({
    dir,
    manifest: JSON.parse(
      readFileSync(join(root, dir, "package.json"), "utf8"),
    ) as Manifest,
  });
  const packagesDir = join(root, "packages");
  const children = existsSync(packagesDir)
    ? readdirSync(packagesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .filter((d) => existsSync(join(packagesDir, d.name, "package.json")))
        .map((d) => `packages/${d.name}`)
        .sort()
    : [];
  return [read("."), ...children.map(read)];
}
