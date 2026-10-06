# Canvas: Architecture

Status: draft 1, 2026-10-06, by the Architect. Awaiting Alex's review. This document is the reference every pull request is checked against. A change that contradicts it needs a decision line in `docs/decisions.md` first.

Inputs: `docs/PROJECT-BRIEF.md`, `docs/research/azerothcore-schema.md` (edge catalogue), `docs/research/azerothcore-code.md` (DBC layouts, binding catalogue), `docs/research/stack.md`.

## 1. Principles

1. **One model, many sources.** Canvas has its own description of entities and links (section 3). Readers turn MySQL rows, DBC records, and source files into that model. Nothing downstream of a reader knows where a node came from except through the node's `origin` field. Phase 2 writers will turn the model back into files against the same description.
2. **Links are declared knowledge, not discovered.** The research showed the world database declares no foreign keys and the server's own comments are sometimes wrong. So every link type Canvas draws comes from a core profile (section 5) that cites the server source it was learned from. Canvas never guesses a link from a column name except in the custom-table flow, where the user confirms each guess.
3. **Every edge carries its confidence.** `exact`, `by-name`, `heuristic`, or `resolved`. The UI shows it. A path through the graph is only as strong as its weakest edge.
4. **Canvas reports connections, never verdicts.** Like a compiler listing errors when it loads a program, a scan reports what did not connect: an expected connection that is missing, a connection that points at nothing, a thing nothing connects to, a thing defined twice. It never says "wrong" or "mapped incorrectly." What makes a connection expected is a profile rule that cites the clean source it was learned from, so the expectation is AzerothCore's, not Canvas's. The judgment stays with the user, who sees the facts on the canvas. Findings are first-class objects, not UI afterthoughts.
5. **Nothing about one server is hardcoded.** Paths, credentials, table names, class names, module names are configuration. The clean AzerothCore profile is the only built-in knowledge.
6. **Read-only by construction in phase 1.** The MySQL user is expected to have SELECT only, and Canvas checks that at connect time. Source trees are read through git, never modified.

## 2. Packages

A pnpm workspaces monorepo. Boundaries are the lanes in `AGENTS.md`.

