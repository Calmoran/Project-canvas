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

describe("the launch token on encoded or disguised API paths", () => {
  // Fastify undoes percent-encoding before it picks a route, so these all
  // reach (or look like) the API. Each needs the token like /api itself.
  test.each([
    "/%61pi/health",
    "/%61%70%69/health",
    "/api/%68ealth",
    "/api%2Fhealth",
    "/%2Fapi/health",
    "//api/health",
    "/API/health",
    "/%41PI/health",
  ])("refuses %s without the token", async (url) => {
    const res = await (
      await fixtureApp()
    ).inject({ url, headers: { host: GOOD_HOST } });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('"status":"ok"');
  });

  test("a path that cannot be decoded is refused before routing", async () => {
    const res = await (
      await fixtureApp()
    ).inject({ url: "/%zz/health", headers: { host: GOOD_HOST } });
    expect(res.statusCode).toBe(400);
    expect(errorOf(res.body).code).toBe("bad_request");
  });

  test("an encoded path that reaches a route works with the token", async () => {
    const res = await (
      await fixtureApp()
    ).inject({
      url: "/%61pi/health",
      headers: { host: GOOD_HOST, authorization: GOOD_AUTH },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });
});

describe("the token in the web page", () => {
  const META = `<meta name="canvas-token" content="${TOKEN}" />`;

  test.each(["/", "/index.html", "/explorer", "/explorer?node=spell:116"])(
    "%s carries this launch's token and is never cached",
    async (url) => {
      const res = await (
        await fixtureApp()
      ).inject({ url, headers: { host: GOOD_HOST } });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^text\/html/);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toContain("fixture app");
      expect(res.body).toContain(META);
    },
  );

  test.each(["/", "/index.html", "/explorer"])(
    "a wrong Host gets no page and so no token: %s",
    async (url) => {
      const res = await (
        await fixtureApp()
      ).inject({ url, headers: { host: "evil.example:4870" } });
      expect(res.statusCode).toBe(403);
      expect(res.body).not.toContain(TOKEN);
      expect(res.body).not.toContain("canvas-token");
    },
  );

  test("other files are served as they are, without the token", async () => {
    const res = await (
      await fixtureApp()
    ).inject({ url: "/assets/app.js", headers: { host: GOOD_HOST } });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(TOKEN);
  });

  test("a running server writes its own token into the page", async () => {
    const server = await startServer({ port: 0, webRoot: FIXTURE_WEB });
    try {
      const html = await (await fetch(`${server.url}/`)).text();
      const token = /<meta name="canvas-token" content="([^"]+)"/.exec(
        html,
      )?.[1];
      expect(token).toBe(server.token);
      const api = await fetch(`${server.url}/api/health`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(api.status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
