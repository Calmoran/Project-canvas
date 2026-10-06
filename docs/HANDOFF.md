# Handoff: where this project stands

Written 2026-10-06 at the end of the first planning chat, so a new session can continue without re-deriving anything. Read `CLAUDE.md`, `AGENTS.md`, then `docs/PROJECT-BRIEF.md` in full, then this file.

## State

- Planning only. No application code exists yet. Research and architecture draft are done.
- The herdr team is running: see AGENTS.md, Addresses and places. The Planner is drafting the phase 1 plan and holding its branch until main is rewritten.
- Every decision so far is in the brief's Decisions log. Every unknown is in its Open questions.
- The repo was initialized today: `main` branch, `docs/`, `LICENSE` (AGPL-3.0), `README.md`, `.gitignore`. No remote yet.

## Waiting on Alex

1. How the Reviewer's approval is enforced on GitHub (see decisions.md, branch protection line).

## Next steps

1. Done: research in `docs/research/` (schema with edge catalogue, code with binding catalogue, stack with benchmarks).
2. Done and approved: `docs/ARCHITECTURE.md`.
3. Next: an implementation plan the PM can turn into issues and beads. Output: `docs/plans/`. The Planner writes it once the architecture is approved.
4. Then the foundation bead: monorepo skeleton, model types, storage interface, CI. One worker, sequential, before lanes open.

## Paths

- This repo: `C:/Users/alexp/Documents/Project-canvas`
- The clean AzerothCore checkout: see `CLAUDE.local.md` (untracked, machine-specific).

## Rules that apply to this repo

See `CLAUDE.md` and `AGENTS.md`. In short: clean room (clean AzerothCore is the only reference), quality over teachability, explain code in plain language, discuss real trade-offs with Alex instead of choosing alone, keep files inside this folder unless told otherwise.
