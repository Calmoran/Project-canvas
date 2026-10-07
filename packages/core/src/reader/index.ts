import { z } from "zod";
import { EdgeDraftSchema } from "../model/edge.js";
import { FindingDraftSchema } from "../model/finding.js";
import { NodeDraftSchema } from "../model/node.js";
import type { Profile } from "../profile/index.js";

/**
 * What one reader will read, so the progress UI can show it before the scan
 * starts (architecture section 4). `total` is a unit count (rows, files,
 * records) when the reader can know it in advance, else null.
 */
export const ReadPlanSchema = z.strictObject({
  reader: z.string().min(1),
  items: z.array(
    z.strictObject({
      id: z.string().min(1),
      label: z.string().min(1),
      total: z.int().nonnegative().nullable(),
    }),
  ),
});
export type ReadPlan = z.infer<typeof ReadPlanSchema>;

/**
 * An input key: one unit a reader fingerprints and can skip as a whole,
 * such as a source file, a table or a DBC file. Its format is the reader's
 * own (`src/a.cpp`, `world.creature_template`, `Spell.dbc`).
 */
export const InputKeySchema = z.string().min(1);

/**
 * One thing a reader emits (architecture section 4, incremental scans
 * decided per PR #16):
 * - `node` / `edge`: something read, before the pipeline stamps it. `input`
 *   (required, decided by Alex) names the input it came from; the pipeline
 *   stores it with this reader's id, since an input is identified by reader
 *   and key together, so a later scan can copy everything that input produced.
 *   Only nodes and edges the pipeline makes itself (resolver edges, derived
 *   game-layer nodes) have no input.
 * - `reuse`: the input is unchanged since the previous snapshot (its
 *   fingerprint matches `previousFingerprint`), so the pipeline copies that
 *   input's nodes and edges from the previous snapshot instead.
 * - `finding`: something a reader found while reading, such as identical
 *   rows in a table without a primary key (`CORE_RULES.duplicateRow`). The
 *   pipeline gives it its ID and snapshot; `input` lets a reuse copy it too.
 */
export const NodeOrEdgeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("node"),
    node: NodeDraftSchema,
    input: InputKeySchema,
  }),
  z.strictObject({
    type: z.literal("edge"),
    edge: EdgeDraftSchema,
    input: InputKeySchema,
  }),
  z.strictObject({ type: z.literal("reuse"), input: InputKeySchema }),
  z.strictObject({
    type: z.literal("finding"),
    finding: FindingDraftSchema,
    input: InputKeySchema,
  }),
]);
export type NodeOrEdge = z.infer<typeof NodeOrEdgeSchema>;

/** A progress update a reader reports while it runs. */
export const ReaderProgressSchema = z.strictObject({
  item: z.string().min(1),
  done: z.int().nonnegative(),
  total: z.int().nonnegative().nullable(),
});
export type ReaderProgress = z.infer<typeof ReaderProgressSchema>;

/** What the pipeline hands a reader when it runs. */
export interface ReadContext<Config = unknown> {
  readonly snapshot: string;
  readonly config: Config;
  readonly profile: Profile;
  readonly plan: ReadPlan;
  /** Aborted when the user cancels the scan; a reader stops promptly. */
  readonly signal: AbortSignal;
  progress(update: ReaderProgress): void;
  /**
   * The fingerprint the previous snapshot recorded for an input, or
   * undefined when there is no previous snapshot or the input is new.
   */
  previousFingerprint(readerId: string, inputKey: string): string | undefined;
  /**
   * Records an input's fingerprint for this snapshot (a file hash at the
   * ref, a table checksum and row count, a DBC file hash). The pipeline
   * stores it in `scan_inputs`, so the next scan can compare. A reader
   * records every input it reads or reuses.
   */
  recordInput(inputKey: string, fingerprint: string): void;
}

/**
 * A source of nodes and edges (architecture section 4). Readers emit; they
 * never query the store. `Config` is the reader's own settings type.
 */
export interface Reader<Config = unknown> {
  readonly id: string;
  plan(config: Config, profile: Profile): ReadPlan | Promise<ReadPlan>;
  read(ctx: ReadContext<Config>): AsyncIterable<NodeOrEdge>;
}

const isFunction = (value: unknown): boolean => typeof value === "function";

/**
 * Runtime checks for the two behaviour types. They hold functions, which no
 * JSON schema can describe, so these confirm the shape (fields present,
 * functions where functions belong) for a reader plugged in at run time.
 */
export const ReaderSchema = z.custom<Reader>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.length > 0 &&
    isFunction((value as { plan?: unknown }).plan) &&
    isFunction((value as { read?: unknown }).read),
  { message: "A reader has a non-empty id, a plan() and a read()" },
);

export const ReadContextSchema = z.custom<ReadContext>(
  (value) => {
    if (typeof value !== "object" || value === null) return false;
    const ctx = value as Record<string, unknown>;
    return (
      typeof ctx["snapshot"] === "string" &&
      ctx["snapshot"].length > 0 &&
      "config" in ctx &&
      typeof ctx["profile"] === "object" &&
      ctx["profile"] !== null &&
      ReadPlanSchema.safeParse(ctx["plan"]).success &&
      ctx["signal"] instanceof AbortSignal &&
      isFunction(ctx["progress"]) &&
      isFunction(ctx["previousFingerprint"]) &&
      isFunction(ctx["recordInput"])
    );
  },
  {
    message:
      "A read context has a snapshot, config, profile, plan, signal, progress(), previousFingerprint() and recordInput()",
  },
);

export * from "./scan-event.js";
