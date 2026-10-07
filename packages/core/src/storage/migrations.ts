import type { Storage } from "./storage.js";

/**
 * A numbered schema change. Migrations run in order, each in its own
 * transaction, and SQLite's `user_version` header records the last one
 * applied, so a half-applied migration is impossible and re-running is a
 * no-op.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/**
 * Schema v1 (architecture section 7). Node and edge rows are keyed by
 * (snapshot, id) because the same natural ID appears once per snapshot.
 * `attrs` and `origin` are JSON text, checked with `json_valid`. The edge
 * ends are `from_id` / `to_id` because FROM and TO are SQL keywords.
 */
const v1: Migration = {
  version: 1,
  name: "initial schema",
  sql: `
    CREATE TABLE snapshots (
      id           TEXT PRIMARY KEY,
      status       TEXT NOT NULL CHECK (status IN ('running', 'finished', 'failed')),
      profile_id   TEXT NOT NULL,
      core_commit  TEXT NOT NULL,
      sources      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(sources)),
      started_at   TEXT NOT NULL,
      finished_at  TEXT
    ) STRICT;

    CREATE TABLE nodes (
      -- An explicit integer key. The full-text index refers to rows by this
      -- number, and SQLite only promises to keep it stable (VACUUM included)
      -- when it is declared as INTEGER PRIMARY KEY.
      seq       INTEGER PRIMARY KEY,
      snapshot  TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
      id        TEXT NOT NULL,
      kind      TEXT NOT NULL,
      label     TEXT NOT NULL,
      attrs     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs)),
      origin    TEXT NOT NULL CHECK (json_valid(origin)),
      -- The reader input this node came from, so an unchanged input's
      -- nodes can be copied into the next snapshot. NULL: never reused.
      input     TEXT,
      UNIQUE (snapshot, id)
    ) STRICT;
    CREATE INDEX nodes_snapshot_kind ON nodes (snapshot, kind);
    CREATE INDEX nodes_snapshot_input ON nodes (snapshot, input) WHERE input IS NOT NULL;

    CREATE TABLE edges (
      snapshot    TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
      id          TEXT NOT NULL,
      type        TEXT NOT NULL,
      from_id     TEXT NOT NULL,
      to_id       TEXT NOT NULL,
      confidence  TEXT NOT NULL CHECK (confidence IN ('exact', 'by-name', 'heuristic', 'resolved')),
      origin      TEXT NOT NULL CHECK (json_valid(origin)),
      attrs       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attrs)),
      input       TEXT,
      UNIQUE (snapshot, id)
    ) STRICT;
    CREATE INDEX edges_snapshot_input ON edges (snapshot, input) WHERE input IS NOT NULL;
    CREATE INDEX edges_snapshot_from ON edges (snapshot, from_id);
    CREATE INDEX edges_snapshot_to ON edges (snapshot, to_id);
    CREATE INDEX edges_snapshot_type ON edges (snapshot, type);

    CREATE TABLE findings (
      snapshot  TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
      id        TEXT NOT NULL,
      kind      TEXT NOT NULL CHECK (kind IN ('missing', 'dangling', 'orphan', 'duplicate', 'unapplied')),
      -- JSON in the one form normalizeExpected writes: a string for one edge
      -- type, a list of two or more for any-of. (Sorting and uniqueness are
      -- checked by the code; a CHECK cannot look inside a list.)
      -- CASE, not AND, so json_type never sees text that is not JSON.
      expected  TEXT CHECK (
        expected IS NULL OR CASE WHEN json_valid(expected) THEN
          json_type(expected) = 'text'
          OR (json_type(expected) = 'array' AND json_array_length(expected) >= 2)
        ELSE 0 END
      ),
      node      TEXT NOT NULL,
      related   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(related)),
      rule      TEXT NOT NULL,
      UNIQUE (snapshot, id),
      -- missing must name what it expected, orphan may, the rest must not
      -- (decided per PR #16; the same rule as FindingSchema).
      CHECK (CASE kind
        WHEN 'missing' THEN expected IS NOT NULL
        WHEN 'orphan' THEN 1
        ELSE expected IS NULL
      END)
    ) STRICT;
    CREATE INDEX findings_snapshot_kind ON findings (snapshot, kind);

    CREATE TABLE overlays (
      id          TEXT NOT NULL,
      version     INTEGER NOT NULL CHECK (version >= 1),
      body        TEXT NOT NULL CHECK (json_valid(body)),
      created_at  TEXT NOT NULL,
      PRIMARY KEY (id, version)
    ) STRICT;

    -- Each reader input's fingerprint per snapshot (architecture section 7):
    -- what the next scan compares to decide whether it can skip the input.
    CREATE TABLE scan_inputs (
      snapshot     TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
      reader       TEXT NOT NULL,
      input_key    TEXT NOT NULL,
      fingerprint  TEXT NOT NULL,
      PRIMARY KEY (snapshot, reader, input_key)
    ) STRICT;

    CREATE TABLE scan_log (
      seq       INTEGER PRIMARY KEY,
      snapshot  TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
      at        TEXT NOT NULL,
      event     TEXT NOT NULL CHECK (json_valid(event))
    ) STRICT;
    CREATE INDEX scan_log_snapshot ON scan_log (snapshot, seq);

    -- Full-text index on node labels. It reads label text from the nodes
    -- table itself (external content), and the triggers keep it in step.
    CREATE VIRTUAL TABLE nodes_fts USING fts5 (
      label,
      content = 'nodes',
      content_rowid = 'seq'
    );
    CREATE TRIGGER nodes_fts_insert AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts (rowid, label) VALUES (new.seq, new.label);
    END;
    CREATE TRIGGER nodes_fts_delete AFTER DELETE ON nodes BEGIN
      INSERT INTO nodes_fts (nodes_fts, rowid, label) VALUES ('delete', old.seq, old.label);
    END;
    CREATE TRIGGER nodes_fts_update AFTER UPDATE OF label ON nodes BEGIN
      INSERT INTO nodes_fts (nodes_fts, rowid, label) VALUES ('delete', old.seq, old.label);
      INSERT INTO nodes_fts (rowid, label) VALUES (new.seq, new.label);
    END;
  `,
};

export const MIGRATIONS: readonly Migration[] = [v1];

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly number[];
}

/**
 * Brings a database up to the newest schema. Refuses a file written by a
 * newer Canvas, because an older build cannot know what that schema means.
 */
export function migrate(
  storage: Storage,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  checkSequence(migrations);
  const from = userVersion(storage);
  const latest = migrations.at(-1)?.version ?? 0;
  if (from > latest) {
    throw new Error(
      `Database schema v${from} is newer than this Canvas knows (v${latest})`,
    );
  }
  const applied: number[] = [];
  for (const migration of migrations) {
    if (migration.version <= from) continue;
    storage.transaction(() => {
      storage.exec(migration.sql);
      storage.exec(`PRAGMA user_version = ${migration.version}`);
    });
    applied.push(migration.version);
  }
  return { from, to: userVersion(storage), applied };
}

function userVersion(storage: Storage): number {
  const row = storage.prepare("PRAGMA user_version").get();
  return Number(row?.["user_version"] ?? 0);
}

function checkSequence(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Migrations must be numbered 1, 2, 3...; found v${migration.version} at position ${index + 1}`,
      );
    }
  });
}
