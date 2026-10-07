import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendError } from "./errors.js";

/**
 * Two locks on a server that only listens on this computer, because a web
 * page from anywhere on the internet, open in the same browser, can still
 * send requests to 127.0.0.1.
 *
 * 1. Host check. A browser always says which site it thinks it is talking
 *    to, in the `Host` header. A trick called DNS rebinding points an
 *    attacker's own name (evil.example) at 127.0.0.1, so their page could
 *    read Canvas's answers as if they were its own; the browser then sends
 *    `Host: evil.example`. Only `127.0.0.1:<port>` and `localhost:<port>`
 *    are answered.
 * 2. Launch token. A long random secret made fresh each time the server
 *    starts. Every `/api` request must carry it, so a page that cannot read
 *    Canvas's own pages cannot call the API either.
 */

/** How a request presents the token: `Authorization: Bearer <token>`. */
export const TOKEN_SCHEME = "Bearer";

/** A new launch token: 32 random bytes, written in URL-safe base64. */
export function createLaunchToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The `Host` values this server answers to on the given port. */
export function allowedHosts(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

/** Compares in constant time, so response timing does not leak the token. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function presentedToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header === undefined) return undefined;
  const [scheme, token, ...rest] = header.split(" ");
  return scheme === TOKEN_SCHEME && token && rest.length === 0
    ? token
    : undefined;
}

export interface SecurityOptions {
  readonly token: string;
  /**
   * The port the browser reaches the server on. Read on every request,
   * because with port 0 it is known only once the server is listening.
   */
  readonly port: () => number;
}

/** Runs both checks before routing, on every request, static files included. */
export function installSecurity(
  app: FastifyInstance,
  options: SecurityOptions,
): void {
  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host?.toLowerCase();
    if (host === undefined || !allowedHosts(options.port()).has(host)) {
      return sendError(
        reply,
        403,
        "bad_request",
        "This server only answers requests addressed to 127.0.0.1 or localhost on its own port.",
      );
    }

    const path = request.url.split("?", 1)[0] ?? "";
    const isApi = path === "/api" || path.startsWith("/api/");
    if (isApi) {
      const token = presentedToken(request);
      if (token === undefined || !tokenMatches(token, options.token)) {
        return sendError(
          reply,
          401,
          "bad_request",
          "API requests need this server's launch token.",
        );
      }
    }
  });
}
