import { readFileSync } from "node:fs";

/** The server package's version, as published in its package.json. */
export const SERVER_VERSION: string = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;
