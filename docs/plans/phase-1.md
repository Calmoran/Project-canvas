# Phase 1 implementation plan

Status: draft 1, 2026-10-06, by the Planner. Follows `docs/ARCHITECTURE.md`, approved by Alex on 2026-10-06. If the architecture changes, this plan changes with it before any further issue is filed.

Inputs: `AGENTS.md`, `docs/PROJECT-BRIEF.md`, `docs/ARCHITECTURE.md`, `docs/research/azerothcore-schema.md` (called **schema research** below), `docs/research/azerothcore-code.md` (**code research**), `docs/research/stack.md` (**stack research**).

## What phase 1 delivers

When every issue below is closed, someone can run `npx canvas` on Windows and do the following. They point it at a MySQL server holding an AzerothCore world database (directly or through SSH), a DBC folder, and a local git clone of the source. They scan, then explore one connected graph of data, bindings and code. They see the list of connections that were expected and not found. They compare `main` against a branch. They map their own custom tables. All of it is read-only.

The end-to-end check for phase 1 is issue OPS-10 (below): a scan of the clean AzerothCore checkout plus a world database built from it. In that scan, spell 116 (Frostbolt) can be followed from its Spell.dbc record through its `spell_script_names` row, if one exists, to the C++ script class, the core functions it calls, and the table the core loads.

Not in phase 1 (from the architecture): writers (phase 2), the clang-based call resolver, a desktop wrapper, TrinityCore, and the painted theme.

## How to read this plan

- **Plan IDs** (`F-1`, `CORE-3`, …) are placeholders. The PM files the issues in the order of the "Filing order" section below. GitHub assigns the real numbers, and the PM rewrites the "Depends on" lines to `#<number>`.
- **Lane** is the label from `AGENTS.md`. **grunt** means the issue is fully specified transcription or boilerplate, suitable for DeepSeek under the rules in `AGENTS.md`. Everything else is for Claude Opus.
- **Depends on** lists the issues that must be merged first. Issues with no unmet dependency can run in parallel.
- **Acceptance criteria** are what the Reviewer checks. Every issue also carries the standing rules from `AGENTS.md`: tests for the behaviour added, nothing hardcoded to one server, a plain-language pull request description, and `file:line` citations into the clean checkout for every table, field or macro named.
- **Interface** notes say what two lanes must agree on. Where an issue produces a type another lane consumes, the type lands first and both issues cite it.
- A **spike** is a short, time-boxed experiment whose output is a measurement or a decision, not product code.

## Points settled with the Architect

Asked and answered on 2026-10-06; all are now in `docs/ARCHITECTURE.md` as of main at `eeee965`.

1. `core` owns every contract, including `Profile` and all its parts. `profiles` implements it (section 2).
2. The foundation is the one stated exception to "one bead per lane": one bead labelled `foundation`, spanning lane-core and lane-ops, done by one worker in sequence (section 2).
3. The Linux CI job runs a MySQL 8 service container with a small Canvas-authored fixture schema. Windows runs without MySQL (section 11).
4. `canvas export` emits a snapshot, a focused subgraph or a findings list as JSON in the model's schema (section 2).
5. An entity's shape is shown as expected-connection slots on the node card (section 9). There is no separate design brief.
6. A slot is not a separate structure. It is an expectation `Rule` carrying optional display metadata `{ label, order, optional }`. An empty slot is that rule's `missing` finding (section 5).

7. A rule marked `optional` never writes a finding. When it is unmet, its slot is drawn empty and the result is stored as a rule result only. A spell without a script is normal in clean AzerothCore, and the findings list must stay a list of things that did not connect as expected (section 5).

## Decisions inside this plan

- **Credential storage.** Decided 2026-10-06: the OS credential store, with an owner-only config file as the fallback. OPS-4 implements it; the worker picks the library to a stated standard.
- **Code formatter.** Decided 2026-10-06: Prettier, with ESLint and `typescript-eslint` for linting (F-1 scope item 2).
- **React Flow card nodes** (architecture section 13, open). WEB-1 measures. If 1,500 custom nodes are too slow, the explorer's node design goes back to the Architect and Alex before WEB-5 starts.

---

## Wave 0: foundation (one worker, sequential, before any lane opens)

### F-1. Monorepo skeleton, model contract, storage interface, CI

- **Lane:** `lane-core` + `lane-ops`, label `foundation` (the stated exception in architecture section 2).
- **Depends on:** nothing. Every other issue depends on this one.
- **Why:** Every lane builds against the same types and the same CI gate. If those are settled once, up front, four workers can then run in parallel without redefining the model in four places.

Scope:

1. **Workspace.** pnpm workspaces with the five packages from architecture section 2: `packages/core`, `packages/profiles`, `packages/server`, `packages/web`, `packages/cli`. Each package gets a `package.json`, a `tsconfig.json` using project references, a `src/index.ts`, and one passing test. Package names are `@canvas/<name>`. Dependency direction is as in section 2, and a lint rule or check script rejects imports that break it (for example `core` importing `server`).
2. **Toolchain.** All versions pinned exactly (no `^` or `~`), from the stack research:
   - TypeScript 6.0.x
   - ESLint 10 flat config with `typescript-eslint` `recommendedTypeChecked`
   - Prettier as the code formatter (a tool that rewrites code into one consistent layout), Alex's choice of 2026-10-06. Prettier owns layout and ESLint owns correctness, so the two never disagree: `eslint-config-prettier` switches off ESLint's style rules. `pnpm format` rewrites files, and `pnpm format:check` fails on any file that is not formatted.
   - Vitest 5 with one project per package
   - `engines.node >=24`
   - `packageManager` set for corepack

   A check script fails if any dependency in any `package.json` is not an exact version. Reason: several dependencies are under three months old (stack research, risk 9).
