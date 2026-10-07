import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, test } from "vitest";

// Runs the repository's own ESLint config on small snippets, as if they
// were written in a web source file, to check what the config allows.

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const WEB_FILE = join(root, "packages/web/src/api/client.ts");
const VITE_CONFIG = join(root, "packages/web/vite.config.ts");

async function restrictedImports(
  code: string,
  filePath = WEB_FILE,
): Promise<string[]> {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message);
}

describe("web may import only @canvas/server/api from the server", () => {
  test("allows the API subpath", async () => {
    expect(
      await restrictedImports(
        'import type { ErrorResponse } from "@canvas/server/api";\nexport type E = ErrorResponse;\n',
      ),
    ).toEqual([]);
  });

  test.each([
    "@canvas/server",
    "@canvas/server/src/app.js",
    "@canvas/server/apix",
    "@canvas/server/api/error.js",
  ])("refuses %s", async (specifier) => {
    const messages = await restrictedImports(
      `import * as server from "${specifier}";\nexport { server };\n`,
    );
    expect(messages).toEqual([
      expect.stringContaining("only @canvas/server/api"),
    ]);
  });

  test("still refuses better-sqlite3 in web", async () => {
    const messages = await restrictedImports(
      'import Database from "better-sqlite3";\nexport { Database };\n',
    );
    expect(messages).toEqual([expect.stringContaining("Storage interface")]);
  });
});

describe("vite.config.ts, which runs only in Node, is the one exception", () => {
  test("may import @canvas/server", async () => {
    expect(
      await restrictedImports(
        'import * as server from "@canvas/server";\nexport { server };\n',
        VITE_CONFIG,
      ),
    ).toEqual([]);
  });

  test("still may not import better-sqlite3", async () => {
    const messages = await restrictedImports(
      'import Database from "better-sqlite3";\nexport { Database };\n',
      VITE_CONFIG,
    );
    expect(messages).toEqual([expect.stringContaining("Storage interface")]);
  });
});
