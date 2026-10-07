import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { ErrorResponseSchema, HealthResponseSchema } from "../src/api/index.js";
import { buildApp } from "../src/index.js";

// Every request here goes through `app.inject`: Fastify runs the request
// through its full routing and validation in memory, with no network port.

const FIXTURE_WEB = fileURLToPath(new URL("fixtures/web/", import.meta.url));

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function fixtureApp(): Promise<FastifyInstance> {
  app = await buildApp({ webRoot: FIXTURE_WEB });
  return app;
}

function errorOf(body: string) {
  return ErrorResponseSchema.parse(JSON.parse(body)).error;
}

describe("GET /api/health", () => {
  test("answers ok with the server package's version", async () => {
    const res = await (await fixtureApp()).inject("/api/health");
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
    const res = await (await fixtureApp()).inject("/api/no-such-route");
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(errorOf(res.body).code).toBe("not_found");
  });

  test("a non-GET request to an unknown path is not_found, not the web app", async () => {
    const res = await (
      await fixtureApp()
    ).inject({
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
    const res = await a.inject("/api/test/echo?n=abc");
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
    const res = await a.inject({
      method: "POST",
      url: "/api/test/body",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res.body).code).toBe("bad_request");
  });

  test("an internal error hides its message", async () => {
    const a = await fixtureApp();
    a.get("/api/test/boom", () => {
      throw new Error("secret detail: C:/path/to/config");
    });
    const res = await a.inject("/api/test/boom");
    expect(res.statusCode).toBe(500);
    const error = errorOf(res.body);
    expect(error.code).toBe("internal_error");
    expect(res.body).not.toContain("secret detail");
  });
});

describe("the web build", () => {
  test("is served from the web root", async () => {
    const a = await fixtureApp();
    const page = await a.inject("/");
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toMatch(/^text\/html/);
    expect(page.body).toContain("fixture app");

    const asset = await a.inject("/assets/app.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("fixture = true");
  });

  test("a client-side route gets index.html, so a reload works", async () => {
    const res = await (await fixtureApp()).inject("/explorer?node=spell:116");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("fixture app");
  });

  test("the placeholder build ships in the package by default", async () => {
    app = await buildApp();
    const res = await app.inject("/");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>Canvas</title>");
  });
});
