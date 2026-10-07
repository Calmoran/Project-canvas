import { readFormat } from "./format.js";

/**
 * Reads a locale (translation) DBC file's strings the way the server does
 * when it merges a locale into a loaded file, which is more lenient than
 * `parseDbc` (all at 9d9b6049):
 *
 * - The file must load: it exists, starts with the magic word, and holds
 *   the bytes its header promises (core:src/common/DataStores/DBCFileLoader.cpp:33-112).
 *   Otherwise `LoadStringsFrom` fails and the locale is dropped for every
 *   later file (core:src/server/game/DataStores/DBCStores.cpp:234-235).
 * - If its field count differs from the format, `AutoProduceStrings` gives
 *   no strings (DBCFileLoader.cpp:278-281), yet `LoadStringsFrom` still
 *   succeeds (core:src/server/shared/DataStores/DBCStore.cpp:64-71): no strings
 *   from this file, and the locale is kept.
 * - Otherwise each record is read at the file's own record size
 *   (DBCFileLoader.cpp:125), with field positions from the format
 *   (:88-99), even when the two record sizes differ. A string is taken only
 *   when its offset lies inside the string block; the server asserts on any
 *   other (core:src/common/DataStores/DBCFileLoader.h:75), so Canvas leaves that
 *   field alone instead of crashing.
 *
 * Only the format's own `s` positions are read: the server merges nothing
 * into fields it skips.
 */
export type LocaleStrings =
  | { readonly status: "unloadable"; readonly reason: string }
  | {
      readonly status: "no-strings";
      readonly fieldCount: number;
      readonly recordCount: number;
    }
  | {
      readonly status: "strings";
      readonly recordCount: number;
      readonly recordSize: number;
      /** Per record, per format position: the string, or null where none is read. */
      readonly strings: readonly (readonly (string | null)[])[];
      /** Strings left alone because their offset lay outside the string block. */
      readonly badOffsets: number;
    };

const utf8 = new TextDecoder("utf-8", { fatal: false });

export function readLocaleStrings(
  bytes: Uint8Array,
  format: string,
): LocaleStrings {
  if (bytes.byteLength < 20) {
    return { status: "unloadable", reason: "shorter than the 20-byte header" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at: number): number => view.getUint32(at, true);
  if (u32(0) !== 0x43424457) {
    return { status: "unloadable", reason: "not a WDBC file" };
  }
  const recordCount = u32(4);
  const fieldCount = u32(8);
  const recordSize = u32(12);
  const stringSize = u32(16);
  const stringsAt = 20 + recordCount * recordSize;
  if (bytes.byteLength < stringsAt + stringSize) {
    return { status: "unloadable", reason: "shorter than its header promises" };
  }
  if (fieldCount !== format.length) {
    return { status: "no-strings", fieldCount, recordCount };
  }

  const { offsets } = readFormat(format);
  const strings: (string | null)[][] = [];
  let badOffsets = 0;
  for (let r = 0; r < recordCount; r++) {
    const row: (string | null)[] = [];
    for (let f = 0; f < format.length; f++) {
      if (format[f] !== "s") {
        row.push(null);
        continue;
      }
      const at = 20 + r * recordSize + offsets[f]!;
      // A field read past the records (a record size too small) has no
      // string; the server would read whatever bytes follow.
      if (at + 4 > stringsAt) {
        row.push(null);
        badOffsets++;
        continue;
      }
      const offset = u32(at);
      const start = stringsAt + offset;
      const end = offset < stringSize ? bytes.indexOf(0, start) : -1;
      if (end === -1 || end >= stringsAt + stringSize) {
        row.push(null);
        badOffsets++;
        continue;
      }
      row.push(utf8.decode(bytes.subarray(start, end)));
    }
    strings.push(row);
  }
  return { status: "strings", recordCount, recordSize, strings, badOffsets };
}
