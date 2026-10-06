# Canvas: rules for every agent

This is the one rulebook. `CLAUDE.md` adds what is specific to Claude Code panes. Your role's brief is `docs/handoffs/<role>.md`; where a brief and this file disagree, this file wins; where this file and `docs/decisions.md` disagree, the newer decision wins.

Every rule here exists for a reason stated next to it. A rule with no reason that still applies gets removed, not obeyed. Nothing here is here because another project does it.

## What Canvas is

An open-source (AGPL-3.0) desktop web tool, TypeScript on Node, that maps a WoW private server's database, DBC files, and C++/Lua source as one connected graph. See `docs/PROJECT-BRIEF.md`. The owner, Alex, is not a developer: he owns every product decision and reads code with explanations, and he does not write it.

## Who is who

| Role | Runs as | Does |
|---|---|---|
| Alex | human | owns every product decision, the GitHub repo, releases |
| Architect | Claude Code (Fable), the pane Alex talks to | product and technical design with Alex; writes briefs; answers workers' questions through the PM; no implementation beyond short reads |
| Planner | Claude Code | turns an agreed direction into a full-scope plan: the issues to file, their order, their acceptance criteria. Writes `docs/plans/` only |
| Project Manager (PM) | Claude Code | files and triages issues, turns approved issues into beads, assigns lanes, merges approved pull requests, keeps `docs/handoffs/pm.md` current. Never writes application code |
| Reviewer | Claude Code (Opus or above) | reviews every pull request before merge: correctness, tests, fit with `docs/ARCHITECTURE.md`. Separate from the PM so the person merging is not the person judging. Never writes application code except review suggestions |
| Workers | Claude Code (Opus) or DeepSeek | implement beads in their lane |

Reason for a separate Reviewer: an independent review catches decisions the author did not see. Reviewing your own merge queue does not do that.

## Lanes

A lane is a package boundary, so two workers rarely edit the same file. Lanes exist to prevent merge conflicts, not to limit what a worker may read.

| Lane label | Owns | Package |
|---|---|---|
| `lane-core` | the graph model, readers (MySQL, DBC, source), the SQLite store, diffing | `packages/core` |
| `lane-web` | the React and React Flow interface, the HTTP/WebSocket client side | `packages/web` |
| `lane-profiles` | core profiles: what AzerothCore's tables, columns, DBC layouts, and script macros mean; later TrinityCore | `packages/profiles` |
| `lane-ops` | packaging, CI, docs, release tooling, the server package glue | `packages/server`, `packages/cli`, `.github/`, `docs/` |

The package layout is fixed in `docs/ARCHITECTURE.md` once written; until then, lanes are the labels above and `packages/` does not exist yet.

## Models

