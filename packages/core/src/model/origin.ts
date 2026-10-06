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
 * A value set by one of the server's override layers. The architecture leaves
 * the layer-specific fields open (`...`), so extra fields are kept as given.
 */
export const OverrideOriginSchema = z.looseObject({
  source: z.literal("override"),
  layer: OverrideLayerNameSchema,
});

/** Where a node or edge came from (architecture section 3, "Origin"). */
export const OriginSchema = z.discriminatedUnion("source", [
  MysqlOriginSchema,
  DbcOriginSchema,
  FileOriginSchema,
  OverrideOriginSchema,
]);

export type MysqlOrigin = z.infer<typeof MysqlOriginSchema>;
export type DbcOrigin = z.infer<typeof DbcOriginSchema>;
export type FileOrigin = z.infer<typeof FileOriginSchema>;
export type OverrideOrigin = z.infer<typeof OverrideOriginSchema>;
export type Origin = z.infer<typeof OriginSchema>;