3. **Model contract (`packages/core/src/model/`).** TypeScript types plus Zod 4 schemas for every type in architecture section 3: `Node`, `NodeKind` (every kind listed, grouped by layer), `Edge`, `Confidence`, `Origin` (all four variants), `Finding` (the five kinds, no severity field), `Snapshot`.
   - ID helpers: `nodeId(kind, key)` produces `<kind>:<key>`; `edgeId(type, from, to, origin)` is a stable hash. Tests show that the same inputs give the same ID across runs and that different origins give different IDs.
   - Code-layer edge types fixed in core: `includes`, `defines`, `calls`, `references`, `registers`, `modifies`, `loads`, `reads_dbc`. Data edge types stay strings defined by the profile.
4. **Reader interface (`packages/core/src/reader/`).** `Reader`, `ReadPlan`, `ReadContext`, and the `NodeOrEdge` emission type from architecture section 4, plus a scan progress event type (`ScanEvent`: started, reader progress, reader done, phase changed, finished, failed). These are types only, with no reader implemented.
5. **Profile contract (`packages/core/src/profile/`; architecture section 2: `core` owns it).** Types and Zod schemas for `Profile` and its parts from architecture section 5: `TableDef`, `DbcLayout`, `EdgeDef` (with an optional decode function), `BindingDef`, `LoaderDef`, `OverrideLayer`, `Rule`, `LabelRule`, `deadTables`. `Rule` includes the optional slot display metadata `{ label, order, optional }` from section 5. There is no separate shape type: a rule with slot metadata is drawn as a slot on the cards of the node kind it selects.
   - Every definition type carries a required `source` citation: one or more `file:line` strings into the clean checkout, plus the core commit the profile is versioned against.
   - `Rule` covers the five finding kinds. Each rule has an `id`, its finding kind, the expected edge type for `missing`, a node-kind selector, and a source citation.
   - An empty example profile validates against the schema in a test.
6. **Storage (`packages/core/src/storage/`).** The `Storage` interface from architecture section 7: open, transaction, prepared query, bulk insert. Plus a `better-sqlite3` 13 adapter. Plus a numbered-migration runner that creates schema v1:
   - the tables `snapshots`, `nodes`, `edges`, `findings`, `overlays`, `scan_log`
   - the indexes `(snapshot, kind)`, `(snapshot, from)`, `(snapshot, to)`, `(snapshot, type)`
   - an FTS5 full-text index on node labels
   - JSON `attrs` columns

   Tests run against a temporary file database: migrations apply on an empty file and are a no-op on a migrated one; a transaction that throws rolls back; a bulk insert of 100,000 nodes completes and can be read back. Nothing outside `storage/` imports `better-sqlite3`, and a lint rule enforces that, so `node:sqlite` can replace it later.
7. **CI (`.github/workflows/ci.yml`).** Runs on every pull request and on pushes to `main`, as a matrix of `windows-latest` and `ubuntu-latest` × Node 24 and 26. Steps: `pnpm install --frozen-lockfile`, type check (`tsc -b`), lint, the Prettier format check, the exact-pin check, tests, build. One summary job named `ci` depends on the matrix, so branch protection can require a single stable check name. Reason for Windows in the matrix: Canvas is Windows-first (brief, decisions log).

   The Linux jobs also start a MySQL 8 service container (a database server the CI runner starts next to the tests). It is loaded with a Canvas-authored fixture schema from `packages/core/test/fixtures/mysql/`: a handful of tables shaped like the profile's, never the AzerothCore dump (architecture section 11). Tests that need MySQL read its address from an environment variable and are skipped when it is absent, so they skip on Windows and on a contributor's PC without MySQL. F-1 lands the service, the fixture loader and one test that connects. The fixture tables grow with CORE-6.
8. **Repo files.**
   - `CONTRIBUTING.md`: how to install with corepack and pnpm, the commands, and the branch and worktree rules (a pointer to `AGENTS.md`, not a copy of it).
   - `LICENSE-THIRD-PARTY.md`: started empty with its format; ELK is added by WEB-2.

Acceptance criteria:

- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm lint && pnpm format:check && pnpm typecheck` pass on a clean clone on Windows and in CI.
- [ ] CI is green on all four matrix cells, and the `ci` job exists for branch protection.
- [ ] On Linux the MySQL service starts, the fixture schema loads, and one test connects and reads it. On Windows that test is reported as skipped, not passed.
- [ ] Every type named in architecture sections 3, 4 and 5 exists with a Zod schema, and a test parses a valid and an invalid example of each.
- [ ] Storage tests listed in scope item 6 pass; `better-sqlite3` is imported only under `storage/`.
- [ ] The pin check and the dependency-direction check each fail on a deliberately broken example in their tests.
- [ ] The pull request description explains each tool chosen in plain language, citing the stack research section.

---

## Wave 1: lanes open (each depends only on F-1)

### CORE-1. Graph store: snapshots, writes, queries

- **Lane:** `lane-core`. **Depends on:** F-1.
- **Why:** The pipeline, the server and the diff all read and write the graph through one module, so SQL lives in one place.
- **Interface:** OPS-5 and OPS-6 call these functions; their signatures are fixed in this issue's description before work starts.

Acceptance criteria:

- [ ] Create, finish, fail and list snapshots. A finished snapshot rejects writes (snapshots are immutable, architecture section 3).
- [ ] Batched writes of nodes, edges and findings into a snapshot in one transaction per batch.
- [ ] `getNode`, `neighborhood(node, hops, edgeTypes?, confidences?, cap)` returning nodes, edges and a `truncated` flag when the cap is hit; `search(q)` over labels and IDs using FTS; `findings(snapshot, kind?, rule?)`.
- [ ] Tests on a fixture graph cover hop limits, edge-type filtering, the cap and `truncated`, and search ranking of an exact ID match first.

### CORE-2. WDBC parser

- **Lane:** `lane-core`. **Depends on:** F-1.
- **Why:** Spells, talents, skills, classes and races exist only in DBC files (schema research section 0, item 3).

Acceptance criteria:

- [ ] Parses the 20-byte header, fixed-width records and the string block as in code research 1.1, citing `src/common/DataStores/DBCFileLoader.cpp` lines.
- [ ] Interprets a layout given as a format string, handling every format character the server uses (code research 1.1/1.2).
- [ ] Localized strings are read as 16 slots plus 1 flags field, with slots named by the server's `LocaleConstant` (enUS = 0), not by the database column names (code research 1.4).
- [ ] Rejects a file whose record size disagrees with the layout, with a message naming the file and both sizes.
- [ ] Tests use synthetic files generated in the test (no client data committed), covering every format character, an empty string block and a localized string.

### CORE-3. Tree-sitter foundation (C++ and Lua parsing)

- **Lane:** `lane-core`. **Depends on:** F-1.
- **Why:** The source and Lua readers need a parser that works on Windows with no compiler (stack research section 6).

Acceptance criteria:

- [ ] `web-tree-sitter` 0.27 at an exact pin. A vendoring script copies `tree-sitter-cpp.wasm` and `tree-sitter-lua.wasm` (from `@tree-sitter-grammars/tree-sitter-lua`, not the unmaintained unscoped package) into `packages/core/vendor/` and records each file's SHA-256 in a committed manifest. A test fails if a vendored file's hash does not match the manifest.
- [ ] A `worker_threads` pool parses files in parallel and returns syntax trees or extracted results, never blocking the main thread.
- [ ] Files that contain `ERROR` nodes still yield every extractable construct outside the error region (stack research, risk 3). A fixture with a deliberate parse error proves it.

### CORE-4. Git access

- **Lane:** `lane-core`. **Depends on:** F-1.
- **Why:** The source is read at a git ref, not from the working folder, so a branch can be compared with `main` (architecture section 4).

Acceptance criteria:

- [ ] `simple-git` 4 at an exact pin. Git is found on PATH or at a configured path. When git is missing, the result is a typed error with a plain message that mentions GitHub Desktop users (stack research, risk 4).
- [ ] List files at a ref with their blob hashes; read a file's content at a ref; list the files changed between two refs, with rename detection.
- [ ] Tests create a temporary repository with two branches.

### PROF-1. Profile package skeleton and citation check

- **Lane:** `lane-profiles`. **Depends on:** F-1.
- **Why:** Every later profile issue adds data to this package, and each piece must cite the clean source (architecture section 5).

Acceptance criteria:

- [ ] `@canvas/profiles` exports `azerothcore335`, which validates against the core `Profile` schema. It is versioned against commit `9d9b6049`, with that commit recorded in the profile.
- [ ] A test fails if any definition lacks a `source` citation, if any ID or edge type is defined twice, or if an `EdgeDef` names a node kind that does not exist.
- [ ] A local-only test (skipped when the path is not configured) checks that every cited file exists in the clean checkout and that every cited line number is within the file's length. The checkout path comes from an environment variable, never from a hardcoded path.

### PROF-2. DBC format strings for every server-loaded DBC (grunt)

- **Lane:** `lane-profiles`, label `grunt`. **Depends on:** PROF-1.
- **Why:** The DBC reader needs the exact layout of each file. The server's own format strings are the source.

Acceptance criteria:

- [ ] One `DbcLayout` per active `LOAD_DBC` call: 110 of them, from `src/server/game/DataStores/DBCStores.cpp:272-383`, as listed in code research 1.3. Each layout has its file name, its world-DB override table name, and its format string copied verbatim from `src/server/shared/DataStores/DBCfmt.h`, with the `file:line` of both.
- [ ] Field names are left empty in this issue (PROF-3 adds them).
- [ ] A test checks that 110 layouts exist and that each format string contains only known format characters.

### OPS-1. Server skeleton

- **Lane:** `lane-ops`. **Depends on:** F-1.
- **Why:** Gives the web lane and the CLI a running server to build against.

Acceptance criteria:

- [ ] Fastify 5 with `fastify-type-provider-zod`. It binds to `127.0.0.1` only, and a test proves that binding to another address is refused.
- [ ] `GET /api/health`.
- [ ] A uniform error response shape.
- [ ] `@fastify/static` serves a placeholder web build.
- [ ] Request and response Zod schemas live in `packages/server/src/api/` and are exported through a types-only subpath (`@canvas/server/api`), so `web` and `cli` import the types without pulling Fastify into the browser bundle.
- [ ] Route tests use Fastify's inject (requests made in memory, without a network port).

### WEB-1. Spike: React Flow at 1,500 custom nodes

- **Lane:** `lane-web`, label `spike`. **Depends on:** F-1.
- **Why:** Architecture section 13 makes this prototype a precondition for card-style nodes. React Flow publishes no node-count limit (stack research section 1).

Acceptance criteria:

- [ ] A throwaway page in `packages/web/spikes/` renders 500, 1,000 and 1,500 memoised custom card nodes (icon, label, two badges) with about 1.5 edges per node. It measures the initial render time, the frame rate while panning and zooming, and the effect of `onlyRenderVisibleElements`.
- [ ] The numbers and the machine they ran on are written to `docs/research/react-flow-scale.md`, with a plain-language conclusion: card nodes are fine at the budget, or the budget or node design must change.
- [ ] If the conclusion is "must change", the PM routes it to the Architect before WEB-5 is filed.

### WEB-2. Web app skeleton

- **Lane:** `lane-web`. **Depends on:** F-1, OPS-1 (for the API types subpath).
- **Why:** The shell every view plugs into.

Acceptance criteria:

- [ ] Vite 8, React 19, `@xyflow/react` 12, Zustand 5, client-side routes for the five views in architecture section 9 (empty placeholders).
- [ ] A typed API client built on `@canvas/server/api` types.
- [ ] An ELK `layered` layout running in a Web Worker, behind a `layout(nodes, edges) -> positions` function, with a test on a small graph.
- [ ] `LICENSE-THIRD-PARTY.md` records `elkjs` used under GPL-3.0-or-later (architecture section 12).
- [ ] Vitest component tests run in CI; the production build is copied where OPS-1's static hosting serves it.

---

## Wave 2: readers and profile data

### CORE-5. DBC reader

- **Lane:** `lane-core`. **Depends on:** CORE-2, PROF-2.

Acceptance criteria:

- [ ] Implements `Reader`. For each profile layout found in the configured DBC folder, it emits a `dbc_file` node and one `dbc_record` node per record (key `file/id`), with fields named from the layout where names exist.
- [ ] Locale variants in `dbc/<locale>/` fill only empty string slots, in the server's order (code research 1.4, `DBCFileLoader.cpp:306-312`).
- [ ] A missing file is reported in the read plan and in progress events, and is not fatal. Canvas, unlike the server, should still show the rest.
- [ ] The file hash is recorded for incremental scans.
- [ ] Tests use synthetic DBC files, including a locale variant.

### CORE-6. MySQL reader

- **Lane:** `lane-core`. **Depends on:** F-1, PROF-4 (table definitions). Can start against a fixture profile before PROF-4 merges.

Acceptance criteria:

- [ ] `mysql2` at an exact pin. The schema is read from `information_schema` first, never from base SQL files (schema research section 0, item 1).
- [ ] `checkReadOnly(connection)` reports whether the user holds any privilege beyond SELECT on the configured databases (architecture section 1, principle 6). OPS-3 uses it.
- [ ] Emits `table` nodes and `row` nodes (key `table/pk`) for profile tables, labelled by the profile's label rules, streaming rows so memory stays bounded on large tables.
- [ ] Tables present in the database but absent from the profile and overlays are listed as custom tables, not read as links.
- [ ] Records a per-table checksum and row count for incremental scans.
- [ ] Tests run against the MySQL 8 service container on Linux CI (architecture section 11), with fixture tables added to `packages/core/test/fixtures/mysql/` for each case: a profile table, a custom table, a SELECT-only user and a user with write rights. Pure logic (label rules, checksum bookkeeping) is unit-tested without MySQL so it also runs on Windows.

### CORE-7. Edge engine (profile edges from rows and records)

- **Lane:** `lane-core`. **Depends on:** F-1 (profile types). Fixture-tested with its own small `EdgeDef`s; it does not wait for PROF-5.
- **Why:** Edge types are data in the profile (architecture section 3). One generic engine applies them, so adding an edge is a profile change, never a code change.

Acceptance criteria:

- [ ] Applies `EdgeDef`s to emitted rows and records: column or field to target key, the cardinality, masks (class mask = `1 << (id-1)`, 0 = all, schema research section 1), and optional decode functions for sign tricks.
- [ ] Emits edges with `confidence` from the definition and `origin` pointing at the `table.column` or DBC field.
- [ ] A reference that names a key not yet seen is held for the resolver (CORE-12) instead of being dropped.
- [ ] Tests cover a mask edge, a sign-trick decode (negative = all ranks) and a by-name string edge.

### CORE-8. C++ source reader: code layer

- **Lane:** `lane-core`. **Depends on:** CORE-3, CORE-4.

Acceptance criteria:

- [ ] For every `.cpp`, `.h` and `.hpp` file at the configured ref, it emits the `file`, `class` (with base classes), `function`, `enum` and `enum_value` nodes and the `includes` and `defines` edges. It also emits `calls` edges at confidence `by-name`, with each call site's argument tokens kept in `attrs` for the binding extractors.
- [ ] `function` IDs follow `function:<path>#<qualified name>` (architecture section 3).
- [ ] Module folders (`modules/<name>/`) become `module` nodes that contain their files (code research 2.9).
- [ ] Keyed on blob hash for incremental scans.
- [ ] Fixture C++ files cover each construct, macros, nested namespaces and a parse error.

