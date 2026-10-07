// The development server (vite.config.ts): the page Vite serves carries a
// launch token, and /api requests forwarded with it reach a real Canvas
// server, which still refuses requests without it.
import { fileURLToPath } from "node:url";
import { TOKEN_META_NAME } from "@canvas/server/api";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";

let vite: ViteDevServer;
let base: string;

beforeAll(async () => {
  vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "silent",
  });
  await vite.listen();
  const address = vite.httpServer!.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Vite is not listening on a port.");
  }
  base = `http://127.0.0.1:${address.port}`;
}, 60_000);

afterAll(async () => {
  await vite?.close();
});

test("the page carries a launch token and the token opens the API", async () => {
  const html = await (await fetch(`${base}/`)).text();
  const token = new RegExp(
    `<meta name="${TOKEN_META_NAME}" content="([^"]+)"`,
  ).exec(html)?.[1];
  expect(token).toBeTruthy();

  const withToken = await fetch(`${base}/api/health`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(withToken.status).toBe(200);
  expect(await withToken.json()).toMatchObject({ status: "ok" });
});

test("API requests without the token are still refused", async () => {
  const response = await fetch(`${base}/api/health`);
  expect(response.status).toBe(401);
});
