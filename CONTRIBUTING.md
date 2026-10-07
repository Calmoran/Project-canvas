# Contributing to Canvas

Canvas is a TypeScript monorepo: one repository holding five packages under `packages/` (`core`, `profiles`, `server`, `web`, `cli`). How they depend on each other is fixed in `docs/ARCHITECTURE.md` section 2, and `pnpm check:deps` enforces it.

## Setup

You need Node.js 24 or newer and git.

Canvas uses pnpm, a package manager that installs each package's dependencies strictly, so a package cannot use a library it did not declare. The exact pnpm version is pinned in the root `package.json` (`packageManager`). Corepack, Node's tool for running the pinned version of a package manager, fetches it for you:

```sh
corepack enable        # Node 24 ships corepack; on Node 25+ run `npm install -g corepack` first
pnpm install
```

If `corepack enable` fails for lack of permission (common on Windows), run every command below as `corepack pnpm <command>` instead.

## Commands

| Command             | What it does                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm build`        | Compiles every package with TypeScript (`tsc -b`, in dependency order) |
| `pnpm typecheck`    | Type-checks packages, tests and repo scripts                           |
| `pnpm lint`         | ESLint with type-aware rules; any warning fails                        |
| `pnpm format`       | Rewrites files into Prettier's layout                                  |
| `pnpm format:check` | Fails if any file is not in Prettier's layout                          |
| `pnpm test`         | Runs every package's tests (Vitest)                                    |
| `pnpm check:pins`   | Fails if any dependency is not an exact version                        |
| `pnpm check:deps`   | Fails if a package imports one it must not                             |
| `pnpm check`        | All of the above except `build` and `format`                           |

CI runs the same commands on Linux and Windows, on Node 24 and 26.

### MySQL tests

Tests that need a MySQL server read its address from `CANVAS_TEST_MYSQL_URL` (for example `mysql://root:secret@127.0.0.1:3306`) and are skipped when it is unset. They create and drop a database named `canvas_fixture`, so point them at a throwaway server, never at a real one. CI runs them on Linux against a MySQL 8 service container.

The profile's citation check reads the clean AzerothCore checkout from `CANVAS_SOURCE_CORE` (a folder path; one variable per profile source, so `mod-ale` would be `CANVAS_SOURCE_MOD_ALE`) and is skipped when it is unset, as in CI. It reads each cited file as it is at the commit recorded in the profile, through git, so local edits in that checkout do not affect it.

## Dependencies

Every dependency is pinned to an exact version (`1.2.3`, never `^1.2.3`), so every install gets what CI tested. `pnpm add` already writes exact versions here.

## Branches, worktrees and pull requests

The rules every contributor and agent follows are in `AGENTS.md`: one GitHub issue per piece of work, one branch per issue named `<lane>/<issue>-<slug>`, a pull request that says `Closes #<issue>`, green CI and a review before merge. Read it before your first pull request.
