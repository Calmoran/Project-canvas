import { defineConfig } from "vitest/config";

// One Vitest project per package; `pnpm test` at the root runs them all.
export default defineConfig({
  test: { projects: ["packages/*", "scripts"] },
});