### CORE-9. C++ binding extractors

- **Lane:** `lane-core`. **Depends on:** CORE-8, PROF-6.
- **Why:** Bindings are where code names data. They are the middle layer of the graph (brief, "The graph").

Acceptance criteria:

- [ ] Applies the profile's `BindingDef`s to the code layer. It emits `script_registration` nodes and `registers` edges (binding catalogue rows 1, 3-9, 11), `id_literal` nodes (rows 15-17, 20-21) and `loader` nodes with `loads` edges from SQL strings and prepared statements (row 29, code research 2.11). It also emits hook-to-effect edges (row 2) and family and icon matches as `heuristic` edges (row 19).
- [ ] Type-enum prefixes (`SPELL_AURA_`, `SPELL_EFFECT_`, `SPELL_FAILED_`, `SPELL_ATTR`, …) are excluded from spell-ID extraction (row 15).
- [ ] One fixture test per catalogue row handled, citing the clean-source example the fixture imitates.

### CORE-10. Lua reader

- **Lane:** `lane-core`. **Depends on:** CORE-3, PROF-7.

Acceptance criteria:

- [ ] Walks the configured Lua script folder recursively, skipping hidden entries and accepting the extensions mod-ale accepts (code research 3.12, `LuaEngine.cpp:378`). It emits `lua_file` nodes.
- [ ] Emits `lua_handler` nodes for every `Register*` call in the profile's Lua binding table, with event numbers decoded to names from the profile's copy of `Hooks.h`. Entry, spell and map arguments become `exact` edges when the argument is a literal and `heuristic` edges when it is a resolvable local (binding catalogue rows 30-36).
- [ ] Two files with the same base name are both emitted, and the one mod-ale would skip is marked (row 37, `LuaEngine.cpp:703-708`).
- [ ] Fixture tests per row.

### CORE-11. Git reader: patches and SQL update files

- **Lane:** `lane-core`. **Depends on:** CORE-4, CORE-8, PROF-8.

Acceptance criteria:

