import { simpleGit, type SimpleGit } from "simple-git";

/**
 * Git access (CORE-4). Canvas reads source at a git ref (a branch, tag or
 * commit), never from the working folder, so a branch can be compared with
 * `main` (architecture section 4). It uses the user's installed git through
 * `simple-git` (stack research section 5): real git is fast on large
 * repositories and detects renames exactly as git does.
 *
 * Nothing here changes the repository: every command only reads.
 */

/** Git could not be run: not installed, not on PATH, or a wrong configured path. */
export class GitNotFoundError extends Error {
  override readonly name = "GitNotFoundError";
}

/** The folder is not a git repository, or a ref does not name a commit. */
export class GitRepositoryError extends Error {
  override readonly name = "GitRepositoryError";
}

export interface GitOptions {
  /** The repository folder (a clone of the server's source). */
  readonly repo: string;
  /**
   * The git program to run. Without it, `git` is looked up on PATH. Set it
   * when git is installed somewhere PATH does not reach, such as the copy
   * inside GitHub Desktop.
   */
  readonly gitPath?: string;
}

/** One file at a ref. */
export interface GitFile {
  /** Repository-relative path with forward slashes. */
  readonly path: string;
  /** The file's blob hash: the same content always has the same hash. */
  readonly blob: string;
  /** Git's file mode: `100644` a file, `100755` executable, `120000` a symlink. */
  readonly mode: string;
}

/** One file that differs between two refs. */
export type GitChange =
  | {
      readonly status: "added" | "modified" | "deleted" | "type-changed";
      readonly path: string;
    }
  | {
      readonly status: "renamed" | "copied";
      readonly path: string;
      readonly oldPath: string;
      /** How alike the two versions are, 0 to 100 (git's rename score). */
      readonly similarity: number;
    };

/**
 * Which question a comparison answers:
 * - `trees`: how the two refs' files differ, as they stand now;
 * - `since-merge-base`: what changed on `to` since it split from `from`
 *   (what a branch adds, ignoring later changes on `from`).
 */
export type CompareMode = "trees" | "since-merge-base";

const NOT_FOUND = (detail: string): string =>
  `Git could not be run${detail}. Canvas reads your source through git, so git must be installed. ` +
  "If you use GitHub Desktop, its git is not on PATH: install Git for Windows (https://git-scm.com), " +
  "or set Canvas's git path to the git.exe inside GitHub Desktop's folder.";

/** Opens a repository for reading, after checking git can run there. */
export async function openRepo(options: GitOptions): Promise<GitRepo> {
  const git = simpleGit({
    baseDir: options.repo,
    ...(options.gitPath === undefined
      ? {}
      : {
          binary: options.gitPath,
          // A configured path may hold spaces (C:\Program Files\...), which
          // simple-git refuses unless told. The path comes from the user's
          // own settings, never from repository content, and is checked to
          // be git just below.
          unsafe: { allowUnsafeCustomBinary: true },
        }),
  });
  const version = await git.version().catch(() => undefined);
  if (version === undefined || !version.installed) {
    throw new GitNotFoundError(
      NOT_FOUND(
        options.gitPath === undefined
          ? " (no git on PATH)"
          : ` at '${options.gitPath}'`,
      ),
    );
  }
  const inside = await git
    .raw(["rev-parse", "--is-inside-work-tree"])
    .catch(() => "false");
  if (inside.trim() !== "true") {
    throw new GitRepositoryError(`'${options.repo}' is not a git repository`);
  }
  return new GitRepo(git);
}

export class GitRepo {
  constructor(private readonly git: SimpleGit) {}

  /** The commit a ref names, as a full hash. */
  async resolve(ref: string): Promise<string> {
    try {
      const sha = await this.git.raw([
        "rev-parse",
        "--verify",
        "--quiet",
        "--end-of-options",
        `${ref}^{commit}`,
      ]);
      const hash = sha.trim();
      if (!/^[0-9a-f]{40,64}$/.test(hash)) throw new Error(hash);
      return hash;
    } catch {
      throw new GitRepositoryError(
        `'${ref}' does not name a commit in this repository`,
      );
    }
  }

  /** Every file at a ref, with its blob hash, in path order. */
  async listFiles(ref: string): Promise<GitFile[]> {
    const commit = await this.resolve(ref);
    const out = await this.git.raw([
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      commit,
    ]);
    const files: GitFile[] = [];
    for (const entry of out.split("\0")) {
      if (entry === "") continue;
      // "<mode> <type> <hash>\t<path>"; -z keeps the path exactly as stored.
      const tab = entry.indexOf("\t");
      const [mode, type, blob] = entry.slice(0, tab).split(" ");
      // Submodules are commits, not files of this repository.
      if (type !== "blob" || mode === undefined || blob === undefined) continue;
      files.push({ path: entry.slice(tab + 1), blob, mode });
    }
    return files;
  }

  /** A file's bytes at a ref. */
  async readFile(ref: string, path: string): Promise<Uint8Array> {
    const commit = await this.resolve(ref);
    try {
      const content: unknown = await this.git.binaryCatFile([
        "blob",
        `${commit}:${path}`,
      ]);
      if (!(content instanceof Uint8Array)) throw new Error("not bytes");
      return content;
    } catch {
      throw new GitRepositoryError(`'${path}' is not a file at '${ref}'`);
    }
  }

  /**
   * The files that differ between two refs, with renames detected the way
   * git does by default (at least 50% alike). `mode` says which question
   * the comparison answers (see `CompareMode`).
   */
  async changedFiles(
    from: string,
    to: string,
    mode: CompareMode,
  ): Promise<GitChange[]> {
    const [a, b] = await Promise.all([this.resolve(from), this.resolve(to)]);
    const range = mode === "trees" ? [a, b] : [`${a}...${b}`];
    const out = await this.git.raw([
      "diff",
      "--name-status",
      "-z",
      "-M",
      "--no-ext-diff",
      ...range,
    ]);
    return parseNameStatus(out);
  }
}

/** Reads `git diff --name-status -z` output. */
export function parseNameStatus(out: string): GitChange[] {
  const parts = out.split("\0");
  const changes: GitChange[] = [];
  for (let i = 0; i < parts.length;) {
    const code = parts[i++];
    if (code === undefined || code === "") continue;
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      const oldPath = parts[i++]!;
      const path = parts[i++]!;
      changes.push({
        status: letter === "R" ? "renamed" : "copied",
        path,
        oldPath,
        similarity: Number(code.slice(1)),
      });
      continue;
    }
    const path = parts[i++]!;
    const status =
      letter === "A"
        ? "added"
        : letter === "D"
          ? "deleted"
          : letter === "T"
            ? "type-changed"
            : "modified";
    changes.push({ status, path });
  }
  return changes;
}
