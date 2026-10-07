import { describe, expect, test } from "vitest";
import { readLocaleStrings } from "../../src/index.js";
import { buildDbc } from "./build.js";

describe("readLocaleStrings, as the server merges a locale file", () => {
  test("reads the format's string fields by record", () => {
    const r = readLocaleStrings(
      buildDbc("nsi", [
        [1, "Eins", 5],
        [2, "Zwei", 6],
      ]),
      "nsi",
    );
    expect(r).toEqual({
      status: "strings",
      recordCount: 2,
      recordSize: 12,
      strings: [
        [null, "Eins", null],
        [null, "Zwei", null],
      ],
      badOffsets: 0,
    });
  });

  test("reads only the format's own s fields, never a skipped one", () => {
    const r = readLocaleStrings(buildDbc("ns", [[1, "skipped"]]), "nx");
    expect(r.status === "strings" && r.strings).toEqual([[null, null]]);
  });

  test("a file that would not load is unloadable", () => {
    expect(readLocaleStrings(new Uint8Array(8), "n").status).toBe("unloadable");
    expect(
      readLocaleStrings(buildDbc("n", [[1]], { header: { magic: 1 } }), "n")
        .status,
    ).toBe("unloadable");
    const full = buildDbc("ns", [[1, "x"]]);
    expect(
      readLocaleStrings(full.subarray(0, full.length - 1), "ns").status,
    ).toBe("unloadable");
  });

  test("another field count gives no strings, but the file still loads", () => {
    expect(readLocaleStrings(buildDbc("nsi", [[1, "x", 2]]), "ns")).toEqual({
      status: "no-strings",
      fieldCount: 3,
      recordCount: 1,
    });
  });

  test("another record size is read at the file's own size, bad offsets left alone", () => {
    // Records of "bs" are 5 bytes; read as "ns", the string sits 4 bytes in,
    // which overlaps the next bytes: an offset the server would assert on.
    const r = readLocaleStrings(
      buildDbc("bs", [
        [1, "A"],
        [2, "B"],
      ]),
      "ns",
    );
    expect(r.status).toBe("strings");
    if (r.status !== "strings") return;
    expect(r.recordSize).toBe(5);
    expect(r.strings).toHaveLength(2);
    expect(r.badOffsets).toBeGreaterThan(0);
  });
});
