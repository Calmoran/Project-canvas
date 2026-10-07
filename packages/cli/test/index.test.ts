import { expect, test } from "vitest";
import { packageName } from "../src/index.js";

test("the package entry point loads", () => {
  expect(packageName).toBe("@canvas/cli");
});
