import { defineProject } from "vitest/config";

export default defineProject({
  resolve: { conditions: ["@canvas/source"] },
  test: { name: "profiles", include: ["test/**/*.test.ts"] },
});
