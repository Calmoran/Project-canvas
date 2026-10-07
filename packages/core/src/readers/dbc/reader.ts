import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCALES, LOCALIZED_SLOTS, readFormat } from "../../dbc/format.js";
import { readLocaleStrings } from "../../dbc/locale.js";
import { asSigned32, parseDbc, type DbcValue } from "../../dbc/parse.js";
import { CORE_RULES } from "../../model/finding.js";
import { nodeId } from "../../model/ids.js";
import type { Attrs, JsonValue } from "../../model/json.js";
import type { DbcLayout } from "../../profile/index.js";
import type { NodeOrEdge, ReadPlan, Reader } from "../../reader/index.js";
import { labelOf } from "../mysql/reader.js";

export interface DbcReaderConfig {
  /** The server's DBC folder: the files, plus a `<locale>/` folder per client locale. */
  readonly folder: string;
}

/**
 * The DBC reader (architecture section 4). For each layout in the profile
 * whose file is in the DBC folder, it emits a `dbc_file` node and one
 * `dbc_record` node per record (key `<file>/<id>`), with the record's fields
 * named from the layout where names exist.
 *
 * Locale variants are merged exactly as the server merges them (decided by
 * Alex), all read at 9d9b6049:
 * - every locale starts available (core:src/server/game/DataStores/DBCStores.cpp:268);
 * - after a base file, `<locale>/<file>` is read for each available locale in
 *   the server's order (:224-236), and each of its strings fills only a
 *   string field still empty, matched by record position whatever the two
 *   files' record counts (core:src/common/DataStores/DBCFileLoader.cpp:306-312);
 * - a locale whose file is missing, or would not load (not WDBC, or shorter
 *   than its header promises), is dropped for every later file
 *   (DBCStores.cpp:235), in the profile's load order; a file with another
 *   field count gives no strings but keeps its locale, and one with another
 *   record count or record size still merges by position (see
 *   readLocaleStrings, which cites each step).
 * A record ID that appears twice in one file keeps its last record, as the
 * server's index does (DBCFileLoader.cpp:231).
 *
 * A file that is missing is marked `missing` in the read plan and reported
 * in progress, and the rest is still read: Canvas, unlike the server, shows
 * what it can. Each file's fingerprint (a hash of the base file and every
 * locale file merged into it) is recorded for incremental scans.
 *
 * Field metadata from the layout (architecture section 5, `FieldDef`): a
 * field marked `signed` is reinterpreted as a signed number, and a field
 * the server skips (`x`) but marked `readAs` is read as text: one string, or
 * a whole localized string. Locale files never fill those, as the server
 * merges nothing into fields it skips.
 */
