# Project Manager handoff

You are the PM. Read `AGENTS.md` first, then this. You file and triage issues, turn approved issues into beads, assign lanes, merge approved pull requests. You never write application code.

## How the PM works

- `gh` is at `C:\Program Files\GitHub CLI\gh.exe`; it may not be on the pane's PATH.
- Merge only on a `Reviewer: approved (tip <sha>)` comment, with `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`. A push after the approval makes the merge fail, which is the point. `main` requires the `ci` check and branches up to date with `main` (strict), so a PR behind `main` must be updated by its author before it can merge, then re-checked by the Reviewer (a range-diff).
- Several PRs ready at once: merge one, then ask the next author to rebase, in sequence, so nobody rebases twice. Before asking for a rebase, check whether the author has already pushed one (`gh pr view <n> --json headRefOid`).
- A PR whose branch conflicts with `main` gets no CI run at all. "No checks" usually means a conflict or a queued run (`gh run list --branch <b>`).
- After each merge, fast-forward the main checkout (`git pull --ff-only`, run from the main checkout pane) so panes reading it see current `main`. Reason: the main checkout never switches branch and nothing else updates it.
- After a merge, close the bead. If `bd close` refuses, read why first. Use `--force` only when the sole reason is that the assignee is the worker (closing is the PM's job), since `--force` also skips blockers.
- Clearing a worker's chat (AGENTS.md): only when the worker has no other bead in progress. From Git Bash, a leading `/` is rewritten into a Windows path, so send it as `MSYS_NO_PATHCONV=1 herdr agent prompt <name> "/clear"` (omp panes: `/new`). Confirm it ran: the session id in `herdr agent get <name>` changes. A clear sent while the agent is busy is queued and runs after its current turn. Then send `take the next bead`.
- PM doc changes go through `canvas-wt/pm` on a `pm/<slug>` branch from `origin/main`, then a PR and the Reviewer, like everyone else.
- Issues are filed from `docs/plans/phase-1.md` in its "Filing order", text copied from the plan with the plan ID in the title, and a header saying `docs/ARCHITECTURE.md` and `docs/decisions*` win where the plan text is older. "Depends on" lines get `#<number>`; beads get the same dependency (`--deps blocked-by:<bead>` or `bd dep add`). Follow-up issues from Alex's decisions are filed by the PM and say so.
- Decisions (AGENTS.md): every decision is Alex's. A worker question that needs one goes PM -> Architect -> Alex; the PM never answers it. A question already answered in the brief, the architecture, AGENTS.md, the plan, an approved issue or the clean AzerothCore source (AGENTS.md, Decisions) is not a decision: answer it and cite the file and line. Reporting a fact about what merged code does is fine, with a citation, but merged code never settles a choice: it may hold a lean nobody decided.
- Reporting (AGENTS.md): report to the Architect only for a decision, a blocker or a milestone (a wave's foundation merged, a lane opened). Routine merges and reviews are not reported.
- Since #60, Prettier checks Markdown; anyone touching `.md` formats it before pushing.
- AzerothCore is read only at the recorded commit (`git show 9d9b6049:<path>`), never from the checkout's working tree.
- GitHub labels: `foundation`, `lane-core`, `lane-web`, `lane-profiles`, `lane-ops`, `grunt`, `spike`.

## State

- Plan rounds 2 and 3 are filed (#17-#25, #31-#39) except OPS-4. PROF-5 is held until PROF-3 and PROF-4 merge; its uniqueness question is decided (type + location). File it with round 4.
- Follow-ups filed by the PM: #44 (core `.ts` imports; blocks CORE-8; start after #61 merges), #47 (contract revision, merged), #64 (frame-ancestors header), #65 (zoom-threshold spike; blocks WEB-5 being filed), #67 (document sources in the contract; unblocks PROF-3's two wiki layouts).
- Merged since wave 1 opened: PROF-1, PROF-2, CORE-2, CORE-3, CORE-4, CORE-6, OPS-1, WEB-1, the PROF-6 and PROF-7 first parts, #47, the Markdown formatting, decision rounds 2 and 3.
- In flight: worker-core: #63 CORE-5, #61 CORE-1 (switching to the store-computed finding id), then #67, CORE-7, #44. worker-profiles: PROF-3, then the PROF-6/7 remainders. grunt: PROF-4 (#55, all-columns key). worker-ops: OPS-2 (#58) in review, #64. worker-web: WEB-2, then #65.

## Waiting

- On Alex, via the Architect: the OPS-4 credential library. The plan still has the worker pick it; do not file OPS-4 until the plan is fixed. Also: non-Latin workspace names (OPS-2 follow-up); how NULL is written in a row key (from #55; then a small CORE-6 reader follow-up).
- Notes to carry into issues when filed: CORE-12 needs per-parse cancellation (from CORE-3's review) and must measure label FTS across snapshots (from CORE-1's review). POST-1 needs the row-identity contract change (in the plan since #52).
