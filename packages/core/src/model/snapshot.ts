import { z } from "zod";

export const SNAPSHOT_STATUSES = ["running", "finished", "failed"] as const;
export const SnapshotStatusSchema = z.enum(SNAPSHOT_STATUSES);
export type SnapshotStatus = z.infer<typeof SnapshotStatusSchema>;

/** The core commit a profile is versioned against: a git hash, 7 to 40 hex digits. */
export const CoreCommitSchema = z.string().regex(/^[0-9a-f]{7,40}$/, {
  message: "A core commit is a 7- to 40-digit lowercase git hash",
});

/**
 * One complete extraction from one source set (architecture section 3).
 * A finished snapshot never changes. `sources` describes what was read, for
 * display; it never holds credentials.
 */
export const SnapshotSchema = z.strictObject({
  id: z.string().min(1),
  status: SnapshotStatusSchema,
  profile: z.strictObject({
    id: z.string().min(1),
    coreCommit: CoreCommitSchema,
  }),
  sources: z.strictObject({
    database: z.string().min(1).optional(),
    dbcFolder: z.string().min(1).optional(),
    gitRef: z.string().min(1).optional(),
  }),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

export type Snapshot = z.infer<typeof SnapshotSchema>;
