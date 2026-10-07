/**
 * How Vite builds and serves the web app.
 *
 * `vite build` writes the production app into the server package's
 * `public/` folder, which the Canvas server serves (architecture section 8;
 * the folder is git-ignored). `vite` (development) serves the app with
 * instant reload, backed by a real Canvas server started by the plugin
 * below.
 *
 * This is the one web file allowed to import `@canvas/server` itself, not
 * only `@canvas/server/api` (Alex's WEB-2 decision, point 6): it runs in
 * Node while developing and never reaches the browser.
 */
import { fileURLToPath } from "node:url";
import { startServer, type RunningServer } from "@canvas/server";
import { TOKEN_META_NAME } from "@canvas/server/api";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig, type Plugin } from "vite";

const SERVER_PUBLIC = fileURLToPath(
  new URL("../server/public/", import.meta.url),
);

/**
 * Development only. A page served by Vite carries no launch token, and the
 * API refuses requests without one. So this starts a Canvas server in the
 * same process on a free port, writes that server's token into the page the
 * way the server itself does, and forwards `/api` requests to it. The token
 * rules stay exactly as in production.
 */
function canvasDevServer(): Plugin {
  let server: RunningServer | undefined;
  return {
    name: "canvas-dev-server",
    apply: (_config, env) => env.command === "serve" && env.isPreview !== true,
    async config() {
      server = await startServer({ port: 0 });
      // `changeOrigin` sends the server's own address as the Host header,
      // which its DNS-rebinding check requires.
      return {
        server: {
          proxy: { "/api": { target: server.url, changeOrigin: true } },
        },
      };
    },
    configureServer(vite) {
      vite.httpServer?.once("close", () => void server?.close());
    },
    transformIndexHtml() {
      if (server === undefined) return [];
      return [
        {
          tag: "meta",
          attrs: { name: TOKEN_META_NAME, content: server.token },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), canvasDevServer()],
  // Read the server's API contract from its TypeScript source, so a change
  // there shows up without rebuilding the server package first.
  resolve: { conditions: ["@canvas/source", ...defaultClientConditions] },
  // The layout worker imports ELK's engine on demand, so workers are ES
  // modules, like the page.
  worker: { format: "es" },
  build: {
    outDir: SERVER_PUBLIC,
    // The folder is outside this package, so Vite asks before emptying it.
    emptyOutDir: true,
  },
});
