import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["@canvas/source"] },
  test: { name: "cli", include: ["test/**/*.test.ts"] },
});
