import { z } from "zod";

/** A primary-key value of a MySQL row, one entry per key column. */
const PrimaryKeySchema = z
  .record(z.string().min(1), z.union([z.string(), z.number()]))
  .refine((pk) => Object.keys(pk).length > 0, {
    message: "A primary key names at least one column",
  });

export const MysqlOriginSchema = z.strictObject({
  source: z.literal("mysql"),
  table: z.string().min(1),
  column: z.string().min(1).optional(),
  pk: PrimaryKeySchema,
});

export const DbcOriginSchema = z.strictObject({
  source: z.literal("dbc"),
  file: z.string().min(1),
  recordId: z.int().nonnegative(),
  /** A field name from the profile's layout, or its index when it has no name yet. */
  field: z.union([z.string().min(1), z.int().nonnegative()]).optional(),
});

export const FileOriginSchema = z.strictObject({
  source: z.literal("file"),
  /** Repository-relative path with forward slashes. */
  path: z.string().min(1),
  line: z.int().positive(),
  col: z.int().positive().optional(),
  gitRef: z.string().min(1),
});

export const OVERRIDE_LAYERS = [
  "spell_dbc",
  "custom_attr",
  "hardcoded_fix",
  "module_hook",
] as const;
export const OverrideLayerNameSchema = z.enum(OVERRIDE_LAYERS);
export type OverrideLayerName = z.infer<typeof OverrideLayerNameSchema>;

/**
 * A value set by one of the server's override layers. `at` is where the
 * override itself is written: the override row (mysql) or the fixing line
 * (file). Phase 2 writers need it to know where an overridden value is set
 * (decided per PR #16).
 */
export interface OverrideOrigin {
  readonly source: "override";
  readonly layer: OverrideLayerName;
  readonly at: Origin;
}

export type MysqlOrigin = z.infer<typeof MysqlOriginSchema>;
export type DbcOrigin = z.infer<typeof DbcOriginSchema>;
export type FileOrigin = z.infer<typeof FileOriginSchema>;

/** Where a node or edge came from (architecture section 3, "Origin"). */
export type Origin = MysqlOrigin | DbcOrigin | FileOrigin | OverrideOrigin;

export const OverrideOriginSchema = z.strictObject({
  source: z.literal("override"),
  layer: OverrideLayerNameSchema,
  // A getter, because an origin can contain an origin: the schema refers
  // to itself, and the getter defers that lookup until it is defined.
  get at(): z.ZodType<Origin> {
    return OriginSchema;
  },
});

export const OriginSchema: z.ZodType<Origin> = z.discriminatedUnion("source", [
  MysqlOriginSchema,
  DbcOriginSchema,
  FileOriginSchema,
  OverrideOriginSchema,
]);
