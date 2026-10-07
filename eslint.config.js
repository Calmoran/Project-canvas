// ESLint finds likely bugs; Prettier owns layout. eslint-config-prettier
// (last) turns off every ESLint rule that would argue with Prettier.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  js.configs.recommended,
  // Type-aware rules read the TypeScript types, so they catch bugs such as
  // a promise that is never awaited, which matters in async scan code.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // better-sqlite3 stays behind the Storage interface so `node:sqlite`
    // can replace it later (architecture section 7).
    files: ["**/*.ts"],
    ignores: ["packages/core/src/storage/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message:
                "Only packages/core/src/storage may import better-sqlite3; use the Storage interface.",
            },
          ],
        },
      ],
    },
  },
  {
    // The web app runs in the browser, so from the server package it may
    // use only the API contract (`@canvas/server/api`), which holds no
    // Fastify or Node code. This block repeats the better-sqlite3 entry
    // because a later block's rule replaces an earlier one for these files.
    files: ["packages/web/**/*.ts", "packages/web/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message:
                "Only packages/core/src/storage may import better-sqlite3; use the Storage interface.",
            },
          ],
          patterns: [
            {
              regex: "^@canvas/server(?!/api$)(/.*)?$",
              message:
                "The web app may import only @canvas/server/api from the server package.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/test/**/*.ts", "scripts/**/*.ts"],
    rules: {
      // Tests assert on known fixtures; a non-null assertion there is a
      // statement about the fixture, not an unchecked guess.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  prettier,
);
