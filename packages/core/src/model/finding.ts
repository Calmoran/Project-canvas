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

/**
 * The connection a rule looked for: one edge type, or a list meaning any one
 * of them satisfies the rule ("a trainer_teaches or a start_* edge").
 * Decided per PR #16.
 *
 * Every meaning has exactly one form, so equal expectations store and
 * compare equal: one type is a plain string, and an any-of list holds two
 * or more distinct types in sorted order. The schema accepts only that form
 * and never reshapes its input, so it stays a plain data description that
 * converts to JSON Schema. Code that builds an `expected` value calls
 * `normalizeExpected` first.
 */
export type Expected = string | string[];

/**
 * Turns one type or a list of types into the one stored form: a one-item
 * list becomes the string and a list is sorted. A list that names a type
 * twice is refused, because it is an authoring mistake worth seeing rather
 * than hiding (pending Alex's confirmation).
 */
export function normalizeExpected(
  expected: string | readonly string[],
): Expected {
  if (typeof expected === "string") return expected;
  if (expected.length === 0) {
    throw new Error("An any-of list names at least one edge type");
  }
  if (new Set(expected).size !== expected.length) {
    throw new Error(
      `An any-of list names each edge type once: ${expected.join(", ")}`,
    );
  }
  const types = [...expected].sort();
  return types.length === 1 ? types[0]! : types;
}

const isStrictlyAscending = (types: readonly string[]): boolean =>
  types.every((t, i) => i === 0 || types[i - 1]! < t);

export const ExpectedSchema = z.union([
  EdgeTypeSchema,
  z
    .array(EdgeTypeSchema)
    .min(2, {
      message:
        "An any-of list names two or more edge types; one type is written as a plain string",
    })
    .refine((types) => new Set(types).size === types.length, {
      message: "An any-of list names each edge type once",
    })
    .refine(isStrictlyAscending, {
      message: "An any-of list is sorted (normalizeExpected sorts it)",
    }),
]);

/**
 * Which kinds name an expected connection (decided per PR #16): a `missing`
 * finding must, because "expected X, found none" is its whole statement; an
 * `orphan` may ("a table no loader loads" looks for `loads`); the other
 * kinds describe something else and must not. The SQLite schema enforces
 * the same rule on stored findings.
 */
export function expectedAllowed(
  kind: FindingKind,
  hasExpected: boolean,
): boolean {
  switch (kind) {
    case "missing":
      return hasExpected;
    case "orphan":
      return true;
    default:
      return !hasExpected;
  }
}

export const EXPECTED_PAIRING_MESSAGE =
  "A 'missing' finding or rule names its expected edge type(s), an 'orphan' may, other kinds must not";

/** Something that did not connect as a profile rule expects (architecture section 3). */
export const FindingSchema = z
  .strictObject({
    id: z.string().min(1),
    kind: FindingKindSchema,
    /** The connection the rule looked for, or null (see `expectedAllowed`). */
    expected: ExpectedSchema.nullable(),
    node: z.string().min(3),
    related: z.array(z.string().min(3)),
    /** The profile rule's ID; the rule cites the clean source. */
    rule: z.string().min(1),
    snapshot: z.string().min(1),
  })
  .refine((f) => expectedAllowed(f.kind, f.expected !== null), {
    message: EXPECTED_PAIRING_MESSAGE,
    path: ["expected"],
  });

export type Finding = z.infer<typeof FindingSchema>;
