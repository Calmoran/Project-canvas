import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyReply } from "fastify";
import { TOKEN_META_NAME } from "./api/token.js";

/** Escapes text for use inside a double-quoted HTML attribute. */
function escapeAttribute(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Returns the web app's index.html with this launch's token written into
 * `<head>` as `<meta name="canvas-token" content="...">`, which the web app
 * reads when it starts (Alex's decision on token delivery, option a).
 * Only a page served from this server can read it: the browser keeps other
 * sites' pages out, and the Host check refuses rebinding tricks.
 */
export function withToken(html: string, token: string): string {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head === null) {
    throw new Error("The web build's index.html has no <head> element.");
  }
  const at = head.index + head[0].length;
  const meta = `<meta name="${TOKEN_META_NAME}" content="${escapeAttribute(token)}" />`;
  return html.slice(0, at) + meta + html.slice(at);
}

/**
 * Sends index.html with the token. The file is read on every request, so a
 * rebuilt web app shows up without a restart. `no-store` stops the browser
 * from keeping a copy, so a reload after a restart gets the new launch's
 * token instead of the old one.
 */
export async function sendPage(
  reply: FastifyReply,
  webRoot: string,
  token: string,
): Promise<FastifyReply> {
  const html = await readFile(join(webRoot, "index.html"), "utf8");
  return reply
    .header("cache-control", "no-store")
    .type("text/html; charset=utf-8")
    .send(withToken(html, token));
}
