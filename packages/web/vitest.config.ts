import { defineProject } from "vitest/config";

// Tests run in Node. Component tests opt into jsdom, a simulated browser
// page, with a `// @vitest-environment jsdom` comment at the top of the file
// (Alex's WEB-2 decision, point 2); real-browser checks are the Playwright
// smoke test's job.
export default defineProject({
  resolve: { conditions: ["@canvas/source"] },
  test: { name: "web", include: ["test/**/*.test.{ts,tsx}"] },
});
