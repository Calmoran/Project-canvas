import type { FastifyRequest } from "fastify";

/**
 * Whether a path is under `/api`. Case and repeated slashes are ignored, so
 * a request can't escape the check by writing `/API` or `//api`.
 */
export function isApiPath(path: string): boolean {
  const p = path.replace(/\/{2,}/g, "/").toLowerCase();
  return p === "/api" || p.startsWith("/api/");
}

/** The request path with percent-encoding undone, or undefined if malformed. */
function decodedPath(url: string): string | undefined {
  const raw = url.split("?", 1)[0] ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Whether a request is an API request. Fastify routes on the decoded path,
 * so `/%61pi/health` reaches the `/api/health` route; reading the raw URL
 * would miss that. So a request that matched a route is judged by that
 * route's own path, and one that matched nothing by its decoded path. A
 * path that cannot be decoded counts as API, so it is held to the stricter
 * rules.
 */
export function isApiRequest(request: FastifyRequest): boolean {
  const route = request.routeOptions.url;
  if (route !== undefined) return isApiPath(route);
  const path = decodedPath(request.url);
  return path === undefined || isApiPath(path);
}

/** The decoded path for messages; the raw one if it cannot be decoded. */
export function displayPath(request: FastifyRequest): string {
  return decodedPath(request.url) ?? request.url.split("?", 1)[0] ?? "";
}
