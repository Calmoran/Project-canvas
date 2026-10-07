/**
 * Builds synthetic WDBC files for tests, so no game client data is ever
 * committed. Values are given per format position; strings are gathered into
 * a string block that starts with an empty string at offset 0, as WDBC files
 * usually do.
 */

export type FieldValue = number | string;

export interface BuildOptions {
  /** Overrides for the header, to build broken files on purpose. */
  readonly header?: Partial<{
    magic: number;
    recordCount: number;
    fieldCount: number;
    recordSize: number;
    stringSize: number;
  }>;
  /** Leave out the string block entirely (stringSize 0). */
  readonly noStringBlock?: boolean;
  /** Raw string block bytes, replacing the generated one. */
  readonly stringBlock?: Uint8Array;
}

export function buildDbc(
  format: string,
  records: readonly (readonly FieldValue[])[],
  options: BuildOptions = {},
): Uint8Array {
  const size = (c: string): number => (c === "b" || c === "X" ? 1 : 4);
  const recordSize = [...format].reduce((n, c) => n + size(c), 0);

  const encoder = new TextEncoder();
  const strings: number[] = options.noStringBlock === true ? [] : [0];
  const offsets = new Map<string, number>([["", 0]]);
  const offsetOf = (s: string): number => {
    let at = offsets.get(s);
    if (at === undefined) {
      at = strings.length;
      offsets.set(s, at);
      strings.push(...encoder.encode(s), 0);
    }
    return at;
  };

  const body = new Uint8Array(records.length * recordSize);
  const view = new DataView(body.buffer);
  records.forEach((values, r) => {
    let at = r * recordSize;
    [...format].forEach((c, f) => {
      const v = values[f]!;
      if (c === "s")
        view.setUint32(at, typeof v === "string" ? offsetOf(v) : v, true);
      else if (c === "f") view.setFloat32(at, v as number, true);
      else if (c === "b" || c === "X") view.setUint8(at, v as number);
      else view.setUint32(at, v as number, true);
      at += size(c);
    });
  });

  const block = options.stringBlock ?? Uint8Array.from(strings);
  const h = options.header ?? {};
  const header = new DataView(new ArrayBuffer(20));
  header.setUint32(0, h.magic ?? 0x43424457, true);
  header.setUint32(4, h.recordCount ?? records.length, true);
  header.setUint32(8, h.fieldCount ?? format.length, true);
  header.setUint32(12, h.recordSize ?? recordSize, true);
  header.setUint32(16, h.stringSize ?? block.length, true);

  const out = new Uint8Array(20 + body.length + block.length);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(body, 20);
  out.set(block, 20 + body.length);
  return out;
}
