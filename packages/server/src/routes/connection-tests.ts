import type { Profile } from "@canvas/core";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  ConnectionTestResponseSchema,
  DbcTestRequestSchema,
  LuaTestRequestSchema,
  MysqlTestRequestSchema,
  SourceTestRequestSchema,
} from "../api/index.js";
import {
  testDbc,
  testLua,
  testMysql,
  testSource,
} from "../connection-tests.js";
import { sendError } from "../errors.js";
import { relativePathIssues, type InputIssue } from "../workspaces.js";

export interface ConnectionTestRoutesOptions {
  /** The core profiles this Canvas ships, by ID. */
  readonly profiles: ReadonlyMap<string, Profile>;
}

const response = { 200: ConnectionTestResponseSchema };

function refuse(reply: FastifyReply, issues: InputIssue[]) {
  return sendError(
    reply,
    400,
    "validation_failed",
    "The request did not match the expected shape.",
    issues,
  );
}

/**
 * `POST /api/connection-tests/{mysql,source,dbc,lua}`: setup's "Test"
 * buttons, one per part of a workspace's settings (connection-tests.ts).
 */
export const connectionTestRoutes: FastifyPluginAsyncZod<
  ConnectionTestRoutesOptions
> = (app, { profiles }) => {
  app.post(
    "/connection-tests/mysql",
    { schema: { body: MysqlTestRequestSchema, response } },
    (request) => testMysql(request.body),
  );

  app.post(
    "/connection-tests/source",
    { schema: { body: SourceTestRequestSchema, response } },
    async (request, reply) => {
      const issues = relativePathIssues([
        ["/source/path", request.body.source.path],
      ]);
      if (issues.length > 0) return refuse(reply, issues);
      return testSource(request.body);
    },
  );

  app.post(
    "/connection-tests/dbc",
    { schema: { body: DbcTestRequestSchema, response } },
    async (request, reply) => {
      const issues = relativePathIssues([["/dbc/path", request.body.dbc.path]]);
      const profile = profiles.get(request.body.profileId);
      if (profile === undefined) {
        issues.push({
          in: "body",
          path: "/profileId",
          message: `Unknown profile "${request.body.profileId}"; known: ${[...profiles.keys()].join(", ")}.`,
        });
      }
      if (issues.length > 0 || profile === undefined) {
        return refuse(reply, issues);
      }
      return testDbc(request.body, profile);
    },
  );

  app.post(
    "/connection-tests/lua",
    { schema: { body: LuaTestRequestSchema, response } },
    async (request, reply) => {
      const issues = relativePathIssues([["/lua/path", request.body.lua.path]]);
      if (issues.length > 0) return refuse(reply, issues);
      return testLua(request.body);
    },
  );
  return Promise.resolve();
};
