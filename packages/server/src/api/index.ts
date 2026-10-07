/**
 * The HTTP API contract: request and response schemas, and the types
 * inferred from them. Published as `@canvas/server/api` so `web` and `cli`
 * share it. Nothing under `src/api/` may import Fastify or any Node-only
 * module, because the web app bundles this for the browser; a test enforces
 * it.
 */
export * from "./error.js";
export * from "./health.js";
export * from "./workspace.js";
