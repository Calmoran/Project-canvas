import { z } from "zod";
import { MysqlInputSchema, WorkspaceInputSchema } from "./workspace.js";

/**
 * Connection tests (OPS-3): setup's "Test" buttons (architecture section 9).
 * Each one checks one part of a workspace's settings before anything is
 * saved, so the request carries the draft settings themselves.
 *
 * A test that ran answers HTTP 200 whatever it found: "MySQL refused the
 * password" is a valid answer, not a bad request. Only a malformed request
 * gets an error response.
 */

/** How one check went. A warning does not block setup. */
export const CheckStatusSchema = z.enum(["ok", "warning", "failed"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckResultSchema = z.strictObject({
  /** A stable word naming the check, e.g. `connect` or `read-only`. */
  check: z.string().min(1),
  status: CheckStatusSchema,
  /** A plain sentence the setup screen can show as it is. */
  message: z.string().min(1),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Every connection test answers with this. */
export const ConnectionTestResponseSchema = z.strictObject({
  /** The worst status among the checks. */
  status: CheckStatusSchema,
  /** In the order they ran; a failed check skips the ones that need it. */
  checks: z.array(CheckResultSchema).min(1),
});
export type ConnectionTestResponse = z.infer<
  typeof ConnectionTestResponseSchema
>;

/**
 * `POST /api/connection-tests/mysql`: a direct connection (SSH comes with
 * OPS-5). The password is used for this one connection and then dropped:
 * it is never stored, logged, or sent back.
 */
export const MysqlTestRequestSchema = z.strictObject({
  mysql: MysqlInputSchema.omit({ ssh: true }),
  password: z.string().max(1024).optional(),
});
export type MysqlTestRequest = z.input<typeof MysqlTestRequestSchema>;

/** `POST /api/connection-tests/source`: a git clone and a ref in it. */
export const SourceTestRequestSchema = z.strictObject({
  source: WorkspaceInputSchema.shape.source,
});
export type SourceTestRequest = z.input<typeof SourceTestRequestSchema>;

/**
 * `POST /api/connection-tests/dbc`: the DBC folder. The profile says which
 * Spell.dbc layout the files must have.
 */
export const DbcTestRequestSchema = z.strictObject({
  profileId: WorkspaceInputSchema.shape.profileId,
  dbc: WorkspaceInputSchema.shape.dbc,
});
export type DbcTestRequest = z.input<typeof DbcTestRequestSchema>;

/** `POST /api/connection-tests/lua`: the Lua scripts folder. */
export const LuaTestRequestSchema = z.strictObject({
  lua: WorkspaceInputSchema.shape.lua.unwrap(),
});
export type LuaTestRequest = z.input<typeof LuaTestRequestSchema>;