export const dbcReader: Reader<DbcReaderConfig> = {
  id: "dbc",

  plan(config, profile): ReadPlan {
    const files = folderIndex(config.folder);
    return {
      reader: "dbc",
      items: profile.dbc.map((layout) => {
        const actual = files.get(layout.file.toLowerCase());
        if (actual === undefined) {
          return {
            id: layout.file,
            label: layout.file,
            total: null,
            status: "missing" as const,
          };
        }
        return {
          id: layout.file,
          label: layout.file,
          total: headerRecordCount(join(config.folder, actual)),
        };
      }),
    };
  },

  async *read(ctx): AsyncGenerator<NodeOrEdge> {
    const folder = ctx.config.folder;
    const files = folderIndex(folder);
    const locales = LOCALES.map((locale) => {
      const dir = files.get(locale.toLowerCase());
      const path = dir === undefined ? undefined : join(folder, dir);
      return {
        locale,
        dir: path,
        files:
          path !== undefined && statSync(path).isDirectory()
            ? folderIndex(path)
            : new Map<string, string>(),
      };
    });
    // Every locale starts available and is dropped at its first failure.
    const available = new Set<string>(LOCALES);

    for (const layout of ctx.profile.dbc) {
      if (ctx.signal.aborted) throw new Error("The scan was cancelled");
      const actual = files.get(layout.file.toLowerCase());
      if (actual === undefined) {
        // The server tries no locale for a base file it could not load.
        ctx.progress({ item: layout.file, done: 0, total: 0 });
        continue;
      }
      const base = await readFile(join(folder, actual));

      const variants: { locale: string; bytes: Uint8Array }[] = [];
      for (const l of locales) {
        if (!available.has(l.locale)) continue;
        const name = l.files.get(layout.file.toLowerCase());
        const bytes =
          name === undefined || l.dir === undefined
            ? undefined
            : await readFile(join(l.dir, name));
        // Dropped only when the file would not load on the server: missing,
        // not WDBC, or shorter than its header promises (see readLocaleStrings).
        if (bytes === undefined || !loads(bytes)) {
          available.delete(l.locale);
          // Most locales have no folder at all; only a locale that has one
          // is missing a real translation file, so only that is reported.
          if (l.dir !== undefined) {
            ctx.progress({
              item: `${l.locale}/${layout.file}`,
              done: 0,
              total: 0,
            });
          }
          continue;
        }
        variants.push({ locale: l.locale, bytes });
      }

      const input = layout.file;
      const fingerprint = fingerprintOf(base, variants);
      ctx.recordInput(input, fingerprint);
      if (ctx.previousFingerprint("dbc", input) === fingerprint) {
        yield { type: "reuse", input };
        continue;
      }

      // Fields marked readAs are read as text: an `x` read as `s`.
      const format = effectiveFormat(layout);
      const parsed = parseDbc(layout.file, base, format);
      const records = parsed.records.map((r) => [...r.fields]);
      const merged: string[] = [];
      const localeItems: NodeOrEdge[] = [];
      for (const variant of variants) {
        // The server's own format, not the readAs one: it merges nothing
        // into fields it skips.
        const localized = readLocaleStrings(variant.bytes, layout.format);
        // Each translation file merged is its own dbc_file node, so a
        // finding can name it.
        const localeFile = `${variant.locale}/${layout.file}`;
        localeItems.push({
          type: "node",
          input,
          node: {
            id: nodeId("dbc_file", localeFile),
            kind: "dbc_file",
            label: localeFile,
            attrs: {
              file: localeFile,
              locale: variant.locale,
              translates: layout.file,
              records:
                localized.status === "unloadable" ? 0 : localized.recordCount,
            },
            origin: { source: "dbc", file: localeFile },
          },
        });
        // Does it line up with the base file? A different field count gives
        // no strings at all; a different record count or record size still
        // merges by position; a string at a bad offset is left alone.
        const linesUp =
          localized.status === "strings" &&
          localized.recordCount === parsed.recordCount &&
          localized.recordSize === parsed.recordSize &&
          localized.badOffsets === 0;
        if (!linesUp) {
          ctx.progress({
            item: localeFile,
            done:
              localized.status === "strings"
                ? Math.min(localized.recordCount, parsed.recordCount)
                : 0,
            total: parsed.recordCount,
          });
          localeItems.push({
            type: "finding",
            input,
            finding: {
              kind: "mismatch",
              expected: null,
              node: nodeId("dbc_file", localeFile),
              related: [nodeId("dbc_file", layout.file)],
              rule: CORE_RULES.localeMismatch,
            },
          });
        }
        if (localized.status === "strings") {
          fillEmptyStrings(layout.format, records, localized.strings);
        }
        merged.push(variant.locale);
      }

      yield {
        type: "node",
        input,
        node: {
          id: nodeId("dbc_file", layout.file),
          kind: "dbc_file",
          label: layout.file,
          attrs: {
            file: layout.file,
            records: parsed.recordCount,
            fields: parsed.fieldCount,
            verified: layout.verified,
            locales: merged,
          },
          origin: { source: "dbc", file: layout.file },
        },
      };
      yield* localeItems;

      // A record ID that appears twice keeps its last record, as the
      // server's index does, plus one duplicate finding per such ID.
      const lastById = new Map<number, number>();
      const repeated = new Set<number>();
      parsed.records.forEach((r, position) => {
        if (lastById.has(r.id)) repeated.add(r.id);
        lastById.delete(r.id);
        lastById.set(r.id, position);
      });
      const view = recordView({ format, fields: layout.fields });
      for (const [id, r] of lastById) {
        const fields = records[r]!;
        const key = `${layout.file}/${id}`;
        const attrs = view(fields);
        yield {
          type: "node",
          input,
          node: {
            id: nodeId("dbc_record", key),
            kind: "dbc_record",
            label: labelOf("dbc_record", attrs, key, ctx.profile.labels),
            attrs,
            origin: { source: "dbc", file: layout.file, recordId: id },
          },
        };
      }
      for (const id of repeated) {
        yield {
          type: "finding",
          input,
          finding: {
            kind: "duplicate",
            expected: null,
            node: nodeId("dbc_record", `${layout.file}/${id}`),
            related: [nodeId("dbc_file", layout.file)],
            rule: CORE_RULES.duplicateRecord,
          },
        };
      }
      ctx.progress({
        item: layout.file,
        done: lastById.size,
        total: lastById.size,
      });
    }
  },
};

