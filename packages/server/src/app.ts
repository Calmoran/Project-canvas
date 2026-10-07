import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { DEFAULT_PORT } from "./address.js";
import { installErrorHandler, sendError } from "./errors.js";
import { displayPath, isApiRequest } from "./paths.js";
import { healthRoutes } from "./routes/health.js";
import { installSecurity } from "./security.js";
import { sendPage } from "./web-page.js";

/**
 * The folder the web build is served from. It sits next to `src/` and
 * `dist/`, so the same relative path works from source and from the build.
 * The web package's production build is copied here (plan, WEB-2).
 */
export const DEFAULT_WEB_ROOT = fileURLToPath(
  new URL("../public/", import.meta.url),
);

export interface AppOptions {
  /** The launch token every `/api` request must carry (see security.ts). */
  readonly token: string;
  /** Where the web build lives. Tests point this at a fixture folder. */
  readonly webRoot?: string;
  /**
   * The port expected in the `Host` header while the app is not listening
   * (in-memory tests). Once it listens, the real port is used.
   */
  readonly port?: number;
}

/**
 * Builds the Canvas HTTP app without opening a network port. `startServer`
 * opens the port; tests call this and send requests in memory with
 * `app.inject`.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    // Errors Fastify raises before routing (a URL that cannot be decoded)
    // skip the error handler; this gives them the uniform shape too.
    frameworkErrors: (_error, _request, reply) => {
      sendError(reply, 400, "bad_request", "The request URL is malformed.");
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Route schemas are Zod schemas: requests are checked against them on the
  // way in and responses on the way out.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);
  installSecurity(app, {
    token: options.token,
    port: () => {
      const address = app.server.address();
      return typeof address === "object" && address !== null
        ? address.port
        : (options.port ?? DEFAULT_PORT);
    },
  });

  await app.register(healthRoutes, { prefix: "/api" });

  const webRoot = options.webRoot ?? DEFAULT_WEB_ROOT;
  const page = (_request: unknown, reply: FastifyReply) =>
    sendPage(reply, webRoot, options.token);

  // The web build. `wildcard: false` lists the files once at start-up
  // instead of matching every path, so unknown paths reach the handler
  // below. The top-level index.html is left out: it is served by `page`,
  // which writes the launch token into it.
  await app.register(fastifyStatic, {
    root: webRoot,
    wildcard: false,
    globIgnore: ["index.html"],
  });
  app.get("/", page);
  app.get("/index.html", page);

  app.setNotFoundHandler((request, reply) => {
    const path = displayPath(request);
    // A last segment with a dot names a file (/assets/app.js); a missing one
    // must be a 404, or the browser would run index.html as a script.
    const isFile = (path.split("/").pop() ?? "").includes(".");
    // The web app routes on the client, so a page reload on /explorer must
    // get the app's index.html, which then shows the right view. API paths,
    // missing files and non-GET requests still get a real 404.
    if (
      !isApiRequest(request) &&
      !isFile &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return page(request, reply);
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
