import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { installErrorHandler, sendError } from "./errors.js";
import { healthRoutes } from "./routes/health.js";

/**
 * The folder the web build is served from. It sits next to `src/` and
 * `dist/`, so the same relative path works from source and from the build.
 * The web package's production build is copied here (plan, WEB-2).
 */
export const DEFAULT_WEB_ROOT = fileURLToPath(
  new URL("../public/", import.meta.url),
);

export interface AppOptions {
  /** Where the web build lives. Tests point this at a fixture folder. */
  readonly webRoot?: string;
}

/**
 * Builds the Canvas HTTP app without opening a network port. `startServer`
 * opens the port; tests call this and send requests in memory with
 * `app.inject`.
 */
export async function buildApp(
  options: AppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

  // Route schemas are Zod schemas: requests are checked against them on the
  // way in and responses on the way out.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);

  await app.register(healthRoutes, { prefix: "/api" });

  // The web build. `wildcard: false` lists the files once at start-up
  // instead of matching every path, so unknown paths reach the handler below.
  await app.register(fastifyStatic, {
    root: options.webRoot ?? DEFAULT_WEB_ROOT,
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?", 1)[0] ?? "";
    const isApi = path === "/api" || path.startsWith("/api/");
    // A last segment with a dot names a file (/assets/app.js); a missing one
    // must be a 404, or the browser would run index.html as a script.
    const isFile = (path.split("/").pop() ?? "").includes(".");
    // The web app routes on the client, so a page reload on /explorer must
    // get the app's index.html, which then shows the right view. API paths,
    // missing files and non-GET requests still get a real 404.
    if (
      !isApi &&
      !isFile &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return reply.sendFile("index.html");
    }
    return sendError(
      reply,
      404,
      "not_found",
      `No route for ${request.method} ${path}.`,
    );
  });

  return app;
}
