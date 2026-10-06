import { z } from "zod";
import { AttrsSchema } from "./json.js";
import { OriginSchema } from "./origin.js";

/**
 * How sure Canvas is that an edge is real (architecture principle 3).
 * - exact: a literal ID or string the server itself uses
 * - by-name: a name matched between code and data
 * - heuristic: a pattern match that can miss or over-match
 * - resolved: a by-name link later confirmed by a resolver
 */
export const CONFIDENCES = [
  "exact",
  "by-name",
  "heuristic",
  "resolved",
] as const;
export const ConfidenceSchema = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Edge types of the code layer, fixed in core (architecture section 3).
 * Data-layer edge types are plain strings defined by the profile.
 */
export const CODE_EDGE_TYPES = [
  "includes",
  "defines",
  "calls",
  "references",
  "registers",
  "modifies",
  "loads",
  "reads_dbc",
] as const;
export const CodeEdgeTypeSchema = z.enum(CODE_EDGE_TYPES);
export type CodeEdgeType = z.infer<typeof CodeEdgeTypeSchema>;

/** Any edge type: a code-layer type or a profile catalogue name. */
export const EdgeTypeSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, {
  message: "Edge types are snake_case names",
});
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

const edgeFields = {
  type: EdgeTypeSchema,
  from: z.string().min(3),
  to: z.string().min(3),
  confidence: ConfidenceSchema,
  origin: OriginSchema,
  attrs: AttrsSchema,
};

/**
 * An edge as a reader emits it. The pipeline computes its ID with `edgeId`
 * and stamps the snapshot, so a reader cannot get either wrong.
 */
export const EdgeDraftSchema = z.strictObject(edgeFields);

/** One link between two nodes (architecture section 3, "Edges"). */
export const EdgeSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[0-9a-f]{32}$/, { message: "Edge ids come from edgeId()" }),
  ...edgeFields,
  snapshot: z.string().min(1),
});

export type EdgeDraft = z.infer<typeof EdgeDraftSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