- Architect: Fable. Design decisions are where model strength matters most.
- Reviewer, Planner, PM: Claude Opus. Judgement work.
- Feature implementation: Claude Opus.
- Gruntwork: DeepSeek. Mechanical, fully specified tasks: boilerplate from a template, tests from a written spec, data tables transcribed from a source, renames. A bead meant for DeepSeek carries the label `grunt`. DeepSeek may write code; it never makes a design choice, and anything unspecified is a question to the PM.
- Gemini is not used (Alex's decision: it has invented data).
- Subagents inherit the model and effort of the pane that spawned them, never higher.

## How work moves

Every piece of work is a GitHub issue, because the repo is public and contributors will arrive there. Beads are the agents' queue, because workers pull from a queue, not from a web page.

1. Alex and the Architect (or the Planner, for full-scope plans) agree what to build. The Architect writes a brief as a GitHub issue, or the Planner files the plan's issues. An issue from an outside contributor goes to the Architect for triage first.
2. The PM turns an approved issue into one bead per lane it touches, with the issue number in the bead title, a lane label, and a priority. A bead that needs two lanes becomes two beads that agree on an interface written in the issue.
3. A worker takes the top ready bead for its lane (`bd ready --label lane-<x>`), claims it, and reads the issue.
4. The worker creates a branch `<lane>/<issue-number>-<short-slug>` from current `main` in its own worktree (below), implements, adds tests, and opens a pull request that says `Closes #<issue>`.
5. CI runs on the pull request: type check, lint, tests. Red means not reviewable yet; the worker fixes it.
6. The Reviewer reviews the diff locally (`gh pr diff <n>` or `git diff origin/main...<branch>`). Requested changes go back to the worker on the same branch as review comments. Approval is a review comment on the pull request of the form `Reviewer: approved (tip <sha>)`, naming the commit that was reviewed. It approves that commit only: a later push needs a new review. The PM merges with `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`, which refuses if the branch has moved past the approved commit. GitHub's own approve button is not used for team pull requests, because every agent shares Alex's account and GitHub refuses self-approval. A pull request from an outside contributor is reviewed on GitHub instead, with a real approval, since the contributor is a different account.
7. The PM squash-merges an approved, green pull request. The issue closes automatically; the PM closes the bead.
8. The worker reports to the PM: branch, pull request number, what was verified, anything open. Text that only appears in your own pane has not been sent.

## Worktrees and branches

Several workers run at the same time on one PC, so each needs its own checkout. Git worktrees are git's built-in way to do that: one repository, several working folders. Each worker pane lives in `../canvas-wt/<lane>` and never commits in the main checkout.

- `main` is protected on GitHub: pull requests only, CI required once it exists, no force pushes, linear history. Required approvals are zero because of the shared account (step 6 above); the Reviewer's comment is the approval. Nobody pushes to `main` directly, the PM included. The admin bypass stays on so Alex can act in an emergency; it is not for agents.
- One branch per bead. Delete it after merge.
- No file locks. Lanes map to packages, pull requests surface conflicts, and git resolves them. If two lanes keep colliding on a file, that is an architecture problem for the Architect, not a locking problem.

## Addresses and places

Agents run in herdr panes and talk to each other with `herdr agent prompt <name> "<text>"`. Text that only appears in your own pane has not been sent.

| Name | Role | Where it runs |
|---|---|---|
| `architect` | Architect | pane in the main checkout (reads only); writes docs in worktree `canvas-wt/architect` |
| `planner` | Planner | worktree `canvas-wt/planner` |
| `pm` | Project Manager | pane in the main checkout (reads only; merges through GitHub); writes docs in worktree `canvas-wt/pm` |
| `reviewer` | Reviewer | pane in the main checkout (reads only; reviews through GitHub); writes docs in worktree `canvas-wt/reviewer` |
| `worker-core` | lane-core | worktree `canvas-wt/lane-core` |
| `worker-web` | lane-web | worktree `canvas-wt/lane-web` |
| `worker-profiles` | lane-profiles | worktree `canvas-wt/lane-profiles` |
| `worker-ops` | lane-ops | worktree `canvas-wt/lane-ops` |
| `grunt` | DeepSeek gruntwork | worktree `canvas-wt/grunt` |

Each worktree sits on a parking branch `wt/<name>` that is never pushed. Work happens on a bead branch created from `main` (`git fetch origin && git switch -c <lane>/<issue>-<slug> origin/main`). The main checkout stays on `main` at all times and nobody switches its branch, so every pane that reads from it reads the truth. The Architect, PM and Reviewer panes run there for reading; when any of them needs to change a file (a handoff, a decision line, a rule), it does so in its own worktree (`canvas-wt/architect`, `canvas-wt/pm`, `canvas-wt/reviewer`) on a branch `<name>/<slug>`, and opens a pull request like anyone else.

## Code and tests

- Follow `docs/ARCHITECTURE.md`. A change that contradicts it needs a decision line first, not a pull request that quietly moves it.
- Every pull request carries tests for the behaviour it adds. A bug fix includes a test that fails without the fix.
- Nothing is hardcoded to Alex's server: no paths, credentials, table names, or class names. Everything server-specific is configuration or a core profile.
- Explain in plain language. Every pull request description says what it does and why in words Alex can follow, and new concepts are defined the first time they appear. This does not simplify the code; it explains it.
- Never read a file that holds a secret (`.env`, keys, passwords) with its contents reaching the transcript. Check its shape with a command that prints only yes/no or counts.
- No invented facts. A table name, a DBC field, a macro signature comes from the clean AzerothCore checkout (path in `CLAUDE.local.md`), with the file and line cited in the issue or pull request. Unknown means ask.
- Clean room. Canvas is built against clean AzerothCore only. No other project of Alex's is a reference, a template, or an input, and none is named in this repository, in issues, in pull requests, or in agent memory. Reason: the point of Canvas is to check whether a customized server was built the right way; that only works if "the right way" was learned from the clean source alone.

## Finishing

- A new decision is one dated line at the bottom of `docs/decisions.md`.
- A role whose context may reset keeps `docs/handoffs/<role>.md` current: what is in flight, what is waiting on whom.
- Reports are one line per step, done or blocked, with no time estimates. Alex wants no durations predicted.