| Package | Lane | Contents |
|---|---|---|
| `packages/core` | lane-core | the model types, the reader interface, the readers (mysql, dbc, source, git), the SQLite store, the scan pipeline, snapshots and diff, findings engine |
| `packages/profiles` | lane-profiles | the core-profile format and the `azerothcore-335` profile: table list, edge definitions, DBC layouts, binding patterns, loader map, expectations, shape rules |
| `packages/server` | lane-ops | Fastify app: configuration, secrets, SSH tunnel, HTTP API, SSE progress, static hosting of the web build |
| `packages/web` | lane-web | React + React Flow app: setup wizard, explorer, findings, diff, custom-table mapping |
| `packages/cli` | lane-ops | `canvas` command: `init`, `scan`, `serve`, `diff`, `export` (a snapshot, a focused subgraph, or a findings list as JSON in the model's own schema, for sharing a question with another person) |

Dependency direction: `web` and `cli` depend on `server`'s API types; `server` depends on `core` and `profiles`; `profiles` depends on `core`; `core` depends on nothing in the repo. No cycles.

`core` owns the contracts: the model types, the `Reader` and `Storage` interfaces, and the `Profile` interface with all its parts (`TableDef`, `EdgeDef`, `DbcLayout`, `BindingDef`, `LoaderDef`, `OverrideLayer`, `Rule`, `LabelRule`). `profiles` implements `Profile`; it never defines the shape. The foundation issue lands those contracts before any lane starts.

The foundation issue is the one stated exception to "one bead per lane": it spans lane-core and lane-ops (skeleton, contracts, storage adapter and schema v1, CI), is labelled `foundation`, and is done by one worker sequentially so the lanes start from one coherent skeleton.

## 3. The model

### Nodes

```
Node {
  id: string          // stable across snapshots: "<kind>:<key>", see below
  kind: NodeKind
  label: string       // human-readable, from the profile's label rule
  attrs: object       // kind-specific fields, JSON
  origin: Origin      // where this came from
  snapshot: string    // which extraction produced it
}
```

Node kinds, grouped by layer:

- Data layer: `row` (one table row: key = `table/pk`), `dbc_record` (key = `file/id`), `table` (the table itself), `dbc_file`.
- Code layer: `file`, `class`, `function`, `enum`, `enum_value`, `module`, `patch`, `patch_hunk`, `lua_file`, `lua_handler`.
- Binding layer: `script_registration` (a macro or constructor that names a script), `id_literal` (a spell/creature/item ID written in code), `loader` (a C++ function that reads a table).
- Game layer (derived): `spell`, `class`, `race`, `skill`, `talent`, `item`, `creature`, `gameobject`, `quest`, `trainer`, `map`. These are the nodes users think in. Each is backed by one or more data-layer nodes: a `spell` is a `dbc_record` from Spell.dbc, possibly overridden by a `row` from `spell_dbc`, possibly patched by a hardcoded fix. The game node's `attrs` carry the merged view and `attrs.layers` lists which source won each field.

Stable IDs matter because diffing is set arithmetic on IDs. Keys are the natural keys: a spell is `spell:116`, a row is `row:creature_template/1234`, a function is `function:<file path>#<qualified name>`, a file is `file:<repo-relative path>`.

### Edges

```
Edge {
  id: string          // hash of (type, from, to, origin)
  type: EdgeType      // one of the profile's catalogue names, e.g. "trainer_teaches"
  from: NodeId
  to: NodeId
  confidence: "exact" | "by-name" | "heuristic" | "resolved"
  origin: Origin      // table.column, DBC field, or file:line
  attrs: object       // e.g. the sign trick that applied, the rank expansion
  snapshot: string
}
```

Edge types are data in the profile, not an enum in code. The ~110 rows of the schema research's edge catalogue and the 38 rows of the binding catalogue are the first contents. Code-layer edge types are fixed in `core`: `includes`, `defines`, `calls`, `references`, `registers`, `modifies` (patch to function), `loads` (loader to table), `reads_dbc`.

### Origin

```
Origin = { source: "mysql", table, column?, pk }
       | { source: "dbc", file, recordId, field? }
       | { source: "file", path, line, col?, gitRef }
       | { source: "override", layer: "spell_dbc" | "custom_attr" | "hardcoded_fix" | "module_hook", ...}
```

### Findings

```
Finding {
  id
  kind: "missing"      // an expected connection was not found
      | "dangling"     // a connection points at something that does not exist
      | "orphan"       // a thing exists and nothing connects to it or loads it
      | "duplicate"    // a thing is defined or registered more than once
      | "unapplied"    // a file exists that the server would never load
  expected: EdgeType | null   // for "missing": which connection the rule expected
  node: NodeId, related: NodeId[]
  rule: string                // profile rule id; the rule cites the clean source it was learned from
  snapshot
}
```

Every finding is a statement about connections, phrased as what was found and what was not. The UI renders them the same way: "No `trainer_teaches` connection found for spell 12345; rule `class-spell-reachable` expects one because clean AzerothCore grants every class spell through a trainer or a start rule (SkillLineAbility.dbc, playercreateinfo_skills)." There is no severity field: whether a missing connection matters is the user's call, and the UI lets the user filter by rule and by kind instead.

Examples the research already justifies, each as connections: a spell on a class skill line with no `trainer_teaches` and no `start_*` edge (missing); a `ScriptName` string with no `script_registration` node (dangling); the same script name registered twice (duplicate); a table with no `loads` edge from any loader (orphan); a SQL file in a module folder whose path the updater's naming rule rejects (unapplied); a spell record with zero `has_effect` edges that has a `registers` edge from a script whose `calls` edges reach damage functions no effect leads to (missing, plus the script's calls shown as dangling from any effect).

### Snapshots and diff

A snapshot is one complete extraction from one source set: a database connection, a DBC folder, and a git ref. Snapshots are immutable. A diff between two snapshots is: nodes added, nodes removed, nodes changed (attrs differ), edges added, edges removed, findings added, findings resolved. Because IDs are natural keys, "the same spell in both snapshots" needs no matching heuristics.

The common case: snapshot A = live database + live DBC folder + `main`; snapshot B = the same database + the same DBC + a branch. The code layer differs; the data layer differs only where the branch's SQL files would change it (section 6, "unapplied SQL").

## 4. Readers and the scan pipeline

```
interface Reader {
  readonly id: string
  plan(config, profile): ReadPlan           // what it will read, for the progress UI
  read(ctx: ReadContext): AsyncIterable<NodeOrEdge>
}
```

Readers emit; they never query the store. The pipeline writes emitted nodes and edges into the snapshot, then runs resolvers (turn by-name references into edges once both sides exist), then derives game-layer nodes, then runs the findings engine. Progress events flow to the UI over SSE.

Readers in phase 1:

