# Canvas: Project Brief

Last updated: 2026-10-06

## The problem

The owner, Alex, runs a heavily customized World of Warcraft private server built on AzerothCore 3.3.5a. AI agents write all of the code; Alex feeds them requirements. He can read code with explanations but cannot write it, so when an agent wires something up wrong, the mistake goes unnoticed until it breaks in game, or worse, it works but is built the wrong way.

Concrete example of the second kind: an agent once implemented a custom class's new spells as hollow shells. Each "spell" was a script that told the server "the player cast this, so apply a slow for N seconds and deal N damage." It worked in game. But a real WoW spell is a Spell.dbc record with effects, auras, a damage roll, a spell family, and the links that make the rest of the engine recognize it. The shell version is invisible to everything that expects a real spell. Alex caught it by luck. Canvas exists to make that kind of thing visible on purpose.

A WoW server links game content together through many separate places at once. A spell is tied to a class not by one connection but by several independent facts (skill line, starting spells, learn chains, talents, trainers, spell family) that all have to agree. Agents frequently get one of them wrong or leave one out.

## The goal

A tool that reads a server's real data and code and draws all of it as one connected map on a canvas. Game entities (classes, spells, talents, items, NPCs, quests, custom records) and code entities (files, classes, functions, scripts, modules) are nodes. Every real relationship between them is a line: data-to-data (a trainer teaches a spell), data-to-code (a spell row binds to a script class by name; a C++ loader reads a table), and code-to-code (this function calls that one, this file includes that one). The user uses it to audit what agents built and to follow any path end to end.

Scope is the whole game, not spells and classes. The spell-to-class example is the first and clearest use case, not the boundary.

Core use cases:

- Select a class and see every spell that hangs off it, each kind of link drawn separately, and confirm nothing else reaches those spells.
- Pick a spell and see whether it is shaped like a real spell: a DBC record with effects and auras and a family, or a script that fakes the outcome. The difference should be visible without reading code.
- Start at a spell row in the database, follow it to the script name that binds it, into the C++ script class, through the functions it calls into the core, and out to the table the core loads that data from.
- Pick a .cpp file and see what it includes, what it defines, what calls into it and what it calls out to.

## Clean-room principle

Canvas is built against a clean, unmodified AzerothCore checkout and nothing else. What AzerothCore does is the definition of "the right way." Only once Canvas reads a clean server correctly is it pointed at Alex's own server, through the tool, to see whether that server was also built the right way or whether agents took liberties that happen to work.

So: no other project of Alex's is a reference, a template, or an input for Canvas, and none is named anywhere in this repository or in the agents' memory. Anything Canvas needs to handle on a customized server (custom tables, patches on top of the core, data pipelines that generate SQL, Lua UI frameworks) is designed from what such servers do in general, not from any one server.

## The graph

Three layers that share one model:

1. Data layer: database rows and DBC records.
2. Binding layer: the places where data names code or code names data. Script name strings in tables, spell ID constants in enums, table names in SQL strings inside C++ loaders, Lua Register* calls.
3. Code layer: files, includes, classes, functions, call sites, modules, and patches.

Known link types for a spell-to-class relationship on AzerothCore 3.3.5 (to be confirmed and completed by the research in `docs/research/`):

- Skill line membership (SkillLineAbility.dbc): "this spell belongs to the mage skill"
- Starting spells (playercreateinfo_spell_custom): "new mages begin with this"
- Learn chains (spell_learn_spell): "learning A also grants B"
- Talent data (Talent.dbc): spell appears in a talent tree
- Trainer tables: "this NPC teaches it, to this class"
- Spell family (SpellFamilyName / SpellFamilyFlags in Spell.dbc): what C++ scripts check to decide "is this a mage spell"
- Spell-to-spell links: one spell triggers, applies, or replaces another
- Script registration: a C++ SpellScript or AuraScript bound to a spell ID
- Item links: items that teach, require, or cast the spell

Each of these is its own edge type so a missing or wrong one is visible, rather than collapsed into a single "belongs to" line.

Layers a customized server adds, designed generically:

- Data pipeline provenance: a source file (CSV or similar) feeds a generator that produces SQL that becomes a row. A row should trace back to its origin.
- Patches as nodes: a patch file modifies specific core files and functions. "This core function is changed by patch N" is an edge.
- Cross-process links: server Lua to client addon messages, and C++ to Lua boundaries.
- Module boundaries: a module's folders and the headers each exposes.

## Later goal (phase 2): authoring from the canvas

Once reading works, the user wants to create content the same way: place an object on the canvas (a new spell, a trainer entry, a talent), fill in its fields, connect it to things, and have the tool write the result out. The reference point is Blocs for Mac, a visual website builder where you place blocks and fill in their content instead of writing HTML.

Architectural implications to honor from day one:

- The tool needs its own internal model of entities and links that is independent of where they came from. Phase 1 builds readers (MySQL, DBC, C++ to model). Phase 2 adds writers (model to SQL, DBC, C++) against the same model.
- Writers produce files (SQL migrations, DBC edits, patch files) for a human or a pipeline to apply. They never write directly into a live database or a core source tree.
- The canvas library must be built for node editors (placing, connecting, editing nodes), not only for viewing graphs.
- The user understands the scale of this goal. It is a direction, not a phase 1 requirement.

## Distribution goal

