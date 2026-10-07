/**
 * The web app's one way to talk to the Canvas server.
 *
 * Every request goes to `/api/...` on the same server that sent the page,
 * carries this launch's token as `Authorization: Bearer <token>` (the server
 * refuses API requests without it), and has its answer checked against the
 * server's own schema from `@canvas/server/api`. A failed request becomes an
 * `ApiError` carrying the server's stable error code, so views branch on the
 * code, never on message text.
 */
import {
  ErrorResponseSchema,
  HealthResponseSchema,
  type ErrorCode,
  type HealthResponse,
} from "@canvas/server/api";

/** Any schema from `@canvas/server/api`: something that can check a value. */
interface Schema<T> {
  safeParse(
    data: unknown,
  ):
    { success: true; data: T } | { success: false; error: { issues: unknown } };
}

/** The `<meta>` tag the server writes this launch's token into. */
export const TOKEN_META_NAME = "canvas-token";

/**
 * A request that did not succeed. `code` is the server's code word, or
 * `network` when no answer arrived, or `bad_response` when the answer did
 * not match the contract.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "network" | "bad_response",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Reads the launch token from the page. Throws when it is missing: the page
 * was then not served by a Canvas server, and every API call would fail.
 */
export function readLaunchToken(doc: Document): string {
  const meta = doc.querySelector<HTMLMetaElement>(
    `meta[name="${TOKEN_META_NAME}"]`,
  );
  const token = meta?.content;
  if (!token) {
    throw new Error(
      "This page has no Canvas launch token. Open Canvas from the address the server printed.",
    );
  }
  return token;
}

export interface ApiClientOptions {
  readonly token: string;
  /** Injected in tests; the browser's own `fetch` otherwise. */
  readonly fetch?: typeof fetch;
}

export interface ApiClient {
  health(): Promise<HealthResponse>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    path: `/api/${string}`,
    schema: Schema<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${options.token}`);
    headers.set("accept", "application/json");

    let response: Response;
    try {
      response = await doFetch(path, { ...init, headers });
    } catch (cause) {
      throw new ApiError(
        0,
        "network",
        `The Canvas server did not answer (${String(cause)}). Is it still running?`,
      );
    }

    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(body);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiError(response.status, code, message, details);
      }
      throw new ApiError(
        response.status,
        "bad_response",
        `The server answered ${response.status} without a Canvas error body.`,
      );
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        response.status,
        "bad_response",
        `The answer from ${path} does not match the API contract.`,
        parsed.error.issues,
      );
    }
    return parsed.data;
  }

  return {
    health: () => request("/api/health", HealthResponseSchema),
  };
}
