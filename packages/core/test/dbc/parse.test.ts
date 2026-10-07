import { describe, expect, test } from "vitest";
import {
  DbcFormatError,
  FORMAT_CHARS,
  LOCALES,
  asSigned32,
  parseDbc,
  readFormat,
} from "../../src/index.js";
import { buildDbc } from "./build.js";

describe("every format character", () => {
  // One field of each character the server uses, in one record.
  const format = "ndifsbxX";
  const bytes = buildDbc(format, [
    [116, 7, 0xffffffff, 1.5, "Frostbolt", 255, 0xdeadbeef, 9],
  ]);
  const parsed = parseDbc("All.dbc", bytes, format);
  const fields = parsed.records[0]!.fields;

  test("the test covers them all", () => {
    expect([...new Set(format)].sort()).toEqual([...FORMAT_CHARS].sort());
  });

  test("reads each one at its own size: 4 bytes, or 1 for b and X", () => {
    expect(parsed.recordSize).toBe(4 * 6 + 1 + 1);
    expect(readFormat(format).offsets).toEqual([0, 4, 8, 12, 16, 20, 21, 25]);
  });

  test("n, d, i and x are unsigned 32-bit integers, as the server reads them", () => {
    expect(fields[0]).toBe(116);
    expect(fields[1]).toBe(7);
    expect(fields[2]).toBe(0xffffffff);
    expect(fields[6]).toBe(0xdeadbeef);
  });

  test("f is a 32-bit float, s a string, b and X single bytes", () => {
    expect(fields[3]).toBe(1.5);
    expect(fields[4]).toBe("Frostbolt");
    expect(fields[5]).toBe(255);
    expect(fields[7]).toBe(9);
  });

  test("asSigned32 reads an unsigned field as the signed value it encodes", () => {
    expect(asSigned32(0xffffffff)).toBe(-1);
    expect(asSigned32(116)).toBe(116);
  });

  test("a float keeps its 32-bit value", () => {
    const p = parseDbc("F.dbc", buildDbc("f", [[0.1]]), "f");
    expect(p.records[0]!.fields[0]).toBe(Math.fround(0.1));
  });

  test("'l' is refused, as the server refuses it", () => {
    expect(() => readFormat("nl")).toThrow(/'l' at position 1 is never valid/);
    expect(() => readFormat("nq")).toThrow(/Unknown format character 'q'/);
    expect(() => readFormat("")).toThrow(/empty/);
  });
});

describe("record IDs", () => {
  test("come from the n field", () => {
    const p = parseDbc(
      "A.dbc",
      buildDbc("in", [
        [5, 116],
        [6, 133],
      ]),
      "in",
    );
    expect(p.records.map((r) => r.id)).toEqual([116, 133]);
  });

  test("come from a d field too, which the server uses only for indexing", () => {
    const p = parseDbc("A.dbc", buildDbc("di", [[42, 1]]), "di");
    expect(p.records[0]!.id).toBe(42);
  });

  test("are the record's position when the layout has no ID field", () => {
    const p = parseDbc(
      "A.dbc",
      buildDbc("ii", [
        [1, 2],
        [3, 4],
      ]),
      "ii",
    );
    expect(p.records.map((r) => r.id)).toEqual([0, 1]);
  });
});

describe("the string block", () => {
  test("can be empty when the layout has no strings", () => {
    const p = parseDbc(
      "NoStrings.dbc",
      buildDbc("ni", [[1, 2]], { noStringBlock: true }),
      "ni",
    );
    expect(p.stringSize).toBe(0);
    expect(p.records[0]!.fields).toEqual([1, 2]);
  });

  test("an empty block with a string field is refused, since the offset can point nowhere", () => {
    expect(() =>
      parseDbc(
        "Bad.dbc",
        buildDbc("ns", [[1, 0]], { noStringBlock: true }),
        "ns",
      ),
    ).toThrow(
      /Bad\.dbc: record 0 field 1: string offset 0 is outside the 0-byte string block/,
    );
  });

  test("offset 0 is the empty string, and repeated strings share one entry", () => {
    const p = parseDbc(
      "S.dbc",
      buildDbc("nss", [
        [1, "", "a"],
        [2, "a", ""],
      ]),
      "nss",
    );
    expect(p.records.map((r) => r.fields.slice(1))).toEqual([
      ["", "a"],
      ["a", ""],
    ]);
  });

  test("decodes UTF-8 text", () => {
    const p = parseDbc("U.dbc", buildDbc("s", [["Éclair de givre"]]), "s");
    expect(p.records[0]!.fields[0]).toBe("Éclair de givre");
  });

  test("a string with no terminating NUL is refused", () => {
    const bytes = buildDbc("s", [[0]], {
      stringBlock: new TextEncoder().encode("abc"),
    });
    expect(() => parseDbc("N.dbc", bytes, "s")).toThrow(/no terminating NUL/);
  });
});

