import { z } from "zod";

/** A primary-key value of a MySQL row, one entry per key column. */
const PrimaryKeySchema = z
  .record(z.string().min(1), z.union([z.string(), z.number()]))
  .refine((pk) => Object.keys(pk).length > 0, {
    message: "A primary key names at least one column",
  });

/** The profile's three databases (architecture section 5). */
export const DATABASES = ["world", "characters", "auth"] as const;
export const DatabaseSchema = z.enum(DATABASES);
export type Database = z.infer<typeof DatabaseSchema>;

/**
 * A MySQL table, row or column. `database` is the profile's database the
 * table belongs to, since one table name can exist in several (`updates`
 * is in all three; decided by Alex). Without `pk` the origin is the whole
 * table, as for a `table` node.
 */
export const MysqlOriginSchema = z.strictObject({
  source: z.literal("mysql"),
  database: DatabaseSchema,
  table: z.string().min(1),
  column: z.string().min(1).optional(),
  pk: PrimaryKeySchema.optional(),
});

/**
 * A DBC file, record or field. Without `recordId` the origin is the whole
 * file, as for a `dbc_file` node (like a MySQL origin without `pk`).
 */
export const DbcOriginSchema = z.strictObject({
  source: z.literal("dbc"),
  file: z.string().min(1),
  recordId: z.int().nonnegative().optional(),
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
 * (file), never another override or a DBC record. Phase 2 writers need it
 * to know where an overridden value is set (decided per PR #16).
 */
export const OverrideOriginSchema = z.strictObject({
  source: z.literal("override"),
  layer: OverrideLayerNameSchema,
  at: z.discriminatedUnion("source", [MysqlOriginSchema, FileOriginSchema]),
});

export type MysqlOrigin = z.infer<typeof MysqlOriginSchema>;
export type DbcOrigin = z.infer<typeof DbcOriginSchema>;
export type FileOrigin = z.infer<typeof FileOriginSchema>;
export type OverrideOrigin = z.infer<typeof OverrideOriginSchema>;

/** Where a node or edge came from (architecture section 3, "Origin"). */
export const OriginSchema = z.discriminatedUnion("source", [
  MysqlOriginSchema,
  DbcOriginSchema,
  FileOriginSchema,
  OverrideOriginSchema,
]);
export type Origin = z.infer<typeof OriginSchema>;
