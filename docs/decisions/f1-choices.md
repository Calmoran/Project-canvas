# Foundation choices: a walkthrough for Alex

Written 2026-10-06 by the Architect. These are the open contract details from the foundation pull request (#15), plus four refinements the Reviewer added and one architecture gap the worker found. Each one is a question, what the options mean in practice, what it affects later, and my recommendation. Alex decided every item on 2026-10-06 after walking through it with the Architect. Outcomes: 1 (a) with normalization; 2 (a); 3 (b); 4 32 characters; 5 (a); 6 accept; input fingerprints accepted; 7 revised version; expected-any-of accepted; 8 accepted with both additions; 9 (c); 10, 11, 12 accepted. Logged in `docs/decisions.md`; the architecture amendments are in the same pull request.

A "contract" here means a type definition in the core package that every other package will build against. Changing one later means touching everything built on it, which is why they are being settled now while only the foundation exists.

---

## Part 1: how things are identified

### 1. How a database row is named inside a node's origin

Every node remembers where it came from. For a row from a MySQL table, that memory has to say which row. Most tables have a one-column key (a spell ID, a creature entry), but some have two or more (a trainer's list of spells is keyed by trainer ID *and* spell ID together).

- **(a) A small map of key column to value**, like `{ TrainerId: 1, SpellId: 116 }`. Handles multi-column keys without inventing anything.
- **(b) One joined string**, like `1/116`. Shorter, but then we need a rule for the separator and for keys that contain that character.

The Reviewer's addition: whichever we pick, values must be normalized, so a key read as the number 116 and the same key read as the text "116" produce the same edge ID. Without that, the same edge could get two IDs on two scans and the diff view would report phantom changes.

Affects: every edge ID, so every diff. **Recommendation: (a), with normalization.**

### 2. How a DBC field is named inside an origin

A node from a DBC file remembers which field it came from. Field names arrive in a later issue than the layouts do.

- **(a) A name or a numeric position.** Works before names exist.
- **(b) Names only.** Cleaner, but blocks the DBC reader until names land.

Affects: ordering of the profile lane's work. **Recommendation: (a).**

### 3. What an override's origin records

Research found four layers that can change a spell after the DBC: an override table, a custom-attributes table, hardcoded fixes in C++, and a module hook. When Canvas shows a value, it says which layer won. The question is how much the origin records about that layer.

- **(a) Just the layer name, plus whatever extra fields come along.** The worker's lean: it doesn't invent structure.
- **(b) The layer name, plus the origin of the override itself**: which table row, or which file and line, did the overriding.

Affects: phase 2. A writer that wants to change an overridden value has to know where the override lives. With (a) it would have to go looking; with (b) it is already recorded. **Recommendation: (b).** The worker says it is a small edit.

### 4. How long an edge ID is

Edge IDs are a hash, a fixed-length fingerprint computed from the edge's type, ends, and origin. Same inputs, same fingerprint, every time.

- **32 characters**, half the full fingerprint. Collisions are not a realistic concern at that length. Half the storage of the full one across millions of edges.
- **64 characters**, the full fingerprint.

Affects: database size, nothing else. **Recommendation: 32.**

## Part 2: how the pipeline and readers divide the work

### 5. What a reader hands over

A reader (the MySQL reader, the DBC reader) produces nodes and edges. Some fields on them, the snapshot stamp and the edge ID, are bookkeeping the pipeline can fill in.

- **(a) Readers leave those blank; the pipeline stamps them.** A reader cannot get them wrong.
- **(b) Readers fill in everything.** Simpler types, more ways to make a mistake in each of five readers.

Affects: every reader. **Recommendation: (a).**

### 6. What a snapshot records about itself

The architecture never listed a snapshot's fields. The worker chose: an ID, a status (running, finished, failed), the profile and core commit used, a text description of the sources with no credentials in it, and start and finish times.

Affects: the diff view and the setup screen. **Recommendation: accept.**

### New gap: remembering inputs between scans

The architecture says scans are incremental: unchanged inputs reuse last time's results. The Reviewer noticed that nothing in the contracts carries the previous scan's input fingerprints, so a reader has no way to ask "did this file change since last time?"

- **Proposal: the pipeline keeps a small table of input fingerprints per snapshot, and a reader can ask for an input's previous fingerprint.** The pipeline owns it; readers just ask.

Affects: scan speed on large sources; the architecture's reader and storage sections. **Recommendation: accept, as an architecture amendment.**

## Part 3: rules and findings

### 7. Pairing between a rule's kind and what it expects

A "missing" finding says "I expected connection X and found none," so it must name X. The other kinds (dangling, orphan, duplicate, unapplied) describe something else. The worker proposed enforcing this: a missing rule must name its expected connection, the others must not, and only a missing rule can be drawn as a slot on a card. The database enforces the same.

The Reviewer's addition: the orphan rule "a table that nothing loads" also looks for a specific connection (the loads connection, coming in), so it should be allowed to name one.

- **Revised proposal:** missing must name it, orphan may, the rest must not. Only missing rules become slots.

Affects: the findings engine and the card slots. **Recommendation: accept the revised version.**

### Gap: a rule that accepts any of several connections

The clearest rule in the whole project is "a class spell is reachable through a trainer *or* a start rule." That expects any one of two connection types. The finding model holds exactly one expected type.

- **Proposal: "expected" is one type or a short list meaning any of these.** One line in the architecture, a small change in the contract.

Affects: the profile lane's first set of rules. **Recommendation: accept.**

### 8. The shapes of the profile parts

The worker wrote minimal definitions for each part of a profile (tables, DBC layouts, edge definitions, binding patterns, loaders, override layers, rules, label rules), kept small so the profile lane can grow them. Two gaps from the Reviewer:

- **Citations point into more than one source.** The profile cites a core commit, but the Lua engine is a separate module at its own commit. Citations need to say which source they point into. Proposal: the profile lists its sources with a commit each, and every citation names one.
- **Rules select by kind only.** "A class spell" is a spell with a particular attribute, not just any spell. Proposal: a rule selects by kind plus an optional attribute match.

Affects: every citation and every rule. **Recommendation: accept the worker's shapes with both additions.**

## Part 4: tooling details

### 9. Prettier and Markdown

Prettier rewrites code into one layout. It can do the same to Markdown documents, but reformatting every doc inside the foundation pull request would collide with the docs pull requests that are open at the same time.

- **(a) Exclude Markdown for now.**
- **(b) Reformat all docs in this pull request.** Collides.
- **(c) Exclude now, then reformat the docs in one small follow-up pull request once the open ones merge, and drop the exclusion.**

Affects: document consistency, nothing in the product. **Recommendation: (c).**

### 10. Database layout details

Column names (edge ends are `from_id` and `to_id` because the bare words are SQL keywords), how overlays are versioned, how migrations are tracked (SQLite's built-in version number). Ordinary engineering, nothing user-visible. **Recommendation: accept.**

### 11. Repo scripts in TypeScript

The small check scripts (exact pins, dependency direction) are TypeScript files that Node now runs directly, instead of plain JavaScript. Same language as everything else. **Recommendation: accept.**

### 12. MySQL version in CI

The throwaway MySQL in the Linux test job is version 8.4, the current long-term release, rather than 8.0. Users on 8.0 are covered by the pure-JavaScript client either way. **Recommendation: accept.**

---

## What happens after you decide

1. I record each decision in `docs/decisions.md` and amend the architecture for the three that touch it (override origin, input fingerprints, expected-any-of).
2. The PM sends the worker the list of edits; the worker makes them on the same pull request; the Reviewer re-reviews; the PM merges and closes the bead.
3. I add the test gate as a required check on main.
4. The lanes open.
