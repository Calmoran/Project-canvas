import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { HealthResponseSchema } from "../api/index.js";
import { SERVER_VERSION } from "../version.js";

/** `GET /api/health`: answers as soon as the server can serve requests. */
export const healthRoutes: FastifyPluginAsyncZod = (app) => {
  app.get(
    "/health",
    { schema: { response: { 200: HealthResponseSchema } } },
    () => ({ status: "ok" as const, version: SERVER_VERSION }),
  );
  return Promise.resolve();
};
