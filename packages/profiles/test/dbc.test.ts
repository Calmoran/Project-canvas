import { describe, expect, test } from "vitest";
import { azerothcore335 } from "../src/index.js";

/**
 * The format characters the server's loader understands
 * (`DBCFileLoader.h:25-36`). `l` (logical) exists in the enum but is never
 * valid in a file; it appears in no format string.
 */
const KNOWN_FORMAT_CHARS = new Set(["n", "d", "i", "f", "s", "b", "x", "X"]);

describe("azerothcore335 dbc", () => {
  test("has one layout per active LOAD_DBC call (110)", () => {
    expect(azerothcore335.dbc).toHaveLength(110);
  });

  test("every format string contains only known format characters", () => {
    for (const layout of azerothcore335.dbc) {
      for (const char of layout.format) {
        expect(
          KNOWN_FORMAT_CHARS.has(char),
          `${layout.file}: unknown format character '${char}'`,
        ).toBe(true);
      }
    }
  });
});