- [ ] `.patch` files at the ref become `patch` and `patch_hunk` nodes, with `modifies` edges to the `function` nodes whose line ranges the hunks touch.
- [ ] SQL files under the updater's included folders and module `data/sql` folders are listed using the profile's updater rules (schema research section 13). A file in a module folder whose name contains no database keyword is marked as never loadable, which feeds the `unapplied` finding.
- [ ] When the `updates` table is readable, each file's status is applied, pending or changed: name plus SHA-1 of the content compared with `updates.name` and `updates.hash`.
- [ ] The hashing normalization is UNVERIFIED in the research (`ReadSQLUpdate`, `UpdateFetcher.cpp:297`). This issue first confirms it by reading that function in the clean checkout, then proves it with a local-only test: the computed hashes match the hashes recorded in `data/sql/base/db_world/updates.sql` for the files under `data/sql/updates/db_world/`.
- [ ] Fixture tests use a temporary repository.

### PROF-3. DBC field names for the layouts edges need

- **Lane:** `lane-profiles`. **Depends on:** PROF-2.

Acceptance criteria:

- [ ] Field names from `DBCStructure.h` (code research 1.2, with lines) for Spell, SkillLine, SkillLineAbility, Talent, TalentTab, ChrClasses, ChrRaces, Map, AreaTable, CharStartOutfit, SpellDuration, SpellRange, SpellRadius, SpellCastTimes, ItemSet, GlyphProperties, SpellItemEnchantment, and every other DBC an edge in PROF-5 reads.
- [ ] Skipped (`x`) fields the code research says Canvas needs (for example the TalentTab name and icon) are named and marked as not read by the server.
- [ ] Canvas-defined layouts for SpellIcon.dbc and CharBaseInfo.dbc are added and marked `unverified` (architecture section 13). The issue states plainly that no clean source defines them.

### PROF-4. World, characters and auth table definitions

- **Lane:** `lane-profiles`, label `grunt` for the transcription, with the label rules specified below. **Depends on:** PROF-1.

Acceptance criteria:

- [ ] A `TableDef` per table named in the schema research, with key columns, the database it belongs to, and the citation of its base SQL file line.
- [ ] Label rules from schema research section 12. Locale tables are linked to their base table.
- [ ] `deadTables` lists `npc_trainer` and `spell_proc_event`, citing schema research section 0, item 5.
- [ ] A test checks that every edge's source table (once PROF-5 lands) has a `TableDef`.

### PROF-5. Edge catalogue: data-layer edges

- **Lane:** `lane-profiles`. **Depends on:** PROF-3, PROF-4. This is one issue for four beads, split by schema research section, which can run in sequence or in parallel within the lane:
  - **5a:** starting data, learn chains, trainers, spell-to-spell tables, talents (sections 1, 2, 3, 5, 11)
  - **5b:** items, creatures, quests, game objects (sections 6-9)
  - **5c:** conditions and SmartAI (section 10, binding catalogue row 14)
  - **5d:** characters database (section 15), plus DBC-to-DBC and spell-to-spell DBC references (binding catalogue rows 24-27)

Acceptance criteria:

- [ ] Every row of the schema research's edge catalogue, and binding catalogue rows 23-28, is an `EdgeDef` with its citation, or is listed in the issue with the reason it is deferred.
- [ ] Sign tricks and masks noted in the catalogue are decode functions, each with a unit test.
- [ ] One fixture test per `EdgeDef` (minimal rows or records in, the expected edge out), as architecture section 11 requires.

### PROF-6. C++ binding definitions and loader map

- **Lane:** `lane-profiles`. **Depends on:** PROF-1.

Acceptance criteria:

- [ ] `BindingDef`s for the registration macros quoted in code research 2.6, the constructor-name script base classes (2.7), the `AddSC_*` and `Add<mod>Scripts` chain (2.8, 2.9), the in-script spell references (2.10), `ApplySpellFix` and `const_cast` store patches (1.5c), and custom attribute cases (1.5d). Each cites the macro's or class's `file:line`.
- [ ] `LoaderDef`s for every row of the loader map in code research 2.11.
- [ ] The `ScriptName` source columns from `ObjectMgr::LoadScriptNames` (schema research section 4) are listed, so CORE-12 can resolve them and the findings engine can detect dangling and duplicate names (binding catalogue row 12).

### PROF-7. Lua binding definitions and hook names

- **Lane:** `lane-profiles`. **Depends on:** PROF-1.

Acceptance criteria:

- [ ] The `Register*` function table from code research 3.12, with what each first argument binds to, citing `GlobalMethods.h` lines at mod-ale commit `c3de794`.
- [ ] Event-number-to-name tables transcribed from mod-ale's `Hooks.h`, versioned in the profile with the mod-ale commit (architecture section 13: a profile copy is the current intent).
- [ ] A test checks that each event table has no duplicate numbers.

### PROF-8. Override layers, updater rules, label rules

- **Lane:** `lane-profiles`. **Depends on:** PROF-3, PROF-4.

Acceptance criteria:

- [ ] `OverrideLayer`s for the four layers in code research 1.5: `<name>_dbc` whole-row overrides (positional column mapping), `spell_custom_attr` plus hardcoded cases, `SpellInfoCorrections` fixes, and the `OnLoadSpellCustomAttr` module hook (marked heuristic). Each layer records the server load order (`World.cpp:404-429`).
- [ ] Updater rules from schema research section 13: the included folders, the module folder keyword rule, the depth limit, duplicate names being fatal, and apply order.
- [ ] Label rules for game-layer kinds whose names come only from DBC files.

### OPS-2. Configuration and workspaces

- **Lane:** `lane-ops`. **Depends on:** OPS-1.

Acceptance criteria:

- [ ] A per-OS config directory (Windows `%APPDATA%`, macOS Application Support, Linux XDG).
- [ ] A workspace record holds a name, the MySQL connection (host, port, database names, user, SSH settings), the source clone path and ref, the DBC folder, the Lua folder and the profile ID.
- [ ] The record is validated by Zod and holds no secret: secrets are referenced by key only (OPS-4).
- [ ] `GET`/`POST /api/workspaces` with route tests.
- [ ] The workspace's SQLite file sits in the config directory.

---

## Wave 3: pipeline, analysis, connections

### CORE-12. Scan pipeline and resolvers