Canvas is meant to be downloaded and used by other private-server owners. Someone else should be able to install it, point it at their live database and source tree, and see their current state, including the diffs of work in progress that hasn't been applied yet.

Implications:

- Nothing about any one server's paths, credentials, table names, or custom classes is hardcoded. All of it is configuration entered through a setup screen on first run.
- Reading work-in-progress diffs is in scope, not a stretch goal.
- Custom-table mapping matters, since every server's custom tables are different.
- Core support is structured as a "core profile" (which tables, which columns, which DBC files mean what). AzerothCore 3.3.5 is the first and only profile for now. The structure leaves room for TrinityCore or other versions later.
- Target users are server owners who already run MySQL and compile a C++ core, so "run one command, open the browser" is acceptable to start. A desktop wrapper is a possible later step.
- Open source under AGPL-3.0.

## Environment facts

- Target: AzerothCore, 3.3.5a (Wrath of the Lich King, client build 12340).
- Reference: a clean AzerothCore checkout on Alex's PC, with the common modules in its `modules/` folder (mod-ale, the maintained Lua engine; mod-autobalance; mod-transmog). Its path is in the untracked `CLAUDE.local.md`. Research is done against it, never online where the files can answer.
- Typical deployment Canvas must support: the server on a Linux host, the owner on a Windows desktop, source in a git repository on GitHub. So the database is reached remotely (SSH tunnel, read-only MySQL user) and source is read from a local git clone, where work in progress is a branch or pull request compared to main.
- Lua scripting on AzerothCore is mod-ale (mod-eluna redirects to it).

## Visual theme

A painted or watercolor look: the map is a large canvas of objects, so the UI should feel like one. Open to other themes. Design decision for the UI phase.

## Requirements (first pass)

1. Read from the real sources the server uses: live MySQL, the DBC files, and the source tree.
2. Show the full scope. Filtering and focusing on one entity is a view, not a limit.
3. Draw each relationship type as a distinct, labeled edge.
4. Handle custom tables without hardcoding: the tool proposes links from column names, the user confirms or corrects, the tool remembers.
5. Make the absence of an expected link visible. "This class has 40 spells on the skill line but only 35 at the trainer" is the kind of thing the tool exists to surface.
6. Make the shape of an entity visible. A spell with no effects and a script that fakes its outcome should look different from a real spell.
7. Usable by a non-developer. Plain labels, no need to read code to understand the picture.
8. Compare two states: live server versus a branch, and show what changed.

## Open questions

- The full edge catalogue (from `docs/research/azerothcore-schema.md`).
- The full binding catalogue (from `docs/research/azerothcore-code.md`).
- The TypeScript stack choices (React Flow, SQLite binding, MySQL client, SSH, tree-sitter, HTTP framework, packaging), to be researched online since they are not in any local file.

## Decisions log

- 2026-10-06. Data source: read the live server (MySQL, DBC files, source) first, building toward reading both live and a branch with a diff view.
- 2026-10-06. Form: a local web app run on the user's PC and opened in the browser.
- 2026-10-06. Custom tables: the tool proposes links from column names, the user confirms or corrects them in the UI, and the tool remembers.
- 2026-10-06. Backend language: TypeScript on Node. One runtime for backend and browser, clean packaging for distribution, direct path to a desktop wrapper.
- 2026-10-06. Canvas library: React Flow, with React for the surrounding UI. Chosen because phase 2 authoring needs a node editor, not just a graph viewer.
- 2026-10-06. Graph storage: SQLite file. No separate server to run, persists between runs, supports snapshots for diffing.
- 2026-10-06. Open source under AGPL-3.0 (confirmed by Alex). Forks stay open and credited; nothing open source can prevent forks as such.
- 2026-10-06. Core support: AzerothCore 3.3.5 first, structured as a core profile so TrinityCore can be added later.
- 2026-10-06. Remote-first data access: SSH tunnel to the database host with a read-only MySQL user; direct port as a fallback setting. Source from a local git clone; diffs from branches or pull requests.
- 2026-10-06. Scope: the whole codebase plus data, three-layer graph as described in The graph.
- 2026-10-06. C++ understanding: syntax-level scanning with tree-sitter first, call edges carry a confidence level, with a slot for a clang-based indexer to upgrade edges to resolved later.
- 2026-10-06. Name: Canvas.
- 2026-10-06. Repository: github.com/Calmoran/Project-canvas, branch main. Planning docs in docs/.
- 2026-10-06. Clean-room principle (above): clean AzerothCore is the only reference; no other project is named in this repo or in agent memory.
- 2026-10-06. Build workflow: full multi-agent structure from the start. Roles: Architect (Fable), Planner, Project Manager, a Reviewer separate from the PM, and lane workers. Lanes: lane-core, lane-web, lane-profiles, lane-ops. Each element is justified in AGENTS.md on Canvas's own needs.
- 2026-10-06. Work tracking: GitHub Issues are the public source of truth; the PM turns issues into beads, the agents' work queue.
- 2026-10-06. Build location: the agents build and test on Alex's Windows PC, because Canvas is a Windows-first desktop tool.
- 2026-10-06. Agents and models: Claude and DeepSeek only. Architect on Fable. Feature implementation on Claude Opus. DeepSeek for gruntwork, always reviewed. The Reviewer role is mandatory on every merge regardless of author.
