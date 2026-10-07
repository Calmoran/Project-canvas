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
import { parseDbc, type DbcValue } from "../../dbc/parse.js";
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
 * Locale variants are merged as the server merges them
 * (core:src/server/game/DataStores/DBCStores.cpp:224-236): after the base
 * file, `<locale>/<file>` is read for each locale in the server's order,
 * and each of its strings fills only a string field still empty, matched by
 * record position (core:src/common/DataStores/DBCFileLoader.cpp:306-312).
 *
 * A file that is missing is marked `missing` in the read plan and reported
 * in progress, and the rest is still read: Canvas, unlike the server, shows
 * what it can. Each file's fingerprint (a hash of the base file and every
 * locale file merged into it) is recorded for incremental scans.
 *
 * Not yet: fields the server skips but Canvas reads as text (`readAs`) and
 * fields marked `signed` need the profile contract in #47.
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
    const locales = LOCALES.flatMap((locale) => {
      const dir = files.get(locale.toLowerCase());
      if (dir === undefined || !statSync(join(folder, dir)).isDirectory())
        return [];
      return [
        {
          locale,
          dir: join(folder, dir),
          files: folderIndex(join(folder, dir)),
        },
      ];
    });

    for (const layout of ctx.profile.dbc) {
      if (ctx.signal.aborted) throw new Error("The scan was cancelled");
      const actual = files.get(layout.file.toLowerCase());
      if (actual === undefined) {
        ctx.progress({ item: layout.file, done: 0, total: 0 });
        continue;
      }
      const base = await readFile(join(folder, actual));
      const variants: { locale: string; bytes: Uint8Array }[] = [];
      for (const l of locales) {
        const name = l.files.get(layout.file.toLowerCase());
        if (name !== undefined) {
          variants.push({
            locale: l.locale,
            bytes: await readFile(join(l.dir, name)),
          });
        }
      }

      const input = layout.file;
      const fingerprint = fingerprintOf(base, variants);
      ctx.recordInput(input, fingerprint);
      if (ctx.previousFingerprint("dbc", input) === fingerprint) {
        yield { type: "reuse", input };
        continue;
      }

      const parsed = parseDbc(layout.file, base, layout.format);
      const records = parsed.records.map((r) => [...r.fields]);
      const merged: string[] = [];
      for (const variant of variants) {
        const localized = parseDbc(
          `${variant.locale}/${layout.file}`,
          variant.bytes,
          layout.format,
        );
        if (localized.recordCount !== parsed.recordCount) {
          // The server matches locale strings to records by position, so a
          // file with another record count cannot be merged: report it.
          ctx.progress({
            item: `${variant.locale}/${layout.file}`,
            done: 0,
            total: 0,
          });
          continue;
        }
        fillEmptyStrings(
          layout.format,
          records,
          localized.records.map((r) => r.fields),
        );
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

      const view = recordView(layout);
      for (const [r, fields] of records.entries()) {
        const id = parsed.records[r]!.id;
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
      ctx.progress({
        item: layout.file,
        done: records.length,
        total: records.length,
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

/**
 * Fills each still-empty string field from a locale file's record at the
 * same position, as the server does.
 */
export function fillEmptyStrings(
  format: string,
  records: DbcValue[][],
  locale: readonly (readonly DbcValue[])[],
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
 * Turns a record's fields into attributes. A field the layout names is
 * stored under its name; an unnamed one under its format position, as text
 * ("12"), the same way an origin names a field. A localized string becomes
 * one attribute (its slots by locale, the unnamed slots and the flags)
 * under its first position's name or number.
 */
export function recordView(
  layout: Pick<DbcLayout, "format" | "fields">,
): (fields: readonly DbcValue[]) => Attrs {
  const { localized } = readFormat(layout.format);
  const starts = new Set(localized);
  const covered = new Set(
    localized.flatMap((s) =>
      Array.from({ length: LOCALIZED_SLOTS + 1 }, (_, i) => s + i),
    ),
  );
  const names = layout.fields ?? [];
  const keyOf = (position: number): string =>
    names[position] ?? String(position);
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
        attrs[keyOf(p)] = value;
      }
    });
    return attrs;
  };
}
