import { z } from "zod";
import { EdgeTypeSchema } from "./edge.js";

/**
 * The five kinds of finding (architecture principle 4). Each is a statement
 * about connections, never a verdict, so there is no severity field.
 */
export const FINDING_KINDS = [
  "missing",
  "dangling",
  "orphan",
  "duplicate",
  "unapplied",
] as const;
export const FindingKindSchema = z.enum(FINDING_KINDS);
export type FindingKind = z.infer<typeof FindingKindSchema>;

/** Something that did not connect as a profile rule expects (architecture section 3). */
export const FindingSchema = z
  .strictObject({
    id: z.string().min(1),
    kind: FindingKindSchema,
    /** For `missing`, the connection the rule expected; otherwise null. */
    expected: EdgeTypeSchema.nullable(),
    node: z.string().min(3),
    related: z.array(z.string().min(3)),
    /** The profile rule's ID; the rule cites the clean source. */
    rule: z.string().min(1),
    snapshot: z.string().min(1),
  })
  .refine((f) => (f.kind === "missing") === (f.expected !== null), {
    message:
      "A 'missing' finding names its expected edge type; other kinds have none",
    path: ["expected"],
  });

export type Finding = z.infer<typeof FindingSchema>;
