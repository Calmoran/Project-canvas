import { execFileSync } from "node:child_process";
import type { CitationUse, ProfileProblem } from "../../src/index.js";

/** Reads one file's text, or undefined when the file does not exist. */
export type FileReader = (path: string) => string | undefined;

/**
 * The environment variable that holds the checkout of one profile source:
 * `core` is `CANVAS_SOURCE_CORE`, `mod-ale` is `CANVAS_SOURCE_MOD_ALE`.
 */
export function checkoutEnvName(source: string): string {
  return `CANVAS_SOURCE_${source.toUpperCase().replaceAll("-", "_")}`;
}

/** How many lines a text has; a final newline does not start another one. */
export function lineCount(text: string): number {
  if (text === "") return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}

/**
 * Checks each citation against the files `read` returns: the file must
 * exist and every cited line must be within its length. Each file is read
 * once however often it is cited.
 */
export function citationProblems(
  uses: readonly CitationUse[],
  read: FileReader,
): ProfileProblem[] {
  const lengths = new Map<string, number | undefined>();
  const problems: ProfileProblem[] = [];
  for (const { path, citation } of uses) {
    if (!lengths.has(citation.path)) {
      const text = read(citation.path);
      lengths.set(
        citation.path,
        text === undefined ? undefined : lineCount(text),
      );
    }
    const length = lengths.get(citation.path);
    const cited = `${citation.source}:${citation.path}:${citation.first}`;
    if (length === undefined) {
      problems.push({ path, message: `${cited}: the file does not exist` });
    } else if (citation.last > length) {
      problems.push({
        path,
        message: `${cited}: line ${citation.last} is past the end of the file (${length} lines)`,
      });
    }
  }
  return problems;
}

/**
 * Reads files as they are at `commit` in the git checkout at `dir`, never
 * from the working folder, so local edits in the checkout cannot change
 * what a citation points at. Only a file counts: a cited folder reads as
 * missing. Throws if the checkout lacks the commit.
 */
export function gitReader(dir: string, commit: string): FileReader {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  git("cat-file", "-e", `${commit}^{commit}`);
  return (path) => {
    const object = `${commit}:${path}`;
    try {
      if (git("cat-file", "-t", object).trim() !== "blob") return undefined;
      return git("cat-file", "blob", object);
    } catch {
      return undefined;
    }
  };
}
