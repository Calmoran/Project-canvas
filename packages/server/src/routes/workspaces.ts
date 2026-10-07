import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  WorkspaceInputSchema,
  WorkspaceListResponseSchema,
  WorkspaceSchema,
} from "../api/index.js";
import { sendError } from "../errors.js";
import {
  checkWorkspaceInput,
  WorkspaceExistsError,
  type WorkspaceStore,
} from "../workspaces.js";

export interface WorkspaceRoutesOptions {
  readonly store: WorkspaceStore;
  /** The IDs of the core profiles this Canvas ships. */
  readonly profileIds: readonly string[];
}

/**
 * `GET /api/workspaces` lists the configured servers; `POST /api/workspaces`
 * is setup's "save": it checks the record and creates the workspace.
 */
export const workspaceRoutes: FastifyPluginAsyncZod<WorkspaceRoutesOptions> = (
  app,
  { store, profileIds },
) => {
  app.get(
    "/workspaces",
    { schema: { response: { 200: WorkspaceListResponseSchema } } },
    () => store.list(),
  );

  app.post(
    "/workspaces",
    {
      schema: {
        body: WorkspaceInputSchema,
        response: { 201: WorkspaceSchema },
      },
    },
    async (request, reply) => {
      const issues = checkWorkspaceInput(request.body, profileIds);
      if (issues.length > 0) {
        return sendError(
          reply,
          400,
          "validation_failed",
          "The request did not match the expected shape.",
          issues,
        );
      }
      try {
        const workspace = await store.create(request.body);
        return await reply.status(201).send(workspace);
      } catch (error) {
        if (error instanceof WorkspaceExistsError) {
          // 409 Conflict: the request is fine but clashes with what exists.
          return sendError(
            reply,
            409,
            "bad_request",
            `A workspace with a name like this already exists (folder "${error.folder}"). Pick another name.`,
          );
        }
        throw error;
      }
    },
  );
  return Promise.resolve();
};
