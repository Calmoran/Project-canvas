import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["@canvas/source"] },
  test: { name: "web", include: ["test/**/*.test.ts"] },
});
