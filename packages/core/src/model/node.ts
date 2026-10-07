import { z } from "zod";
import { AttrsSchema } from "./json.js";
import { NodeKindSchema } from "./node-kind.js";
import { OriginSchema } from "./origin.js";

const nodeFields = {
  /** `<kind>:<key>`; see `nodeId`. */
  id: z.string().min(3),
  kind: NodeKindSchema,
  /** Human-readable name, from the profile's label rule. */
  label: z.string(),
  attrs: AttrsSchema,
  origin: OriginSchema,
};

const idMatchesKind = (node: { id: string; kind: string }): boolean =>
  node.id.startsWith(`${node.kind}:`) && node.id.length > node.kind.length + 1;

const idMessage = {
  message: "Node id must be '<kind>:<key>' for its own kind",
  path: ["id"],
};

/** A node as a reader emits it, before the pipeline stamps the snapshot. */
export const NodeDraftSchema = z
  .strictObject(nodeFields)
  .refine(idMatchesKind, idMessage);

/** One entity in the graph (architecture section 3, "Nodes"). */
export const NodeSchema = z
  .strictObject({ ...nodeFields, snapshot: z.string().min(1) })
  .refine(idMatchesKind, idMessage);

export type NodeDraft = z.infer<typeof NodeDraftSchema>;
export type Node = z.infer<typeof NodeSchema>;
