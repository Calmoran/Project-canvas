import { z } from "zod";

/**
 * A JSON value: what can be stored in a SQLite JSON column and sent to the
 * browser unchanged. Node and edge `attrs` are made of these.
 */
export const JsonValueSchema = z.json();
export type JsonValue = z.infer<typeof JsonValueSchema>;

/** An object whose values are JSON, used for `attrs`. */
export const AttrsSchema = z.record(z.string(), JsonValueSchema);
export type Attrs = z.infer<typeof AttrsSchema>;
