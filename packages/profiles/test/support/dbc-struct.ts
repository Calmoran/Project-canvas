/**
 * Reads DBC structs out of `DBCStructure.h` text and names the stored
 * positions of a format string with them. The server copies each stored
 * field (format characters n, i, f, s, b) into the next struct member in
 * order and skips x, X and d, so members read in order name the stored
 * positions. Used by the local-only test to derive every field name again.
 *
 * It reads declarations line by line rather than parsing C++: enough for
 * the plain member lists these structs use, and it reports anything else
 * (a union, an unknown declaration) instead of guessing.
 */

/** Format characters the server copies into the struct. */
export const STORED_CHARS: ReadonlySet<string> = new Set([
  "n",
  "i",
  "f",
  "s",
  "b",
]);

/** One struct member and the positions it covers, in order. */
export interface Member {
  readonly line: number;
  /** The member's own name, e.g. `Reagent` for `Reagent[0]`..`Reagent[7]`. */
  readonly base: string;
  readonly names: readonly string[];
  /** Declared `int32`: its values are signed although the server reads them unsigned. */
  readonly signed: boolean;
  /** A union: covers whatever positions the other members leave, unnamed. */
  readonly gap?: true;
}

/** The line holding the `}` that closes the block opened on or after `from`. */
function blockEnd(lines: readonly string[], from: number): number | undefined {
  let depth = 0;
  let opened = false;
  for (let j = from; j < lines.length; j++) {
    for (const ch of lines[j]!.replace(/\/\/.*$/, "")) {
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (opened && depth === 0) return j;
  }
  return undefined;
}

export type StructResult =
  { readonly members: readonly Member[] } | { readonly problem: string };

const range = (n: number) => Array.from({ length: n }, (_, k) => k);

/** The names one declaration covers, or undefined if it is not a member. */
function declNames(
  decl: string,
  size: (token: string) => number,
): string[] | undefined {
  let m: RegExpExecArray | null;
  if ((m = /^std::array<\s*flag96\s*,\s*(\w+)\s*>\s+(\w+)$/.exec(decl))) {
    const name = m[2]!;
    return range(size(m[1]!)).flatMap((e) =>
      range(3).map((w) => `${name}[${e}][${w}]`),
    );
  }
  if (
    (m = /^std::array<\s*(?:char const\*|[\w:]+)\s*,\s*(\w+)\s*>\s+(\w+)$/.exec(
      decl,
    ))
  ) {
    const name = m[2]!;
    return range(size(m[1]!)).map((k) => `${name}[${k}]`);
  }
  if ((m = /^flag96\s+(\w+)$/.exec(decl))) {
    const name = m[1]!;
    return range(3).map((k) => `${name}[${k}]`);
  }
  if ((m = /^DBCPosition3D\s+(\w+)$/.exec(decl))) {
    const name = m[1]!;
    return ["X", "Y", "Z"].map((k) => `${name}.${k}`);
  }
  if (
    (m = /^(?:char const\*|const char\*|char\*|[\w:]+)\s+(\w+)\[(\w+)\]$/.exec(
      decl,
    ))
  ) {
    const name = m[1]!;
    return range(size(m[2]!)).map((k) => `${name}[${k}]`);
  }
  if (
    (m =
      /^(?:char const\*|const char\*|char\*|[\w:]+)\s+(\w+(?:\s*,\s*\w+)*)$/.exec(
        decl,
      ))
  ) {
    return m[1]!.split(/\s*,\s*/);
  }
  return undefined;
}

/**
 * The members of `struct name`, from the line that opens it to the `};` at
 * the start of a line that closes it. Method bodies are skipped; comments
 * are dropped. `size` resolves an array length such as `MAX_SPELL_EFFECTS`.
 */
export function structMembers(
  lines: readonly string[],
  name: string,
  size: (token: string) => number,
): StructResult {
  const start = lines.findIndex((l) =>
    new RegExp(`^struct ${name}\\b`).test(l),
  );
  if (start < 0) return { problem: `struct ${name} not found` };
  const members: Member[] = [];
  let depth = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.startsWith("};")) return { members };
    if (raw.startsWith("{")) continue;
    const code = raw.replace(/\/\/.*$/, "").trim();
    const opens = (code.match(/\{/g) ?? []).length;
    const closes = (code.match(/\}/g) ?? []).length;
    if (depth > 0) {
      depth += opens - closes;
      continue;
    }
    const nested = /^(union|struct)\b/.exec(code);
    if (nested !== null) {
      const end = blockEnd(lines, i + 1);
      if (end === undefined) return { problem: `line ${i + 1} never closes` };
      const closing = lines[end]!.replace(/\/\/.*$/, "").trim();
      if (nested[1] === "union" && /^}\s*;$/.test(closing)) {
        // Its positions mean different things per record; they stay unnamed.
        if (members.some((m) => m.gap === true)) {
          return { problem: `a second union at line ${i + 1}` };
        }
        members.push({
          line: i + 1,
          base: "",
          names: [],
          signed: false,
          gap: true,
        });
        i = end;
        continue;
      }
      const array = /^}\s*(\w+)(?:\[(\w+)\])?\s*;$/.exec(closing);
      if (nested[1] === "struct" && array !== null) {
        // An unnamed struct type used as a member: `struct { ... } x[2];`
        const inner = structMembers(
          [
            "struct Inner",
            "{",
            ...lines.slice(i + 1, end).filter((l) => l.trim() !== "{"),
            "};",
          ],
          "Inner",
          size,
        );
        if (!("members" in inner)) return inner;
        const innerNames = inner.members.flatMap((m) => m.names);
        const prefixes =
          array[2] === undefined
            ? [array[1]!]
            : range(size(array[2])).map((k) => `${array[1]}[${k}]`);
        members.push({
          line: i + 1,
          base: array[1]!,
          names: prefixes.flatMap((p) => innerNames.map((n) => `${p}.${n}`)),
          signed: false,
        });
        i = end;
        continue;
      }
      return { problem: `nested '${code}' at line ${i + 1}` };
    }
    if (code.includes("(") || opens > closes) {
      depth += opens - closes;
      continue;
    }
    if (
      code === "" ||
      /^(public|private|protected):/.test(code) ||
      /^(#|static |using |typedef )/.test(code)
    ) {
      continue;
    }
    if (!code.endsWith(";")) {
      return { problem: `unrecognised line ${i + 1}: ${code}` };
    }
    let names: string[] | undefined;
    try {
      names = declNames(code.slice(0, -1).trim(), size);
    } catch (e) {
      return { problem: `line ${i + 1}: ${(e as Error).message}` };
    }
    if (names === undefined) {
      return { problem: `unrecognised declaration at line ${i + 1}: ${code}` };
    }
    const decl = code.slice(0, -1).trim();
    members.push({
      line: i + 1,
      base: names[0]!.replace(/[[.].*$/, ""),
      names,
      signed: /^(?:std::array<\s*)?int32\b/.test(decl),
    });
  }
  return { problem: `struct ${name} never closes` };
}

