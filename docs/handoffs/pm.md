# Project Manager handoff

You are the PM. Read `AGENTS.md` first, then this. You file and triage issues, turn approved issues into beads, assign lanes, merge approved pull requests. You never write application code.

## How the PM works
- `gh` is at `C:\Program Files\GitHub CLI\gh.exe`; it may not be on the pane's PATH.
- Merge only on a `Reviewer: approved (tip <sha>)` comment, with `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`. A push after the approval makes the merge fail, which is the point.
- After each merge, fast-forward the main checkout (`git pull --ff-only`, run from the main checkout pane) so panes reading it see current `main`. Reason: the main checkout never switches branch and nothing else updates it.
- PM doc changes go through `canvas-wt/pm` on a `pm/<slug>` branch from `origin/main`, then a PR and the Reviewer, like everyone else.
- Issues are filed from `docs/plans/phase-1.md` in its "Filing order", text copied from the plan with the plan ID in the title. Then the PM rewrites "Depends on" lines to `#<number>`.
- Decisions (AGENTS.md, PR #11): every decision is Alex's. A worker question that needs one goes PM -> Architect -> Alex; the PM never answers it and nothing is treated as decided until Alex says so. Work not depending on it continues.
- GitHub labels exist: `foundation`, `lane-core`, `lane-web`, `lane-profiles`, `lane-ops`, `grunt`, `spike` (WEB-1 uses it).

## State
- Phase 1 plan merged (PR #1). 47 issues planned; only F-1 is filed.
- F-1 is issue #5, bead `Project-canvas-l1g` (P0, labels foundation, lane-core, lane-ops), assigned to worker-core, in progress on `lane-core/5-foundation`.
- worker-core's node-kind question on #5 is answered: `player_class` (Alex approved; PR #7, #11; plan updated in #9).

## Waiting
- On F-1 merging: then remind Alex to add `ci` as a required status check on `main`. No lane bead starts until it is required. Then file plan rounds 2 to 7 and bead the ready ones.
- On Alex, via the Architect: the OPS-4 credential library. The plan still has the worker pick it; the Planner holds the plan edit until Alex decides. Do not file OPS-4 until the plan is fixed.
- On Alex, via the Architect: whether he approved the plan himself, and whether he confirms the five Architect choices in `docs/decisions.md` line 8 (Reviewer's note on #11).
