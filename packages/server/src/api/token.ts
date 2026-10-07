/**
 * How the web app gets and presents this launch's token. The server writes
 * the token into the page as `<meta name="canvas-token" content="...">`; the
 * web app reads it from there and sends it on every `/api` request as
 * `Authorization: Bearer <token>`. Both sides import these names from here,
 * so renaming one cannot silently break the other.
 */

/** The meta tag name the web app reads its launch token from. */
export const TOKEN_META_NAME = "canvas-token";

/** How a request presents the token: `Authorization: Bearer <token>`. */
export const TOKEN_SCHEME = "Bearer";