- **Lane:** `lane-core`. **Depends on:** CORE-1, CORE-5, CORE-6, CORE-7, CORE-8.
- **Interface:** emits `ScanEvent`s (F-1) that OPS-5 streams over SSE.

Acceptance criteria:

- [ ] Runs the configured readers, writes their output into a new snapshot, then runs the stages in the order of architecture section 4: resolvers (by-name references become edges once both ends exist; script names join to `script_registration` nodes), game-layer derivation (CORE-13), then findings (CORE-14).
- [ ] Incremental scans: an unchanged input (content hash, table checksum, file hash) reuses the previous snapshot's nodes and edges by ID. A test proves that a second scan with one changed fixture file re-reads only that file.
- [ ] A reader that fails marks the scan failed with its error in `scan_log`; it never leaves a half-written snapshot marked finished.
- [ ] A cancellation token stops a running scan.

### CORE-13. Game-layer derivation

- **Lane:** `lane-core`. **Depends on:** CORE-12, PROF-8.

Acceptance criteria:

- [ ] Derives the game-layer nodes (`spell`, `class`, `race`, `skill`, `talent`, `item`, `creature`, `gameobject`, `quest`, `trainer`, `map`) from their data-layer nodes. Each is linked to its backing nodes.
- [ ] A `spell` merges its Spell.dbc record, any `spell_dbc` override row, custom attributes and hardcoded fixes in the server's load order. `attrs.layers` records which source supplied each field (architecture section 3).
- [ ] A test fixture shows a spell whose name comes from `spell_dbc` and whose duration comes from an `ApplySpellFix`, with both layers recorded.

### CORE-14. Findings engine

- **Lane:** `lane-core`. **Depends on:** CORE-12. Fixture-tested with its own rules; does not wait for PROF-9.

Acceptance criteria:

- [ ] Evaluates profile and overlay `Rule`s against a snapshot and writes `Finding`s of the five kinds: missing, dangling, orphan, duplicate, unapplied. There is no severity field and no verdict wording anywhere (decision of 2026-10-06; architecture section 1, principle 4).
- [ ] Each finding names the rule ID, the node, the related nodes and, for `missing`, the expected edge type.
- [ ] Tests: for each kind, one fixture where the connection exists (no finding) and one where it does not (exactly one finding).
- [ ] Records each expectation rule's result per node it selects: met (with the edges that satisfy it) or unmet (with the finding ID, when one was written). These rule results are the slot states (architecture section 5). They are stored with the snapshot, and a query returns them for a node, ordered by the rules' slot `order`, so the explorer reads slots without re-evaluating rules.
- [ ] A fixture spell with a script and no effects has its script rule met and its effect rule unmet, with one `missing` finding.
- [ ] A rule marked `optional` never writes a finding. A fixture spell with effects and no script has its optional script rule stored as unmet and no finding written for it (architecture section 5).

### CORE-15. Snapshot diff

- **Lane:** `lane-core`. **Depends on:** CORE-1, CORE-14.

Acceptance criteria:

- [ ] Given two snapshots, it returns nodes added, removed and changed (attrs differ, with the changed keys listed), edges added and removed, and findings added and resolved. Everything is computed by ID set arithmetic (architecture section 3).
- [ ] Nodes predicted from a branch's pending SQL (CORE-16) are tagged `pending` in the result.
- [ ] Tests on two fixture snapshots cover each category.

### CORE-16. Pending SQL prediction

- **Lane:** `lane-core`. **Depends on:** CORE-11, CORE-6.

Acceptance criteria:

- [ ] A tolerant parser for `CREATE TABLE`, `ALTER TABLE`, `INSERT`, `REPLACE` and `DELETE` in pending SQL files. It is not a full MySQL grammar (architecture section 6). Statements it cannot parse are reported, never guessed.
- [ ] Predicted rows become `row` nodes tagged `pending`, with their `origin` pointing at the SQL file and line.
- [ ] Fixture SQL files cover each statement type, multi-row inserts, and a statement the parser skips.

### CORE-17. Custom tables and server overlays

- **Lane:** `lane-core`. **Depends on:** CORE-6, CORE-12.

Acceptance criteria:

- [ ] For each custom table, it proposes links from the column-name dictionary in architecture section 6, each with up to five sample values and whether those values exist as targets in the snapshot.
- [ ] An overlay format (a user-owned profile fragment: confirmed edges and extra expectations) is validated by the same Zod schemas as the profile, versioned, and stored in the workspace's `overlays` table.
- [ ] Overlays are merged into the profile at the start of every scan.
- [ ] Tests: a fixture custom table produces the expected proposals; a confirmed overlay produces edges on the next scan.

### PROF-9. Expectation rules and shape slots (first set)

- **Lane:** `lane-profiles`. **Depends on:** PROF-5, PROF-6, PROF-8.

Acceptance criteria:

- [ ] Rules for the examples architecture section 3 already justifies:
  - a class-skill spell with no `trainer_teaches` and no `start_*` edge
  - a `ScriptName` with no registration
  - a script name registered twice
  - a spell with zero `has_effect` edges
  - a table no loader `loads`
  - an unloadable module SQL file
- [ ] Each rule cites the clean source that makes the connection expected.
- [ ] Each rule has a fixture with the connection present (no finding) and absent (one finding), run through CORE-14.
- [ ] Slot display metadata `{ label, order, optional }` on the expectation rules that form each game-layer kind's slots (architecture sections 5 and 9). For a spell, these are effects, family, skill line, and a trainer or start rule, plus a script rule marked `optional`. Rules added only for slots carry the same citation and fixture requirement as every other rule.

### OPS-3. Connection tests

- **Lane:** `lane-ops`. **Depends on:** OPS-2, CORE-6, CORE-4.

Acceptance criteria:

- [ ] Test endpoints for: MySQL reachable and its version; the user is SELECT-only (warn, do not block, per architecture section 8); the source path is a git clone and the ref exists; the DBC folder holds Spell.dbc; the Lua folder exists.
- [ ] Each result is a plain message the setup screen can show as-is.

### OPS-4. Secrets: OS credential store with an owner-only file fallback

