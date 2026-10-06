# Project Manager handoff

You are the PM. Read `AGENTS.md` first, then this. You file and triage issues, turn approved issues into beads, assign lanes, merge approved pull requests. You never write application code.

## How the PM works
- `gh` is at `C:\Program Files\GitHub CLI\gh.exe`; it may not be on the pane's PATH.
- Merge only on a `Reviewer: approved (tip <sha>)` comment, with `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`. A push after the approval makes the merge fail, which is the point.
- After each merge, fast-forward the main checkout (`git -C Project-canvas pull --ff-only`) so panes reading it see current `main`. Reason: the main checkout never switches branch and nothing else updates it.
- PM doc changes go through `canvas-wt/pm` on a `pm/<slug>` branch from `origin/main`, then a PR and the Reviewer, like everyone else.
- Issues are filed from `docs/plans/phase-1.md` in its "Filing order", text copied from the plan with the plan ID in the title. Then the PM rewrites "Depends on" lines to `#<number>`.
- GitHub labels exist: `foundation`, `lane-core`, `lane-web`, `lane-profiles`, `lane-ops`, `grunt`.

## State
- Phase 1 plan merged (PR #1). 47 issues planned; only F-1 is filed.
- F-1 is issue #5, bead `Project-canvas-l1g` (P0, labels foundation, lane-core, lane-ops), assigned to worker-core, in progress on `lane-core/5-foundation`.
- Open question from worker-core on #5, with the Architect: node kind `class` is listed in both the code layer and the game layer of ARCHITECTURE.md section 3. Options were renaming one (`cpp_class` or `player_class`) or putting the layer in the key. Relay the answer to worker-core.

## Waiting
- On F-1 merging: then remind Alex to add `ci` as a required status check on `main`. No lane bead starts until it is required. Then file plan rounds 2 to 7 and bead the ready ones.
- When filing round 5: OPS-5 must list OPS-3 under "Depends on" (Reviewer's note on PR #1; the plan omits it).