/** File and folder names in a folder, by lower-case name (DBC names vary in case). */
function folderIndex(folder: string): Map<string, string> {
  if (!existsSync(folder)) return new Map();
  return new Map(readdirSync(folder).map((name) => [name.toLowerCase(), name]));
}

/** The record count from a DBC header, or null when the file is too short to say. */
function headerRecordCount(path: string): number | null {
  // Only the 20-byte header is read, not the whole file.
  const header = Buffer.alloc(20);
  const fd = openSync(path, "r");
  try {
    if (readSync(fd, header, 0, 20, 0) < 20) return null;
  } finally {
    closeSync(fd);
  }
  return header.readUInt32LE(4);
}

function fingerprintOf(
  base: Uint8Array,
  variants: readonly { locale: string; bytes: Uint8Array }[],
): string {
  const hash = createHash("sha256").update(base);
  for (const v of variants) hash.update(`\0${v.locale}\0`).update(v.bytes);
  return `sha256=${hash.digest("hex")}`;
}

/** Whether the server would load a locale file at all (see readLocaleStrings). */
function loads(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 20) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at: number): number => view.getUint32(at, true);
  return (
    u32(0) === 0x43424457 && bytes.byteLength >= 20 + u32(4) * u32(12) + u32(16)
  );
}

/**
 * Fills each still-empty string field from a locale file's record at the
 * same position, as the server does. Positions past either file's end are
 * left alone.
 */
export function fillEmptyStrings(
  format: string,
  records: DbcValue[][],
  locale: readonly (readonly (DbcValue | null)[])[],
): void {
  records.forEach((fields, r) => {
    for (let f = 0; f < format.length; f++) {
      if (format[f] !== "s" || fields[f] !== "") continue;
      const value = locale[r]?.[f];
      if (typeof value === "string") fields[f] = value;
    }
  });
}

/**
 * The format the reader parses with: the server's own, except that a field
 * marked `readAs` is read as a string (`x` becomes `s`; a skipped localized
 * string becomes 16 `s` and its flags). Both are 4 bytes, so the layout's
 * size is unchanged.
 */
export function effectiveFormat(
  layout: Pick<DbcLayout, "format" | "fields">,
): string {
  const chars = [...layout.format];
  for (const field of layout.fields ?? []) {
    if (field.readAs === "string") chars[field.index] = "s";
    if (field.readAs === "localized") {
      for (let i = 0; i < LOCALIZED_SLOTS; i++) chars[field.index + i] = "s";
    }
  }
  return chars.join("");
}

/**
 * Turns a record's fields into attributes. A field the layout names is
 * stored under its name; an unnamed one under its format position, as text
 * ("12"), the same way an origin names a field. A localized string becomes
 * one attribute (its slots by locale, the unnamed slots and the flags)
 * under its first position's name or number. A field marked `signed` is
 * reinterpreted as a signed 32-bit number.
 */
export function recordView(
  layout: Pick<DbcLayout, "format" | "fields">,
): (fields: readonly DbcValue[]) => Attrs {
  const { localized } = readFormat(layout.format);
  // A field marked readAs "localized" is one too, even where the pattern
  // can't see it (a string read just before it makes the run 17 long).
  const starts = new Set([
    ...localized,
    ...(layout.fields ?? [])
      .filter((f) => f.readAs === "localized")
      .map((f) => f.index),
  ]);
  const covered = new Set(
    [...starts].flatMap((s) =>
      Array.from({ length: LOCALIZED_SLOTS + 1 }, (_, i) => s + i),
    ),
  );
  const byIndex = new Map((layout.fields ?? []).map((f) => [f.index, f]));
  const keyOf = (position: number): string =>
    byIndex.get(position)?.name ?? String(position);
  const signed = new Set(
    (layout.fields ?? []).filter((f) => f.signed === true).map((f) => f.index),
  );
  return (fields) => {
    const attrs: Record<string, JsonValue> = {};
    fields.forEach((value, p) => {
      if (starts.has(p)) {
        const slots = fields.slice(p, p + LOCALIZED_SLOTS) as string[];
        attrs[keyOf(p)] = {
          ...Object.fromEntries(
            LOCALES.map((locale, i) => [locale, slots[i]!]),
          ),
          unnamed: slots.slice(LOCALES.length),
          flags: fields[p + LOCALIZED_SLOTS]!,
        };
      } else if (!covered.has(p)) {
        attrs[keyOf(p)] =
          signed.has(p) && typeof value === "number"
            ? asSigned32(value)
            : value;
      }
    });
    return attrs;
  };
}