- **Lane:** `lane-ops`. **Depends on:** OPS-2.
- **Why:** Database passwords and SSH passphrases must survive restarts without sitting in plain view. Alex decided on 2026-10-06 that secrets go in the operating system's credential store, with an owner-only config file as the fallback (architecture section 8). A credential store is the OS's own locked vault for passwords: Windows Credential Manager, the macOS Keychain, or the Secret Service on Linux.

Acceptance criteria:

- [ ] **Pick the library.** Choose a maintained Node library for the OS credential store that ships prebuilt binaries in its npm package, so it installs with no compiler (the same standard the stack research applied to `better-sqlite3`). Check its license is AGPL-compatible.
- [ ] **Show the evidence.** The pull request names the candidates considered, with each one's version, last release date, license and platforms with prebuilt binaries, all from the npm registry. It then pins the chosen one exactly and adds a dated line to `docs/decisions.md`.
- [ ] **Store secrets by key.** A `SecretStore` interface (set, get, delete by key) has two implementations: the OS store, and the fallback file.
- [ ] **Fall back cleanly.** The fallback is used when the OS store cannot load or is unavailable (for example Linux without a Secret Service). The setup screen is told which one is in use, in a plain sentence.
- [ ] **Keep the fallback file private.** The file lives in the per-user config directory (OPS-2). On Linux and macOS its permission mode is `0600`. On Windows its access list grants only the current user. A test checks both on the CI runner of that OS.
- [ ] **Prove it on Windows.** A CI test on `windows-latest` installs the package, writes a secret to Windows Credential Manager, reads it back and deletes it.
- [ ] **Never leak a secret.** Secrets never reach the SQLite file, logs, API responses, error messages or exported JSON. A test runs a scan with a known secret, then searches the log output, the database file and an export for it, and finds nothing.

### OPS-5. SSH tunnel

- **Lane:** `lane-ops`. **Depends on:** OPS-2, OPS-4.

Acceptance criteria:

- [ ] `ssh2` at an exact pin, with local forwarding to the MySQL port.
- [ ] Supports key files (with passphrase), the Pageant and OpenSSH agent pipes on Windows, and passwords.
- [ ] An unknown host key is returned to the API as a confirmation request with its fingerprint, never a console prompt (architecture section 8). A confirmed key is remembered per workspace.
- [ ] Fallbacks: "use my existing tunnel" (a direct connection to a local port) and a direct connection with no SSH.
- [ ] Tests run against an in-process `ssh2` test server.

### OPS-6. Scan, graph, search, findings, diff, custom-table and overlay routes

- **Lane:** `lane-ops`. **Depends on:** OPS-2, CORE-1, CORE-12. The diff and custom-table routes also depend on CORE-15 and CORE-17; they may land as a follow-up issue if those are not merged yet.
- **Interface:** these schemas are what lane-web builds against. The schemas are written first, in the issue, and the PM files WEB-4 to WEB-8 only once this issue's schemas are merged.

Acceptance criteria:

- [ ] Every route in architecture section 8, with Zod request and response schemas. Game-layer nodes in a `neighborhood` response carry their slot states: the results of the rules with slot metadata (CORE-14).
- [ ] `POST /api/scan` starts a scan and `GET /api/scan/:id/events` streams `ScanEvent`s over SSE (`@fastify/sse`).
- [ ] `neighborhood` enforces the hard cap and returns `truncated`.
- [ ] Route tests against a fixture SQLite file.

---

## Wave 4: the interface and the command line

### WEB-3. Setup wizard

- **Lane:** `lane-web`. **Depends on:** WEB-2, OPS-3, OPS-5.

Acceptance criteria:

- [ ] Steps for connection (host, SSH, database names), source (clone path and ref), DBC folder, Lua folder and profile. Each step has a Test button that shows OPS-3's message.
- [ ] Host-key confirmation and passphrase entry are screens, not prompts.
- [ ] Plain labels throughout, with no jargon left unexplained (brief requirement 7).

### WEB-4. Scan progress

- **Lane:** `lane-web`. **Depends on:** WEB-2, OPS-6.

Acceptance criteria:

- [ ] Starts a scan and shows each reader's progress and the current stage from the SSE stream. It reconnects after a dropped connection, and a cancel button stops the scan.
- [ ] A failed scan shows the reader and its message.

### WEB-5. Explorer

- **Lane:** `lane-web`. **Depends on:** WEB-1 (its conclusion), WEB-2, OPS-6.

Acceptance criteria:

- [ ] Search to pick a focus node; a hop-depth control; edge-type and confidence filters.
- [ ] Nodes are compact cards showing the kind icon, label and layer badges. Each edge type is distinct and labelled (brief requirement 3). Confidence is visible on every edge (architecture section 1, principle 3).
- [ ] Compound nodes group children and collapse by default beyond the visible-node budget (1,500, or whatever WEB-1 concludes). A `truncated` result says so on screen.
- [ ] Layout runs in the worker and is cached by the visible node set.
- [ ] Selecting a node shows its attrs, its origin and, for game nodes, which layer supplied each field.

### WEB-6. Findings view

- **Lane:** `lane-web`. **Depends on:** WEB-5.

Acceptance criteria:

- [ ] Lists findings grouped by rule and kind, with filters by rule and kind. Each line is phrased as found and not found, as in the architecture's example sentence, and shows the rule's citation.
- [ ] Clicking a finding opens the explorer with the missing or dangling connection drawn as a gap.

### WEB-7. Diff view

- **Lane:** `lane-web`. **Depends on:** WEB-5, OPS-6 (diff route).

Acceptance criteria:

- [ ] Pick two snapshots. The explorer styles nodes and edges as added, removed or changed, and pending (predicted) nodes are styled distinctly from real ones.
- [ ] A summary panel lists the counts, and findings added and resolved.

### WEB-8. Custom tables view

- **Lane:** `lane-web`. **Depends on:** WEB-5, OPS-6 (custom-table and overlay routes).

Acceptance criteria:

