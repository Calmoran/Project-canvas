import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["@canvas/source"] },
  test: { name: "core", include: ["test/**/*.test.ts"] },
});
