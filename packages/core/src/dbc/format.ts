/**
 * What a DBC format string says about a file's layout. A format string has
 * one character per field (e.g. Spell.dbc's "niiii...") and is the server's
 * own description of the file; it is the source of truth for layout, not
 * the struct comments (code research 1.1, 1.2).
 *
 * Format characters, as the server defines them
 * (core:src/common/DataStores/DBCFileLoader.h:25-36):
 * - `n` the record's ID, 4 bytes, kept;   `d` the ID, 4 bytes, not kept
 * - `i` integer, 4 bytes;                 `f` float, 4 bytes
 * - `s` string: 4-byte offset into the string block
 * - `b` byte, 1 byte;                     `x` / `X` skipped, 4 / 1 bytes
 * - `l` never valid: the server asserts on it
 *   (core:src/common/DataStores/DBCFileLoader.cpp:159-161)
 *
 * "Skipped" means the server does not copy the field into its struct.
 * Canvas still reads it from the file, because a skipped field can still
 * hold data worth showing.
 */

export type FormatChar = "n" | "d" | "i" | "f" | "s" | "b" | "x" | "X";

export const FORMAT_CHARS: readonly FormatChar[] = [
  "n",
  "d",
  "i",
  "f",
  "s",
  "b",
  "x",
  "X",
];

/**
 * The server's locale slots, in order (core:src/common/Common.h:124-137).
 * A localized string has 16 slots; the server names and reads only these 9.
 */
export const LOCALES = [
  "enUS",
  "koKR",
  "frFR",
  "deDE",
  "zhCN",
  "zhTW",
  "esES",
  "esMX",
  "ruRU",
] as const;
export type Locale = (typeof LOCALES)[number];

/** Slots per localized string, then one 4-byte flags field (code research 1.4). */
export const LOCALIZED_SLOTS = 16;

export interface FormatLayout {
  readonly format: string;
  /** Byte offset of each field within a record. */
  readonly offsets: readonly number[];
  /** Bytes per record in the file. */
  readonly recordSize: number;
  /** The `n` or `d` field that holds each record's ID, or -1 if none. */
  readonly idField: number;
  /** First field of each localized string (16 `s` slots, then the flags `x`). */
  readonly localized: readonly number[];
}

/** Bytes a field occupies in the file: 1 for `b` and `X`, 4 for the rest. */
export function fieldSize(c: FormatChar): 1 | 4 {
  return c === "b" || c === "X" ? 1 : 4;
}

/**
 * Reads a format string. Field offsets add up field sizes in order, as the
 * server does (core:src/common/DataStores/DBCFileLoader.cpp:88-99). A
 * localized string is recognised by its shape: exactly 16 `s` fields
 * followed by an `x`. Every localized string in the server's format strings
 * has that shape, and nothing else does (checked against
 * core:src/server/shared/DataStores/DBCfmt.h, see the CORE-2 pull request).
 */
export function readFormat(format: string): FormatLayout {
  if (format.length === 0) throw new Error("A DBC format string is empty");
  const offsets: number[] = [];
  let size = 0;
  let idField = -1;
  for (let i = 0; i < format.length; i++) {
    const c = format[i]!;
    if (c === "l") {
      throw new Error(
        `Format character 'l' at position ${i} is never valid; the server refuses it`,
      );
    }
    if (!(FORMAT_CHARS as readonly string[]).includes(c)) {
      throw new Error(`Unknown format character '${c}' at position ${i}`);
    }
    offsets.push(size);
    size += fieldSize(c as FormatChar);
    // The server indexes by the last `n` or `d` it sees
    // (core:src/common/DataStores/DBCFileLoader.cpp:146-152).
    if (c === "n" || c === "d") idField = i;
  }

  const localized: number[] = [];
  const pattern = new RegExp(`(?<!s)s{${LOCALIZED_SLOTS}}x`, "g");
  for (const m of format.matchAll(pattern)) localized.push(m.index);

  return { format, offsets, recordSize: size, idField, localized };
}
