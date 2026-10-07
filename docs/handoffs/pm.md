# Project Manager handoff

You are the PM. Read `AGENTS.md` first, then this. You file and triage issues, turn approved issues into beads, assign lanes, merge approved pull requests. You never write application code.

## How the PM works
- `gh` is at `C:\Program Files\GitHub CLI\gh.exe`; it may not be on the pane's PATH.
- Merge only on a `Reviewer: approved (tip <sha>)` comment, with `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`. A push after the approval makes the merge fail, which is the point. `main` requires the `ci` check and branches up to date with `main` (strict), so a PR behind `main` must be updated by its author before it can merge.
- After each merge, fast-forward the main checkout (`git pull --ff-only`, run from the main checkout pane) so panes reading it see current `main`. Reason: the main checkout never switches branch and nothing else updates it.
- After a merge: close the bead (`bd close <id> --force --reason ...`; `--force` because the bead's assignee is the worker, and closing is the PM's job), clear the worker's chat (`herdr agent prompt <name> "/clear"`; omp panes: `/new`), then send `take the next bead`.
- PM doc changes go through `canvas-wt/pm` on a `pm/<slug>` branch from `origin/main`, then a PR and the Reviewer, like everyone else.
- Issues are filed from `docs/plans/phase-1.md` in its "Filing order", text copied from the plan with the plan ID in the title, and a header saying `docs/ARCHITECTURE.md` and `docs/decisions/f1-choices.md` win where the plan text is older. "Depends on" lines get `#<number>`; beads get the same dependency (`--deps blocked-by:<bead>`).
- Decisions (AGENTS.md, PR #11): every decision is Alex's. A worker question that needs one goes PM -> Architect -> Alex; the PM never answers it and nothing is treated as decided until Alex says so. Work not depending on it continues.
- Reporting (AGENTS.md): report to the Architect only for a decision, a blocker or a milestone (a lane opened, a wave done). Routine merges and reviews are not reported.
- GitHub labels: `foundation`, `lane-core`, `lane-web`, `lane-profiles`, `lane-ops`, `grunt`, `spike`.

## State
- F-1 merged (PR #15, 7a1c8c6); `ci` is a required check on `main`.
- Wave 1 (plan round 2) filed and beaded, lanes open:
  - worker-core: #17 CORE-1, #18 CORE-2, #19 CORE-3, #20 CORE-4.
  - worker-profiles: #21 PROF-1 (P0, critical path).
  - grunt: #22 PROF-2, blocked on PROF-1. Tell grunt when #21 merges.
  - worker-ops: #23 OPS-1 (P0); #26 Markdown formatting follow-up (choice 9c, lowest priority, starts only when no docs PR is open).
  - worker-web: #24 WEB-1 spike, then #25 WEB-2, blocked on OPS-1.

## Waiting
- WEB-1's conclusion: if card nodes are too slow, route to the Architect before WEB-5 is filed.
- On Alex, via the Architect: the OPS-4 credential library. The plan still has the worker pick it; the Planner holds the plan edit until Alex decides. Do not file OPS-4 until the plan is fixed.
- Next filing: plan round 3, once its dependencies are near (it mostly needs wave 1 merged).
