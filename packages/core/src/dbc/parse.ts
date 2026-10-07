import {
  LOCALES,
  LOCALIZED_SLOTS,
  readFormat,
  type FormatChar,
  type Locale,
} from "./format.js";

/**
 * A WDBC file reader: the client data file format the 3.3.5a server loads
 * (Spell.dbc and the rest). All numbers are little-endian. The layout, as
 * the server reads it (core:src/common/DataStores/DBCFileLoader.cpp):
 *
 * - a 20-byte header of five uint32: the magic "WDBC" (:47), recordCount
 *   (:53), fieldCount (:61), recordSize (:69), stringSize (:77);
 * - `recordCount` records of `recordSize` bytes each;
 * - then `stringSize` bytes of string block (:101-102). A string field holds
 *   a byte offset into that block, where a NUL-terminated string starts
 *   (core:src/common/DataStores/DBCFileLoader.h:71-77).
 */

const MAGIC = 0x43424457; // "WDBC" read as a little-endian uint32
const HEADER_SIZE = 20;

/**
 * One field's value. Integers are read unsigned, as the server reads them
 * (decided by Alex); a field the profile marks as signed is reinterpreted
 * with `asSigned32`.
 */
export type DbcValue = number | string;

/**
 * A localized string: 16 slots, one per locale, then a flags field. Slots
 * are named by the server's locale order (enUS is slot 0), not by the
 * world-DB override tables' column names, which use a different order
 * (code research 1.4). Slots 9-15 have no locale in the server.
 */
export type LocalizedString = {
  readonly [L in Locale]: string;
} & {
  /** Format position of the first slot. */
  readonly field: number;
  /** Slots 9 to 15, which the server never reads. */
  readonly unnamed: readonly string[];
  /** The 17th field: the server skips it (`x`). */
  readonly flags: number;
};

export interface DbcRecord {
  /** The value of the layout's `n` or `d` field, or the record's position if it has none. */
  readonly id: number;
  /** Every field by format position, skipped ones included. */
  readonly fields: readonly DbcValue[];
  /** A named view of each localized string, in format order. */
  readonly localized: readonly LocalizedString[];
}

export interface DbcFile {
  readonly file: string;
  readonly recordCount: number;
  readonly fieldCount: number;
  readonly recordSize: number;
  readonly stringSize: number;
  readonly records: readonly DbcRecord[];
}

/** Thrown for a file that cannot be read with the given layout. */
export class DbcFormatError extends Error {
  override readonly name = "DbcFormatError";
}

// Text is UTF-8; bytes that are not valid UTF-8 become the replacement
// character U+FFFD rather than failing the file (decided by Alex).
const utf8 = new TextDecoder("utf-8", { fatal: false });

/**
 * Reads a DBC file's bytes with a layout's format string. `file` is used
 * only in error messages, so a failure says which file it was.
 */
export function parseDbc(
  file: string,
  bytes: Uint8Array,
  format: string,
): DbcFile {
  const layout = readFormat(format);
  const fail = (message: string): never => {
    throw new DbcFormatError(`${file}: ${message}`);
  };

  if (bytes.byteLength < HEADER_SIZE) {
    fail(`${bytes.byteLength} bytes is shorter than the 20-byte header`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at: number): number => view.getUint32(at, true);

  if (u32(0) !== MAGIC) {
    fail(`not a WDBC file (magic 0x${u32(0).toString(16).padStart(8, "0")})`);
  }
  const recordCount = u32(4);
  const fieldCount = u32(8);
  const recordSize = u32(12);
  const stringSize = u32(16);

  // The server refuses a format whose length differs from the file's field
  // count (core:src/common/DataStores/DBCFileLoader.cpp:190-193).
  if (fieldCount !== format.length) {
    fail(
      `the file has ${fieldCount} fields but the layout has ${format.length}`,
    );
  }
  // The server does not check this, but a disagreement means the layout
  // would read every field after the first mismatch from the wrong place.
  if (recordSize !== layout.recordSize) {
    fail(
      `the file's record size is ${recordSize} bytes but the layout's is ${layout.recordSize}`,
    );
  }
  const stringsAt = HEADER_SIZE + recordCount * recordSize;
  const needed = stringsAt + stringSize;
  if (bytes.byteLength < needed) {
    fail(
      `the header promises ${needed} bytes but the file has ${bytes.byteLength}`,
    );
  }

  const readString = (
    offset: number,
    record: number,
    field: number,
  ): string => {
    // The server asserts that the offset is inside the block
    // (core:src/common/DataStores/DBCFileLoader.h:75).
    if (offset >= stringSize) {
      fail(
        `record ${record} field ${field}: string offset ${offset} is outside the ${stringSize}-byte string block`,
      );
    }
    const start = stringsAt + offset;
    const end = bytes.indexOf(0, start);
    if (end === -1 || end >= needed) {
      fail(`record ${record} field ${field}: string has no terminating NUL`);
    }
    return utf8.decode(bytes.subarray(start, end));
  };

  const records: DbcRecord[] = [];
  for (let r = 0; r < recordCount; r++) {
    const base = HEADER_SIZE + r * recordSize;
    const fields: DbcValue[] = [];
    for (let f = 0; f < fieldCount; f++) {
      const at = base + layout.offsets[f]!;
      switch (format[f] as FormatChar) {
        case "f":
          fields.push(view.getFloat32(at, true));
          break;
        case "s":
          fields.push(readString(u32(at), r, f));
          break;
        case "b":
        case "X":
          fields.push(view.getUint8(at));
          break;
        default: // n, d, i, x: 4-byte unsigned integers
          fields.push(u32(at));
      }
    }
    records.push({
      id: layout.idField >= 0 ? (fields[layout.idField] as number) : r,
      fields,
      localized: layout.localized.map((start) => localizedAt(fields, start)),
    });
  }

  return { file, recordCount, fieldCount, recordSize, stringSize, records };
}

function localizedAt(
  fields: readonly DbcValue[],
  start: number,
): LocalizedString {
  const slots = fields.slice(start, start + LOCALIZED_SLOTS) as string[];
  const named = Object.fromEntries(
    LOCALES.map((locale, slot) => [locale, slots[slot]!]),
  ) as { [L in Locale]: string };
  return {
    ...named,
    field: start,
    unnamed: slots.slice(LOCALES.length),
    flags: fields[start + LOCALIZED_SLOTS] as number,
  };
}

/** Reads an unsigned 32-bit field value as the signed number it encodes. */
export function asSigned32(value: number): number {
  return value | 0;
}