- **mysql**: reads `information_schema` first (the live schema, never the base SQL files), then the profile's tables with the profile's label columns. Custom tables (not in the profile) are reported to the custom-table flow, not read as links.
- **dbc**: WDBC parser (header, fixed-width records, string block, 16-slot localized strings) with layouts from the profile's format strings. Files the server does not load but Canvas needs (SpellIcon, CharBaseInfo) use Canvas-defined layouts marked unverified until tested against real files.
- **source**: tree-sitter (WASM) for C++ and Lua. Extracts files, includes, classes with base classes, functions, enums and values, macro invocations, call sites with their argument tokens, and SQL strings inside loader functions. Call edges are `by-name` unless a later clang-based resolver upgrades them to `resolved`. Lua: `Register*Event` calls with numeric event IDs decoded from the engine's `Hooks.h`.
- **git**: enumerates files at a ref, reads `.patch` files into `patch` and `patch_hunk` nodes with `modifies` edges to the functions whose lines they touch, and lists SQL update files under module data folders with the updater's naming rule applied to flag unapplicable ones.

Incremental scans: the source reader keys on file content hash at the ref; the mysql reader keys on table checksum and row count; the dbc reader on file hash. Unchanged inputs reuse the previous snapshot's nodes by ID.

## 5. Core profiles

A profile is a TypeScript package exporting data-first definitions with small functions only where the research found sign tricks or encodings that need logic.

```
Profile {
  id: "azerothcore-335"
  databases: { world: TableDef[], characters: TableDef[], auth: TableDef[] }
  dbc: DbcLayout[]            // file, format string, field names, which fields the server skips
  edges: EdgeDef[]            // the catalogue: type, from kind, to kind, source, cardinality, decode fn?
  bindings: BindingDef[]      // macro and constructor patterns, base classes, name derivation
  loaders: LoaderDef[]        // table -> C++ function, from the research's loader map
  overrides: OverrideLayer[]  // spell_dbc etc., custom attrs, hardcoded fix sites, module hook
  expectations: Rule[]        // "a spell node has >= 1 has_effect edge", "a class spell has a trainer_teaches or start_* edge"; each cites the clean source.
                              // A Rule may carry slot display metadata { label, order, optional } so the explorer draws it as an
                              // expected-connection slot on the card (section 9). One structure: a slot IS an expectation, and an
                              // empty slot IS that rule's missing finding. There is no separate shape definition.
                              // An optional rule never writes a finding: an unmet optional slot is drawn empty on the card and stored
                              // as a rule result, nothing more, because the absence is normal in clean AzerothCore and findings must
                              // stay a list of things that did not connect as expected.
  labels: LabelRule[]         // how to name each kind
  deadTables: string[]        // ships but nothing loads it
}
```

Every definition cites `file:line` in the clean checkout it was learned from, as the research does. The profile is versioned against a core commit; a later AzerothCore update becomes a new profile version with a documented delta.

TrinityCore later: a second profile package. Nothing in `core` knows table names.

## 6. Custom tables and server overlays

The mysql reader lists tables not in the profile. For each, Canvas proposes links by column-name heuristics from a small dictionary (`spell`, `spell_id`, `entry`, `item`, `creature`, `class`, `classmask`, `race`, `quest`, `map`, `zone`, `skill`, `gameobject`, `guid`). Proposals are shown to the user with sample values; the user confirms, corrects the target kind, or rejects. Confirmed mappings are saved as a **server overlay**: a user-owned profile fragment stored in Canvas's config directory, versioned, exportable, and applied on every scan. Overlays can also add expectations ("every row in my custom class table should link to a ChrClasses record").

Unapplied SQL: the git reader parses `CREATE TABLE`, `ALTER TABLE`, `INSERT`, `REPLACE`, `DELETE` statements in a branch's SQL update files (a tolerant parser, not a full MySQL grammar) to predict what rows a branch would add or change, and tags those nodes as `pending`. The diff view shows them. This is a prediction, marked as such; the live database remains the truth.

## 7. Storage

One SQLite file per workspace (a workspace is one configured server). Tables: `snapshots`, `nodes`, `edges`, `findings`, `overlays`, `scan_log`. Indexes on `(snapshot, kind)`, `(snapshot, from)`, `(snapshot, to)`, `(snapshot, type)`, and a full-text index on labels. Node and edge `attrs` are JSON columns.

Binding: `better-sqlite3` now, behind a `Storage` interface, so Node's built-in SQLite can replace it when stable. The interface is small: open, transaction, prepared query, bulk insert.

## 8. Server

Fastify 5. Binds to `127.0.0.1` only. Routes:

- `GET /api/workspaces`, `POST /api/workspaces` (setup), connection test endpoints.
- `POST /api/scan` starts a scan; `GET /api/scan/:id/events` streams progress over SSE.
- `GET /api/graph/neighborhood?node=&hops=&edgeTypes=` returns a bounded subgraph with a hard cap and a "truncated" flag.
- `GET /api/search?q=` over labels and IDs.
- `GET /api/findings?snapshot=&kind=`.
- `GET /api/diff?a=&b=`.
- `GET /api/custom-tables`, `POST /api/overlays`.

