import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { ErrorResponseSchema } from "../src/api/index.js";
import { buildApp, createLaunchToken, startServer } from "../src/index.js";

const FIXTURE_WEB = fileURLToPath(new URL("fixtures/web/", import.meta.url));
const TOKEN = "test-launch-token";
const GOOD_HOST = "127.0.0.1:4870";
const GOOD_AUTH = `Bearer ${TOKEN}`;

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function fixtureApp(): Promise<FastifyInstance> {
  app = await buildApp({ token: TOKEN, webRoot: FIXTURE_WEB, port: 4870 });
  return app;
}

function errorOf(body: string) {
  return ErrorResponseSchema.parse(JSON.parse(body)).error;
}

describe("the Host check", () => {
  test.each(["127.0.0.1:4870", "localhost:4870", "LOCALHOST:4870"])(
    "answers Host %j",
    async (host) => {
      const res = await (
        await fixtureApp()
      ).inject({
        url: "/api/health",
        headers: { host, authorization: GOOD_AUTH },
      });
      expect(res.statusCode).toBe(200);
    },
  );

  // evil.example is a DNS-rebinding page; the others are the right machine
  // on the wrong port or under a name that is not one of the two allowed.
  test.each([
    "evil.example",
    "evil.example:4870",
    "localhost.evil.example:4870",
    "127.0.0.1:4871",
    "127.0.0.1",
    "localhost",
    "[::1]:4870",
    "0.0.0.0:4870",
  ])("refuses Host %j, on the API and on web pages", async (host) => {
    const a = await fixtureApp();
    for (const url of ["/api/health", "/", "/assets/app.js"]) {
      const res = await a.inject({
        url,
        headers: { host, authorization: GOOD_AUTH },
      });
      expect(res.statusCode, url).toBe(403);
      expect(errorOf(res.body).code).toBe("bad_request");
      expect(res.body).not.toContain("fixture");
    }
  });

  test("refuses a request with no Host header", async () => {
    const res = await (
      await fixtureApp()
    ).inject({
      url: "/api/health",
      headers: { host: "", authorization: GOOD_AUTH },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("the launch token", () => {
  test.each([
    ["no Authorization header", undefined],
    ["a wrong token", "Bearer not-the-token"],
    ["a token one character short", `Bearer ${TOKEN.slice(0, -1)}`],
    ["the wrong scheme", `Basic ${TOKEN}`],
    ["the token with no scheme", TOKEN],
    ["extra words after the token", `Bearer ${TOKEN} extra`],
  ])("refuses an API request with %s", async (_label, authorization) => {
    const res = await (
      await fixtureApp()
    ).inject({
      url: "/api/health",
      headers:
        authorization === undefined
          ? { host: GOOD_HOST }
          : { host: GOOD_HOST, authorization },
    });
    expect(res.statusCode).toBe(401);
    expect(errorOf(res.body).code).toBe("bad_request");
  });

  test("covers unknown API paths too, so routes cannot be probed", async () => {
    const res = await (
      await fixtureApp()
    ).inject({ url: "/api/no-such-route", headers: { host: GOOD_HOST } });
    expect(res.statusCode).toBe(401);
  });

  test("is not needed for the web app's own files", async () => {
    const res = await (
      await fixtureApp()
    ).inject({ url: "/", headers: { host: GOOD_HOST } });
    expect(res.statusCode).toBe(200);
  });

  test("is long, random and different on every launch", () => {
    const a = createLaunchToken();
    const b = createLaunchToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("a running server answers its own token on its real port", async () => {
    const server = await startServer({ port: 0, webRoot: FIXTURE_WEB });
    try {
      const ok = await fetch(`${server.url}/api/health`, {
        headers: { authorization: `Bearer ${server.token}` },
      });
      expect(ok.status).toBe(200);
      const refused = await fetch(`${server.url}/api/health`);
      expect(refused.status).toBe(401);
    } finally {
      await server.close();
    }
  });
});
