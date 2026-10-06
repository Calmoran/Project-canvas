# Decisions

One dated line per decision, newest at the bottom. The decisions made during the first planning chat are in `docs/PROJECT-BRIEF.md`, Decisions log; new ones go here.

- 2026-10-06. Rulebook `AGENTS.md` drafted (Architect). Awaiting Alex's approval.
- 2026-10-06. Architecture draft 1 written (Architect). Ratifies from the stack research: Fastify, better-sqlite3 behind a storage interface, web-tree-sitter with published WASM grammars, ELK layout under GPL-3.0-or-later, TypeScript pinned below 6.1, exact dependency pins, release 1 via npx. Awaiting Alex's review.
- 2026-10-06. Alex: Canvas reports connections, never verdicts. Findings are missing, dangling, orphan, duplicate, or unapplied connections, each tied to a profile rule that cites the clean source. No severity, no "wrong." Architecture principle 4 and the Findings model rewritten accordingly.
- 2026-10-06. Architect, answering the Planner: core owns the Profile interface; the foundation issue is the one bead spanning lane-core and lane-ops; CI's Linux job runs a MySQL 8 service container with a Canvas-authored fixture schema; `canvas export` emits snapshot, subgraph or findings as JSON in the model schema; entity shape is shown as expected-connection slots on the node card. The credential store library is a decision issue for Alex with options.
