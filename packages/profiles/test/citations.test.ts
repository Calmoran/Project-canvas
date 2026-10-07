import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCitation } from "@canvas/core";
import { afterAll, describe, expect, test } from "vitest";
import type { CitationUse } from "../src/index.js";
import {
  checkoutEnvName,
  citationProblems,
  gitReader,
  lineCount,
} from "./support/citations.js";

const use = (text: string): CitationUse => ({
  path: "edges.0.source.0",
  citation: parseCitation(text)!,
});

describe("lineCount", () => {
  test.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["one\ntwo", 2],
    ["one\r\ntwo\r\n", 2],
  ])("%j has %i lines", (text, lines) => {
    expect(lineCount(text)).toBe(lines);
  });
});

describe("citationProblems", () => {
  const files: Record<string, string> = { "src/a.cpp": "1\n2\n3\n" };
  const read = (path: string) => files[path];

  test("accepts lines and ranges within the file", () => {
    expect(
      citationProblems(
        [use("core:src/a.cpp:1"), use("core:src/a.cpp:2-3")],
        read,
      ),
    ).toEqual([]);
  });

  test("reports a missing file", () => {
    expect(citationProblems([use("core:src/b.cpp:1")], read)).toEqual([
      {
        path: "edges.0.source.0",
        message: "core:src/b.cpp:1: the file does not exist",
      },
    ]);
  });

  test("reports a line or range end past the end of the file", () => {
    const problems = citationProblems(
      [use("core:src/a.cpp:4"), use("core:src/a.cpp:2-9")],
      read,
    );
    expect(problems.map((p) => p.message)).toEqual([
      "core:src/a.cpp:4: line 4 is past the end of the file (3 lines)",
      "core:src/a.cpp:2: line 9 is past the end of the file (3 lines)",
    ]);
  });

  test("reads each file once", () => {
    let reads = 0;
    citationProblems(
      [use("core:src/a.cpp:1"), use("core:src/a.cpp:2")],
      (p) => {
        reads++;
        return files[p];
      },
    );
    expect(reads).toBe(1);
  });
});

test("checkout variables are named after the source", () => {
  expect(checkoutEnvName("core")).toBe("CANVAS_SOURCE_CORE");
  expect(checkoutEnvName("mod-ale")).toBe("CANVAS_SOURCE_MOD_ALE");
});

describe("gitReader", () => {
  // A throwaway repository: one commit, then a working-folder edit that the
  // reader must not see.
  const dir = mkdtempSync(join(tmpdir(), "canvas-profiles-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "core.autocrlf=false", ...args], {
      encoding: "utf8",
    }).trim();
  git("init", "-q");
  writeFileSync(join(dir, "a.cpp"), "1\n2\n");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "c.cpp"), "1\n");
  git("add", "a.cpp", "src/c.cpp");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.invalid",
    "commit",
    "-qm",
    "c",
  );
  const commit = git("rev-parse", "HEAD");
  writeFileSync(join(dir, "a.cpp"), "1\n2\n3\n4\n");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("reads a file as it is at the commit, not in the working folder", () => {
    expect(gitReader(dir, commit)("a.cpp")).toBe("1\n2\n");
  });

  test("returns undefined for a file not in the commit", () => {
    expect(gitReader(dir, commit)("b.cpp")).toBeUndefined();
  });

  test("returns undefined for a folder: only a file can be cited", () => {
    expect(gitReader(dir, commit)("src")).toBeUndefined();
    expect(gitReader(dir, commit)("src/c.cpp")).toBe("1\n");
  });

  test("throws when the checkout lacks the commit", () => {
    expect(() => gitReader(dir, "0".repeat(40))).toThrow();
  });
});
