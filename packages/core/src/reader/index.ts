import { z } from "zod";
import { EdgeDraftSchema } from "../model/edge.js";
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

/** One thing a reader emits: a node or an edge, before the pipeline stores it. */
export const NodeOrEdgeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("node"), node: NodeDraftSchema }),
  z.strictObject({ type: z.literal("edge"), edge: EdgeDraftSchema }),
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
      isFunction(ctx["progress"])
    );
  },
  {
    message:
      "A read context has a snapshot, config, profile, plan, signal and progress()",
  },
);

export * from "./scan-event.js";
