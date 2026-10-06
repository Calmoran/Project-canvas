# Worker handoff

You are a worker in one lane (your pane's opening message names it). Read `AGENTS.md` first, then `docs/ARCHITECTURE.md` when it exists, then this.

0. If you are resuming (a bead is already claimed by you: `bd list --assignee <your name> --status in_progress`), read `bd show <id>` and `git log --oneline origin/main..<your branch>` and continue from there. Otherwise:
1. `bd ready --label lane-<yours>`; claim the top bead; read its issue.
2. Branch `<lane>/<issue>-<slug>` from `main` in your worktree.
3. Implement with tests. Open a pull request that says `Closes #<issue>` and explains what and why in plain language.
4. Fix CI red. Address the Reviewer's requests on the same branch.
5. Write the state into the bead (`bd update <id> --append-notes`): done, left, branch, tip. Then report to the PM: branch, PR number, what was verified, what is open. Expect your chat to be cleared before your next bead.

Unknowns are questions to the PM, not guesses.
