import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  GitNotFoundError,
  GitRepositoryError,
  openRepo,
  parseNameStatus,
  type GitRepo,
} from "../../src/index.js";

// Every test here starts real git processes, which a busy Windows runner
// can take seconds to spawn; the 5-second default is too tight there.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

/**
 * Removes a temporary folder. Windows can refuse for a moment while a git
 * process that just exited still holds a file, so it retries.
 */
const remove = (path: string): void => {
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
};

let dir: string;
let repo: GitRepo;
const BINARY = Uint8Array.from([0, 1, 2, 255, 13, 10, 0]);

/** Runs git in the test repository, with a fixed identity and no global config. */
const git = (...args: string[]): string =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Canvas Test",
      "-c",
      "user.email=test@canvas.invalid",
      ...args,
    ],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "", GIT_CONFIG_NOSYSTEM: "1" },
    },
  );
const write = (path: string, content: string | Uint8Array): void => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), content);
};

/**
 * main:     a.txt, src/script.cpp, data.bin (binary), "dir with space/c.lua"
 * feature:  from main's first commit: a.txt changed, src/script.cpp renamed
 *           to src/spell_script.cpp (lightly edited), data.bin deleted,
 *           new.txt added
 * main then gains main-only.txt, after feature split off.
 */
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "canvas-git-"));
  git("init", "--quiet", "--initial-branch=main");
  git("config", "core.autocrlf", "false");
  write("a.txt", "alpha\n");
  const script = Array.from({ length: 20 }, (_, i) => `void f${i}() {}\n`).join(
    "",
  );
  write("src/script.cpp", script);
  write("data.bin", BINARY);
  write("dir with space/c.lua", "print('hi')\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "first");

  git("switch", "--quiet", "-c", "feature");
  write("a.txt", "alpha, changed\n");
  git("mv", "src/script.cpp", "src/spell_script.cpp");
  write("src/spell_script.cpp", `${script}void extra() {}\n`);
  git("rm", "--quiet", "data.bin");
  write("new.txt", "new\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "feature work");

  git("switch", "--quiet", "main");
  write("main-only.txt", "later on main\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "later on main");

  repo = await openRepo({ repo: dir });
});

afterAll(() => {
  remove(dir);
});

describe("reading at a ref", () => {
  test("lists every file with its blob hash and mode, as git stores them", async () => {
    const files = await repo.listFiles("main");
    expect(files.map((f) => f.path)).toEqual([
      "a.txt",
      "data.bin",
      "dir with space/c.lua",
      "main-only.txt",
      "src/script.cpp",
    ]);
    const a = files.find((f) => f.path === "a.txt")!;
    expect(a.mode).toBe("100644");
    expect(a.blob).toBe(git("rev-parse", "main:a.txt").trim());
  });

  test("lists another ref's files without touching the working folder", async () => {
    const files = await repo.listFiles("feature");
    expect(files.map((f) => f.path)).toEqual([
      "a.txt",
      "dir with space/c.lua",
      "new.txt",
      "src/spell_script.cpp",
    ]);
    expect(git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
  });

  test("reads a file's exact bytes at a ref, binary and spaced paths included", async () => {
    expect(await repo.readFile("main", "data.bin")).toEqual(
      Buffer.from(BINARY),
    );
    expect(
      new TextDecoder().decode(
        await repo.readFile("main", "dir with space/c.lua"),
      ),
    ).toBe("print('hi')\n");
    expect(
      new TextDecoder().decode(await repo.readFile("feature", "a.txt")),
    ).toBe("alpha, changed\n");
  });

  test("a missing file or ref is a clear error", async () => {
    await expect(repo.readFile("feature", "data.bin")).rejects.toThrow(
      GitRepositoryError,
    );
    await expect(repo.readFile("main", "nope.txt")).rejects.toThrow(
      "'nope.txt' is not a file at 'main'",
    );
    await expect(repo.resolve("no-such-branch")).rejects.toThrow(
      "'no-such-branch' does not name a commit",
    );
  });

  test("a ref is never taken as a git option", async () => {
    await expect(repo.resolve("--help")).rejects.toThrow(GitRepositoryError);
    await expect(repo.listFiles("--output=x")).rejects.toThrow(
      GitRepositoryError,
    );
  });

  test("resolve gives the full commit hash", async () => {
    expect(await repo.resolve("main")).toBe(git("rev-parse", "main").trim());
  });
});

describe("comparing two refs", () => {
  test("trees: how the two refs differ now, renames detected", async () => {
    const changes = await repo.changedFiles("main", "feature", "trees");
    expect(changes).toEqual(
      expect.arrayContaining([
        { status: "modified", path: "a.txt" },
        { status: "deleted", path: "data.bin" },
        // main-only.txt is on main and not on feature.
        { status: "deleted", path: "main-only.txt" },
        { status: "added", path: "new.txt" },
        expect.objectContaining({
          status: "renamed",
          oldPath: "src/script.cpp",
          path: "src/spell_script.cpp",
        }),
      ]),
    );
    expect(changes).toHaveLength(5);
    const rename = changes.find((c) => c.status === "renamed");
    expect(
      rename && "similarity" in rename ? rename.similarity : 0,
    ).toBeGreaterThanOrEqual(50);
  });

  test("since-merge-base: only what the branch changed, not later work on main", async () => {
    const changes = await repo.changedFiles(
      "main",
      "feature",
      "since-merge-base",
    );
    expect(changes.map((c) => c.path).sort()).toEqual([
      "a.txt",
      "data.bin",
      "new.txt",
      "src/spell_script.cpp",
    ]);
  });
});

describe("finding git", () => {
  test("a configured git path works, spaces included", async () => {
    const lookup = process.platform === "win32" ? "where" : "which";
    const path = execFileSync(lookup, ["git"], { encoding: "utf8" })
      .split(/\r?\n/)[0]!
      .trim();
    const configured = await openRepo({ repo: dir, gitPath: path });
    expect(await configured.resolve("main")).toBe(await repo.resolve("main"));
  });

  test("a git path that isn't git is a typed error that helps GitHub Desktop users", async () => {
    const err = await openRepo({
      repo: dir,
      gitPath: join(dir, "no-git-here.exe"),
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitNotFoundError);
    expect((err as Error).message).toMatch(
      /Git could not be run at '.*no-git-here\.exe'/,
    );
    expect((err as Error).message).toContain("GitHub Desktop");
  });

  test("a folder that is not a repository is a clear error", async () => {
    const plain = mkdtempSync(join(tmpdir(), "canvas-not-git-"));
    try {
      await expect(openRepo({ repo: plain })).rejects.toThrow(
        GitRepositoryError,
      );
    } finally {
      remove(plain);
    }
  });
});

test("name-status output is read exactly, -z separated", () => {
  expect(
    parseNameStatus(
      "M\0a.txt\0R087\0old name.cpp\0new name.cpp\0A\0b\0D\0c\0T\0d\0C100\0e\0f\0",
    ),
  ).toEqual([
    { status: "modified", path: "a.txt" },
    {
      status: "renamed",
      oldPath: "old name.cpp",
      path: "new name.cpp",
      similarity: 87,
    },
    { status: "added", path: "b" },
    { status: "deleted", path: "c" },
    { status: "type-changed", path: "d" },
    { status: "copied", oldPath: "e", path: "f", similarity: 100 },
  ]);
});