/** One named stored position, and the struct line that names it. */
export interface NamedField {
  readonly index: number;
  readonly name: string;
  readonly line: number;
}

/**
 * Names each stored position of `format` with the members in order. Fails
 * unless the members cover exactly the stored positions, which is the check
 * that the names line up.
 */
export function nameStoredFields(
  format: string,
  members: readonly Member[],
): { readonly fields: NamedField[] } | { readonly problem: string } {
  const stored = [...format].flatMap((ch, i) =>
    STORED_CHARS.has(ch) ? [i] : [],
  );
  const named = members.reduce((n, m) => n + m.names.length, 0);
  const gap = members.some((m) => m.gap === true) ? stored.length - named : 0;
  const flat = members.flatMap((m): { name?: string; line: number }[] =>
    m.gap === true
      ? range(Math.max(gap, 0)).map(() => ({ name: undefined, line: m.line }))
      : m.names.map((name) => ({ name, line: m.line })),
  );
  if (gap < 0 || flat.length !== stored.length) {
    return {
      problem: `the members cover ${named} positions; the format stores ${stored.length}`,
    };
  }
  return {
    fields: flat.flatMap((f, k) =>
      f.name === undefined
        ? []
        : [{ index: stored[k]!, name: f.name, line: f.line }],
    ),
  };
}