describe("localized strings", () => {
  const format = "n" + "s".repeat(16) + "x" + "i";
  const slots = Array.from({ length: 16 }, (_, i) => `slot ${i}`);
  const bytes = buildDbc(format, [[116, ...slots, 0x00ff, 7]]);
  const record = parseDbc("Spell.dbc", bytes, format).records[0]!;

  test("are 16 slots and a flags field, found by that shape", () => {
    expect(readFormat(format).localized).toEqual([1]);
    expect(record.localized).toHaveLength(1);
    expect(record.localized[0]!.field).toBe(1);
    expect(record.localized[0]!.flags).toBe(0x00ff);
  });

  test("name slots by the server's locale order, enUS first", () => {
    const text = record.localized[0]!;
    expect(LOCALES).toEqual([
      "enUS",
      "koKR",
      "frFR",
      "deDE",
      "zhCN",
      "zhTW",
      "esES",
      "esMX",
      "ruRU",
    ]);
    expect(text.enUS).toBe("slot 0");
    expect(text.koKR).toBe("slot 1");
    expect(text.ruRU).toBe("slot 8");
    expect(text.unnamed).toEqual(slots.slice(9));
  });

  test("keep every slot in the positional fields too", () => {
    expect(record.fields.slice(1, 17)).toEqual(slots);
    expect(record.fields[18]).toBe(7);
  });

  test("other string runs are not taken for localized strings", () => {
    expect(readFormat("ssssx").localized).toEqual([]);
    expect(readFormat("s".repeat(17) + "x").localized).toEqual([]);
    expect(readFormat("s".repeat(16) + "i").localized).toEqual([]);
  });

  test("find both of Spell.dbc's localized strings in the server's own format string", () => {
    // core:src/server/shared/DataStores/DBCfmt.h:108 at 9d9b6049, verbatim.
    const spell =
      "niiiiiiiiiiiixixiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiifxiiiiiiiiiiiiiiiiiiiiiiiiiiiifffiiiiiiiiiiiiiiiiiiiiifffiiiiiiiiiiiiiiifffiiiiiiiiiiiiiissssssssssssssssxssssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxiiiiiiiiiiixfffxxxiiiiixxfffxx";
    const layout = readFormat(spell);
    expect(spell).toHaveLength(234);
    expect(layout.recordSize).toBe(936);
    expect(layout.idField).toBe(0);
    // SpellName at 136-151 with flags at 152 (code research 1.4), then Rank.
    expect(layout.localized).toEqual([136, 153]);
  });
});

describe("files that do not match their layout", () => {
  test("a record size that disagrees is refused, naming the file and both sizes", () => {
    const bytes = buildDbc("ni", [[1, 2]], { header: { recordSize: 12 } });
    expect(() => parseDbc("Spell.dbc", bytes, "ni")).toThrow(
      "Spell.dbc: the file's record size is 12 bytes but the layout's is 8",
    );
  });

  test("a field count that disagrees is refused, as the server refuses it", () => {
    const bytes = buildDbc("ni", [[1, 2]]);
    expect(() => parseDbc("Spell.dbc", bytes, "nii")).toThrow(
      "Spell.dbc: the file has 2 fields but the layout has 3",
    );
  });

  test("a file that is not WDBC is refused", () => {
    const bytes = buildDbc("n", [[1]], { header: { magic: 0x31424457 } });
    expect(() => parseDbc("X.dbc", bytes, "n")).toThrow(/not a WDBC file/);
  });

  test("a file cut short is refused", () => {
    const bytes = buildDbc("ni", [
      [1, 2],
      [3, 4],
    ]);
    expect(() =>
      parseDbc("Cut.dbc", bytes.subarray(0, bytes.length - 3), "ni"),
    ).toThrow(/Cut\.dbc: the header promises \d+ bytes but the file has \d+/);
    expect(() => parseDbc("Tiny.dbc", new Uint8Array(8), "n")).toThrow(
      /shorter than the 20-byte header/,
    );
  });

  test("every refusal is a DbcFormatError", () => {
    const bytes = buildDbc("n", [[1]], { header: { magic: 0 } });
    expect(() => parseDbc("X.dbc", bytes, "n")).toThrow(DbcFormatError);
  });
});

test("reads a file with no records", () => {
  const p = parseDbc("Empty.dbc", buildDbc("ns", []), "ns");
  expect(p.recordCount).toBe(0);
  expect(p.records).toEqual([]);
});

test("reads bytes that are a slice of a larger buffer", () => {
  const inner = buildDbc("ni", [[116, 5]]);
  const outer = new Uint8Array(inner.length + 10);
  outer.set(inner, 7);
  const p = parseDbc("Slice.dbc", outer.subarray(7, 7 + inner.length), "ni");
  expect(p.records[0]!.fields).toEqual([116, 5]);
});
