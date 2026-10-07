import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { ErrorResponseSchema, HealthResponseSchema } from "../src/api/index.js";
import { buildApp, DEFAULT_WEB_ROOT } from "../src/index.js";

// Every request here goes through `app.inject`: Fastify runs the request
// through its full routing and validation in memory, with no network port.

const FIXTURE_WEB = fileURLToPath(new URL("fixtures/web/", import.meta.url));

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const TOKEN = "test-launch-token";

async function fixtureApp(): Promise<FastifyInstance> {
  app = await buildApp({ token: TOKEN, webRoot: FIXTURE_WEB });
  return app;
}

/**
 * Sends a request the way the Canvas web app would: addressed to
 * 127.0.0.1 on the default port, with the launch token. The refusals are
 * tested in security.test.ts.
 */
function send(a: FastifyInstance, request: string | InjectOptions) {
  const options = typeof request === "string" ? { url: request } : request;
  return a.inject({
    ...options,
    headers: {
      host: "127.0.0.1:4870",
      authorization: `Bearer ${TOKEN}`,
      ...options.headers,
    },
  });
}

function errorOf(body: string) {
  return ErrorResponseSchema.parse(JSON.parse(body)).error;
}

describe("GET /api/health", () => {
  test("answers ok with the server package's version", async () => {
    const res = await send(await fixtureApp(), "/api/health");
    expect(res.statusCode).toBe(200);
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(HealthResponseSchema.parse(res.json())).toEqual({
      status: "ok",
      version: pkg.version,
    });
  });
});

describe("the uniform error shape", () => {
  test("an unknown API path is a not_found error", async () => {
    const res = await send(await fixtureApp(), "/api/no-such-route");
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(errorOf(res.body).code).toBe("not_found");
  });

  test("a non-GET request to an unknown path is not_found, not the web app", async () => {
    const res = await send(await fixtureApp(), {
      method: "POST",
      url: "/explorer",
    });
    expect(res.statusCode).toBe(404);
    expect(errorOf(res.body).code).toBe("not_found");
  });

  test("a request that fails its schema lists what failed", async () => {
    const a = await fixtureApp();
    a.withTypeProvider<
      import("fastify-type-provider-zod").ZodTypeProvider
    >().get(
      "/api/test/echo",
      { schema: { querystring: z.object({ n: z.coerce.number().int() }) } },
      (request) => ({ n: request.query.n }),
    );
    const res = await send(a, "/api/test/echo?n=abc");
    expect(res.statusCode).toBe(400);
    const error = errorOf(res.body);
    expect(error.code).toBe("validation_failed");
    expect(error.details).toEqual([
      expect.objectContaining({ in: "querystring", path: "/n" }),
    ]);
  });

  test("a malformed JSON body is a bad_request", async () => {
    const a = await fixtureApp();
    a.post("/api/test/body", () => ({}));
    const res = await send(a, {
      method: "POST",
      url: "/api/test/body",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res.body).code).toBe("bad_request");
  });

  test("a thrown 404 is a not_found error", async () => {
    const a = await fixtureApp();
    a.get("/api/test/missing", () => {
      throw Object.assign(new Error("No snapshot abc."), { statusCode: 404 });
    });
    const res = await send(a, "/api/test/missing");
    expect(res.statusCode).toBe(404);
    expect(errorOf(res.body)).toEqual({
      code: "not_found",
      message: "No snapshot abc.",
    });
  });

  test("another client error keeps its own status", async () => {
    const a = await fixtureApp();
    a.post("/api/test/body", () => ({}));
    const res = await send(a, {
      method: "POST",
      url: "/api/test/body",
      headers: { "content-type": "application/x-unknown" },
      payload: "x",
    });
    expect(res.statusCode).toBe(415);
    expect(errorOf(res.body).code).toBe("bad_request");
  });

  test("an internal error hides its message", async () => {
    const a = await fixtureApp();
    a.get("/api/test/boom", () => {
      throw new Error("secret detail: C:/path/to/config");
    });
    const res = await send(a, "/api/test/boom");
    expect(res.statusCode).toBe(500);
    const error = errorOf(res.body);
    expect(error.code).toBe("internal_error");
    expect(res.body).not.toContain("secret detail");
  });
});

describe("the web build", () => {
  test("is served from the web root", async () => {
    const a = await fixtureApp();
    const page = await send(a, "/");
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toMatch(/^text\/html/);
    expect(page.body).toContain("fixture app");

    const asset = await send(a, "/assets/app.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("fixture = true");
  });

  test("a client-side route gets index.html, so a reload works", async () => {
    const res = await send(await fixtureApp(), "/explorer?node=spell:116");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("fixture app");
  });

  test.each([
    ["GET", "/"],
    ["GET", "/index.html"],
    ["GET", "/explorer"],
    ["GET", "/explorer?node=spell:116"],
    ["GET", "/findings/missing/spell"],
    ["HEAD", "/"],
    ["HEAD", "/explorer"],
  ] as const)(
    "%s %s forbids being shown in another site's frame",
    async (method, url) => {
      const res = await send(await fixtureApp(), { method, url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-security-policy"]).toBe(
        "frame-ancestors 'none'",
      );
    },
  );

  test.each(["/assets/missing.js", "/favicon.ico", "/explorer/x.css"])(
    "a missing file %s is a 404, not index.html",
    async (url) => {
      const res = await send(await fixtureApp(), url);
      expect(res.statusCode).toBe(404);
      expect(errorOf(res.body).code).toBe("not_found");
    },
  );

  // The folder holds the web package's build output and is git-ignored, so
  // it may be empty here; the tests above serve the fixture build instead.
  test("is served from the package's public folder by default", () => {
    expect(DEFAULT_WEB_ROOT).toBe(
      fileURLToPath(new URL("../public/", import.meta.url)),
    );
  });
});