/** A field as the profile records it (the core `FieldDef`), with its struct line. */
export interface DerivedField {
  readonly index: number;
  readonly name: string;
  readonly signed?: true;
  readonly line: number;
}

/**
 * The profile's fields for one layout: each member names its positions, a
 * localized string (16 `s` slots then the `x` flags) becomes one field named
 * after the member at its first slot, and an `int32` member on an `i` field
 * is marked signed. Fails as `nameStoredFields` does.
 */
export function deriveFields(
  format: string,
  members: readonly Member[],
): { readonly fields: DerivedField[] } | { readonly problem: string } {
  const named = nameStoredFields(format, members);
  if (!("fields" in named)) return named;
  const out: DerivedField[] = [];
  let k = 0;
  for (const member of members) {
    const mine = named.fields.slice(k, k + member.names.length);
    k += member.names.length;
    if (mine.length === 0) continue; // a union's positions stay unnamed
    const first = mine[0]!.index;
    const localized =
      mine.length === 16 &&
      format.slice(first, first + 17) === "s".repeat(16) + "x";
    if (localized) {
      out.push({ index: first, name: member.base, line: member.line });
      continue;
    }
    for (const f of mine) {
      out.push({
        index: f.index,
        name: f.name,
        ...(member.signed && format[f.index] === "i"
          ? { signed: true as const }
          : {}),
        line: f.line,
      });
    }
  }
  return { fields: out };
}

/**
 * Integer constants a struct may use as an array length: `#define N 3`,
 * `constexpr uint32 N = 3;`, and enum entries `N = 3,`. The first
 * definition of a name wins.
 */
export function integerConstants(
  files: readonly (readonly string[])[],
): Map<string, number> {
  const found = new Map<string, number>();
  for (const lines of files) {
    for (const line of lines) {
      const m =
        /^\s*#define\s+(\w+)\s+(\d+)\b/.exec(line) ??
        /^\s*(?:static\s+)?(?:constexpr\s+)?(?:static\s+)?(?:uint\d+|int\d*|auto|std::size_t|size_t)\s+(\w+)\s*=\s*(\d+)\s*;/.exec(
          line,
        ) ??
        /^\s*(\w+)\s*=\s*(\d+)\s*,?\s*(?:\/\/.*)?$/.exec(line);
      if (m !== null && !found.has(m[1]!)) found.set(m[1]!, Number(m[2]));
    }
  }
  return found;
}

/** A `size` function for `structMembers` backed by a constants map. */
export function sizeFrom(
  constants: ReadonlyMap<string, number>,
): (token: string) => number {
  return (token) => {
    if (/^\d+$/.test(token)) return Number(token);
    const value = constants.get(token);
    if (value === undefined) throw new Error(`unknown array length ${token}`);
    return value;
  };
}

/** `file -> struct` from `DBCStores.cpp`: each store's declaration and its LOAD_DBC call. */
export function dbcStructs(lines: readonly string[]): Map<string, string> {
  const storeStruct = new Map<string, string>();
  const fileStruct = new Map<string, string>();
  for (const line of lines) {
    const m = /DBCStorage\s*<\s*(\w+)\s*>\s*(\w+)\s*\(/.exec(line);
    if (m !== null) storeStruct.set(m[2]!, m[1]!);
  }
  for (const line of lines) {
    const m = /^\s*LOAD_DBC\(\s*(\w+)\s*,\s*"([^"]+)"/.exec(line);
    const struct = m === null ? undefined : storeStruct.get(m[1]!);
    if (struct !== undefined) fileStruct.set(m![2]!, struct);
  }
  return fileStruct;
}
