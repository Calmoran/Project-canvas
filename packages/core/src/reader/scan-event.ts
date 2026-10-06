import { z } from "zod";

/**
 * The stages of a scan, in order (architecture section 4): readers emit,
 * resolvers turn by-name references into edges, game-layer nodes are
 * derived, then the findings engine runs.
 */
export const SCAN_PHASES = ["read", "resolve", "derive", "findings"] as const;
export const ScanPhaseSchema = z.enum(SCAN_PHASES);
export type ScanPhase = z.infer<typeof ScanPhaseSchema>;

const base = {
  snapshot: z.string().min(1),
  at: z.iso.datetime(),
};

const counts = z.strictObject({
  nodes: z.int().nonnegative(),
  edges: z.int().nonnegative(),
});

/**
 * A scan progress event, streamed to the UI over SSE (server-sent events: a
 * plain HTTP response the server keeps open and writes events into).
 */
export const ScanEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("started"),
    readers: z.array(z.string().min(1)),
  }),
  z.strictObject({
    ...base,
    type: z.literal("reader_progress"),
    reader: z.string().min(1),
    item: z.string().min(1),
    done: z.int().nonnegative(),
    total: z.int().nonnegative().nullable(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("reader_done"),
    reader: z.string().min(1),
    emitted: counts,
  }),
  z.strictObject({
    ...base,
    type: z.literal("phase_changed"),
    phase: ScanPhaseSchema,
  }),
  z.strictObject({
    ...base,
    type: z.literal("finished"),
    totals: counts.extend({ findings: z.int().nonnegative() }),
  }),
  z.strictObject({
    ...base,
    type: z.literal("failed"),
    message: z.string().min(1),
    reader: z.string().min(1).optional(),
  }),
]);

export type ScanEvent = z.infer<typeof ScanEventSchema>;