- [ ] For each custom table, it shows each proposed link with sample values and whether they resolve. The user can confirm the link, correct the target kind, or reject it. Confirmed choices are saved as an overlay, and the view offers a rescan.

### WEB-9. Shape slots on node cards (brief requirement 6)

- **Lane:** `lane-web`. **Depends on:** WEB-5, CORE-14 (rule results), PROF-9 (slot metadata on rules), OPS-6 (slot states in the neighborhood response).
- **Why:** "A spell with no effects and a script that fakes its outcome should look different from a real spell" is a core use case. Architecture section 9 defines how it looks: expected-connection slots on the card, filled or visibly empty.

Acceptance criteria:

- [ ] Each game-layer card shows one slot per expectation rule with slot metadata that selects its kind, in the rules' `order`, with the rule's `label`. A filled slot looks different from an empty one, without relying on colour alone (an outline or icon as well), and an optional slot that is empty is distinguishable from a required one.
- [ ] Clicking an empty slot opens its finding, when the rule wrote one. Clicking a filled slot highlights the edges that fill it.
- [ ] No slot or tooltip uses verdict wording ("wrong", "broken", "fake"). It says what is connected and what is not (architecture section 1, principle 4).
- [ ] A component test renders the fixture "script but no effects" spell and checks that its effect slot is empty and its script slot filled.

### WEB-10. End-to-end smoke test

- **Lane:** `lane-web`. **Depends on:** WEB-5, WEB-6.

Acceptance criteria:

- [ ] A Playwright test starts the server on a fixture workspace SQLite file, searches for a node, opens it in the explorer, follows an edge, and opens a finding. It runs in CI on both operating systems.

### OPS-7. CLI

- **Lane:** `lane-ops`. **Depends on:** OPS-2, CORE-12, CORE-15.

Acceptance criteria:

- [ ] `canvas init` (creates a workspace, interactive or via flags), `canvas scan`, `canvas serve` (starts the server and opens the browser), `canvas diff <a> <b>` (prints a summary), and `canvas export`, which emits a snapshot, a focused subgraph (focus node plus hops) or a findings list as JSON in the model's schema (architecture section 2). An exported file validates against the core Zod schemas in a test.
- [ ] `--help` text is in plain language.
- [ ] Exit codes are non-zero on failure.
- [ ] Tests run each command against a fixture workspace.

### OPS-8. Packaging for `npx canvas`

- **Lane:** `lane-ops`. **Depends on:** OPS-7, WEB-2.

Acceptance criteria:

- [ ] One published package bundles the server, the web build and the vendored WASM grammars, with the correct `bin` entry.
- [ ] `npx` on a clean Windows machine with Node 24 and no compiler installs and serves. This is verified in a CI job that installs the packed tarball on `windows-latest`.
- [ ] `LICENSE-THIRD-PARTY.md` is complete for every bundled dependency.
- [ ] A release workflow publishes on a version tag. Publishing needs Alex's npm token as a repository secret; the workflow is inert until he adds it.

### OPS-9. User documentation

- **Lane:** `lane-ops`. **Depends on:** WEB-3, OPS-8.

Acceptance criteria:

- [ ] `README.md` covers what Canvas is, how to install and run it, and how to create a read-only MySQL user (the exact `GRANT SELECT` statements).
- [ ] It also covers how to point Canvas at a clone and a DBC folder, and what a finding means: a fact about connections, not a verdict.
- [ ] Everything is written for a server owner, not a Canvas developer.

### OPS-10. Phase 1 end-to-end check (local only)

- **Lane:** `lane-ops`. **Depends on:** every issue above.

Acceptance criteria:

- [ ] A documented, scripted local run against the clean AzerothCore checkout and a world database built from it (MySQL 8, created by the server's own updater, never from a hand-made dump). The checkout and database locations come from configuration, never hardcoded.
- [ ] Spell 116 can be followed from its record through any script binding, into code, and out to a loaded table.
- [ ] The run records how long the scan took and the node and edge counts, in `docs/research/phase-1-e2e.md`.
- [ ] Any finding the clean server produces is listed and explained. On a clean server, each finding is either a real fact about AzerothCore (for example the dead tables) or a profile mistake to file as a bug.

---

## Filing order

The PM files the issues in this order, so that GitHub numbers follow the dependencies:

1. F-1
2. CORE-1, CORE-2, CORE-3, CORE-4, PROF-1, PROF-2, OPS-1, WEB-1, WEB-2
3. CORE-5, CORE-6, CORE-7, CORE-8, PROF-3, PROF-4, PROF-6, PROF-7, OPS-2, OPS-4
4. CORE-9, CORE-10, PROF-5 (5a-5d), PROF-8, CORE-11
5. CORE-12, CORE-13, CORE-14, CORE-15, CORE-16, CORE-17, PROF-9, OPS-3, OPS-5, OPS-6
6. WEB-3, WEB-4, WEB-5, WEB-6, WEB-7, WEB-8, WEB-9, WEB-10
7. OPS-7, OPS-8, OPS-9, OPS-10

Nothing but F-1 becomes a bead until F-1 is merged.

## Parallel work by lane after F-1

| Lane | Can start immediately | Waits on another lane for |
|---|---|---|
| lane-core | CORE-1, 2, 3, 4, 7 | PROF-2 (CORE-5), PROF-4 (CORE-6 finalization), PROF-6 (CORE-9), PROF-7 (CORE-10), PROF-8 (CORE-11, 13) |
| lane-profiles | PROF-1, then 2, 4, 6, 7 | nothing; profiles is upstream of core's readers |
| lane-ops | OPS-1, then OPS-2, then OPS-4 | CORE-1 and CORE-12 for OPS-6 |
| lane-web | WEB-1, WEB-2 (after OPS-1) | OPS-6 schemas for WEB-4 to WEB-8 |

lane-profiles is on the critical path for the readers. If one profiles worker cannot keep pace, the grunt-labelled transcription (PROF-2, the transcription part of PROF-4) is where a second worker helps.