Secrets: database passwords and SSH passphrases are stored with the OS credential store where available (`keytar`-class library, to be chosen in the plan), else in a config file with owner-only permissions, never in the SQLite file or logs. The connection test verifies the MySQL user holds SELECT only and warns otherwise.

SSH: `ssh2` library first, system `ssh` binary as a fallback (Windows 10 and later ship OpenSSH). Host-key confirmation and passphrase prompts are UI flows, not console prompts.

## 9. Web

React 19, Vite, `@xyflow/react`, Zustand, ELK layout in a Web Worker.

Views:

1. **Setup**: connection (host, SSH, database names), source (local clone path, ref), DBC folder, profile. Test each.
2. **Explorer**: a focus node, hop depth, edge-type filters, confidence filter. Nodes are compact cards with kind icon, label, and layer badges. Compound nodes group children (all spells of a class inside the class box) and collapse by default beyond a visible-node budget. The layout cache keys on the visible node set.

   Shape is shown as expected-connection slots, not as a verdict. Every game-layer node kind has, in the profile, the list of connection types a node of that kind is expected to have (a spell: effects, family, skill line, a trainer or start rule, optionally a script). The card shows one slot per expected type, filled when the connection exists and visibly empty when it does not, so a hollow spell reads as a card with its effect slot empty and its script slot filled. Empty slots are the same facts the findings list reports; clicking one opens the finding. Layer badges on the card say which source won each field (DBC, override table, hardcoded fix, module hook). This is the design for requirement 6; it needs no separate brief.
3. **Findings**: the list of what did not connect, grouped by rule and kind, each line naming the expected connection and the node, click to open in the explorer with the missing or dangling connection drawn as a gap.
4. **Diff**: two snapshots, the same explorer with added/removed/changed styling.
5. **Custom tables**: the proposal-and-confirm flow.

Visible-node budget: 1,500 by default, with collapse before truncation. The research measured ELK at about 4 seconds for 2,000 nodes; the budget keeps layout under that.

Theme: a painted look is a styling layer over the same components; it is not designed in this document.

## 10. Phase 2 hooks

Writers mirror readers: `Writer { plan(changeSet): FileSet; write(changeSet): Artifacts }` producing SQL update files, DBC files, and patch files into a folder the user chooses, never into a live database or source tree. The model's `origin` field tells a writer which layer a field lives in. Not built in phase 1; the model is designed so it can be.

## 11. Testing

- `core`: unit tests on the WDBC parser (synthetic files with every format character), the tree-sitter extractors (fixture C++ and Lua files covering each binding pattern in the catalogue), the diff, the findings engine.
- `profiles`: each edge definition has a fixture test with a minimal table and the expected edge; each expectation rule has a fixture where the connection exists (no finding) and one where it is absent (one finding).
- `server`: route tests against a fixture SQLite.
- `web`: component tests plus a Playwright smoke test on the explorer.
- CI runs on Linux and Windows. The Linux job also starts a MySQL 8 service container loaded with a small Canvas-authored fixture schema (a handful of tables shaped like the profile's, never the AzerothCore dump), so the mysql reader is tested against a real server. Windows runs everything else without MySQL.
- An optional local-only integration test runs the full pipeline against the clean checkout when it is present. CI does not have it.

## 12. Choices ratified from the stack research

- Fastify over Hono and Express: mature SSE and WebSocket plugins, strongest TypeScript typing of routes.
- `better-sqlite3` behind an interface; `node:sqlite` later.
- `web-tree-sitter` with the published `.wasm` grammars; no compiler needed on Windows.
- ELK over dagre: measured 10x faster at 2,000 nodes. ELK is dual-licensed EPL-2.0 / GPL-3.0-or-later; Canvas uses it under GPL-3.0-or-later for AGPL compatibility, recorded in `LICENSE-THIRD-PARTY.md`.
- TypeScript pinned below 6.1 until typescript-eslint supports the Go-based compiler; revisit when 7.1 lands.
- Exact version pins for every dependency; several are under three months old.
- Release 1 ships as an npm package run with `npx canvas`; a desktop wrapper is a later decision.

## 13. Open

- Prototype needed before lane-web commits to card-style nodes: render 1,500 custom React Flow nodes and measure.
- Layouts for SpellIcon.dbc and CharBaseInfo.dbc are unverified until tested against real files.
- The credential store library.
- Whether the Lua reader needs the engine's `Hooks.h` from the user's checkout or a copy in the profile (profile copy, versioned, is the current intent).
