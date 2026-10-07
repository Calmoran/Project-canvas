import type { FastifyInstance } from "fastify";
import { DEFAULT_PORT, LOOPBACK_HOST } from "./address.js";
import { buildApp, type AppOptions } from "./app.js";
import { createLaunchToken } from "./security.js";

export interface StartOptions extends Omit<AppOptions, "token" | "port"> {
  /** Must be `127.0.0.1`; anything else is refused. */
  readonly host?: string;
  /** 0 asks the operating system for any free port. */
  readonly port?: number;
}

export interface RunningServer {
  readonly app: FastifyInstance;
  /** Where the server answers, e.g. `http://127.0.0.1:4870`. */
  readonly url: string;
  /** This launch's token; `/api` requests send it as `Authorization: Bearer <token>`. */
  readonly token: string;
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
 * Builds the app with a fresh launch token and opens its port. The host is
 * checked by exact match, so names that may resolve elsewhere ("localhost"
 * can mean ::1, "0.0.0.0" means every network card) are refused before
 * anything is opened.
 */
export async function startServer(
  options: StartOptions = {},
): Promise<RunningServer> {
  const { host = LOOPBACK_HOST, port = DEFAULT_PORT, ...appOptions } = options;
  if (host !== LOOPBACK_HOST) throw new NonLoopbackHostError(host);

  const token = createLaunchToken();
  const app = await buildApp({ ...appOptions, token });
  await app.listen({ host: LOOPBACK_HOST, port });
  const address = app.server.address();
  const actualPort =
    typeof address === "object" && address !== null ? address.port : port;
  return {
    app,
    url: `http://${LOOPBACK_HOST}:${actualPort}`,
    token,
    close: () => app.close(),
  };
}
