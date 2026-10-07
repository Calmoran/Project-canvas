import type { FastifyInstance } from "fastify";
import { buildApp, type AppOptions } from "./app.js";

/**
 * The only address Canvas listens on. 127.0.0.1 is reachable from this
 * computer alone, so the database connection details and the graph are
 * never offered to the network (architecture section 8).
 */
export const LOOPBACK_HOST = "127.0.0.1";

/** The port used when none is given. */
export const DEFAULT_PORT = 4870;

export interface StartOptions extends AppOptions {
  /** Must be `127.0.0.1`; anything else is refused. */
  readonly host?: string;
  /** 0 asks the operating system for any free port. */
  readonly port?: number;
}

export interface RunningServer {
  readonly app: FastifyInstance;
  /** Where the server answers, e.g. `http://127.0.0.1:4870`. */
  readonly url: string;
  close(): Promise<void>;
}

/** Thrown when asked to listen anywhere but the loopback address. */
export class NonLoopbackHostError extends Error {
  constructor(host: string) {
    super(
      `Canvas only listens on ${LOOPBACK_HOST}; refusing to listen on "${host}".`,
    );
    this.name = "NonLoopbackHostError";
  }
}

/**
 * Builds the app and opens its port. The host is checked by exact match, so
 * names that may resolve elsewhere ("localhost" can mean ::1, "0.0.0.0"
 * means every network card) are refused before anything is opened.
 */
export async function startServer(
  options: StartOptions = {},
): Promise<RunningServer> {
  const { host = LOOPBACK_HOST, port = DEFAULT_PORT, ...appOptions } = options;
  if (host !== LOOPBACK_HOST) throw new NonLoopbackHostError(host);

  const app = await buildApp(appOptions);
  await app.listen({ host: LOOPBACK_HOST, port });
  const address = app.server.address();
  const actualPort =
    typeof address === "object" && address !== null ? address.port : port;
  return {
    app,
    url: `http://${LOOPBACK_HOST}:${actualPort}`,
    close: () => app.close(),
  };
}
