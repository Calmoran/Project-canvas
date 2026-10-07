import { z } from "zod";

/**
 * Workspaces: one configured server each (architecture section 7). The
 * record says where Canvas reads from (MySQL, the source clone, the DBC and
 * Lua folders) and which core profile explains it.
 *
 * A record never holds a secret. A password or passphrase lives in the
 * credential store (OPS-4), and the record keeps only the key it is filed
 * under. The request schemas are strict, so a body that sends a `password`
 * field is refused rather than silently dropped.
 */

/** Folder paths are checked for being absolute on the server, which knows the OS. */
const PathSchema = z.string().trim().min(1).max(4096);

const PortSchema = z.int().min(1).max(65535);

/** A MySQL database name: 1 to 64 characters, as MySQL allows. */
const DatabaseNameSchema = z.string().min(1).max(64);

/**
 * Where a secret is filed in the credential store. Set by the server, never
 * by a request, so one workspace cannot point at another's secret.
 */
export const SecretKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/);

/**
 * The three databases a phase 1 workspace knows by role (architecture
 * section 5, `databases`). Only the world database is required. Two roles
 * naming the same database are refused (decision of 2026-10-07). Names are
 * compared ignoring case: with `lower_case_table_names` set (the default on
 * Windows) MySQL folds them, so `Acore` and `acore` are one database.
 */
export const DatabasesSchema = z
  .strictObject({
    world: DatabaseNameSchema,
    characters: DatabaseNameSchema.optional(),
    auth: DatabaseNameSchema.optional(),
  })
  .superRefine((databases, ctx) => {
    const seen = new Map<string, string>();
    for (const role of ["world", "characters", "auth"] as const) {
      const name = databases[role];
      if (name === undefined) continue;
      const other = seen.get(name.toLowerCase());
      if (other !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [role],
          message: `"${name}" is already the ${other} database; each role needs its own database.`,
        });
      } else {
        seen.set(name.toLowerCase(), role);
      }
    }
  });

/** How Canvas signs in to the SSH server. */
export const SshAuthInputSchema = z.discriminatedUnion("method", [
  /** A private key file; its passphrase, if any, goes in the credential store. */
  z.strictObject({ method: z.literal("key"), privateKeyPath: PathSchema }),
  /** A password, kept in the credential store. */
  z.strictObject({ method: z.literal("password") }),
  /** The running SSH agent (Pageant or the OpenSSH agent on Windows). */
  z.strictObject({ method: z.literal("agent") }),
]);

/** Reaching MySQL through an SSH tunnel (architecture section 8). */
export const SshInputSchema = z.strictObject({
  host: z.string().trim().min(1).max(255),
  port: PortSchema.default(22),
  user: z.string().min(1).max(255),
  auth: SshAuthInputSchema,
});

export const MysqlInputSchema = z.strictObject({
  host: z.string().trim().min(1).max(255),
  port: PortSchema.default(3306),
  user: z.string().min(1).max(255),
  databases: DatabasesSchema,
  ssh: SshInputSchema.optional(),
});

/** `POST /api/workspaces`: what setup sends to create a workspace. */
export const WorkspaceInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  profileId: z.string().min(1),
  mysql: MysqlInputSchema,
  /** A local git clone and the ref (branch, tag or commit) to read. */
  source: z.strictObject({ path: PathSchema, ref: z.string().trim().min(1) }),
  dbc: z.strictObject({ path: PathSchema }),
  /** The Lua scripts folder, for servers that run a Lua engine. */
  lua: z.strictObject({ path: PathSchema }).optional(),
});

export type WorkspaceInput = z.input<typeof WorkspaceInputSchema>;

/** The stored and returned record: the input plus the server-set fields. */
export const WorkspaceSchema = z.strictObject({
  /** Record format version, so a later Canvas can upgrade old records. */
  version: z.literal(1),
  /** A random UUID made by the server: the workspace's identity. */
  id: z.uuid(),
  name: WorkspaceInputSchema.shape.name,
  profileId: WorkspaceInputSchema.shape.profileId,
  mysql: z.strictObject({
    ...MysqlInputSchema.shape,
    passwordKey: SecretKeySchema.optional(),
    ssh: z
      .strictObject({
        ...SshInputSchema.shape,
        /** The key file's passphrase or the SSH password, whichever applies. */
        secretKey: SecretKeySchema.optional(),
      })
      .optional(),
  }),
  source: WorkspaceInputSchema.shape.source,
  dbc: WorkspaceInputSchema.shape.dbc,
  lua: WorkspaceInputSchema.shape.lua,
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

/** `GET /api/workspaces`. */
export const WorkspaceListResponseSchema = z.strictObject({
  /** Sorted by name. */
  workspaces: z.array(WorkspaceSchema),
  /**
   * Folders in the workspaces directory whose record is missing or cannot be
   * read, so a damaged workspace is reported instead of silently vanishing.
   */
  unreadable: z.array(
    z.strictObject({ folder: z.string(), reason: z.string() }),
  ),
});

export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;
