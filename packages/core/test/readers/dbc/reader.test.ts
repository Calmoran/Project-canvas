import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  dbcReader,
  recordView,
  type DbcReaderConfig,
  type NodeOrEdge,
  type Profile,
  type ReadContext,
  type ReaderProgress,
} from "../../../src/index.js";
import { buildDbc } from "../../dbc/build.js";

// ID, a localized name (16 slots + flags), a level, and a plain string.
const FORMAT = `n${"s".repeat(16)}xis`;
const empty16 = (): string[] => Array.from({ length: 16 }, () => "");
const slots = (set: Record<number, string>): string[] => {
  const s = empty16();
  for (const [i, v] of Object.entries(set)) s[Number(i)] = v;
  return s;
};
// Slot numbers: enUS 0, frFR 2, deDE 3, esES 6.
const row = (
  id: number,
  name: Record<number, string>,
  level: number,
  plain: string,
) => [id, ...slots(name), 0, level, plain];

const cite = ["core:x:1"];
const profile = (dbc: Profile["dbc"]): Profile => ({
  id: "fixture",
  sources: { core: "9d9b6049" },
  databases: { world: [], characters: [], auth: [] },
  dbc,
  edges: [],
  bindings: [],
  loaders: [],
  overrides: [],
  expectations: [],
  labels: [{ kind: "dbc_record", attrs: ["Name"], source: cite }],
  deadTables: [],
  scriptNames: [],
  hooks: [],
});
// Named positions; 19 (the plain string) is left unnamed on purpose.
const names = [
  { index: 0, name: "ID" },
  { index: 1, name: "Name" },
  { index: 18, name: "Level" },
];
const spell = {
  file: "Spell.dbc",
  format: FORMAT,
  fields: names,
  verified: true,
  source: cite,
};
const missing = {
  file: "Missing.dbc",
  format: "n",
  verified: true,
  source: cite,
};

let folder: string;
const write = (path: string, bytes: Uint8Array): void => {
  mkdirSync(join(folder, path, ".."), { recursive: true });
  writeFileSync(join(folder, path), bytes);
};

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "canvas-dbc-"));
  // Lower-case on disk: names are matched without regard to case.
  write(
    "spell.dbc",
    buildDbc(FORMAT, [
      row(116, { 0: "Frostbolt" }, 5, ""),
      row(133, { 0: "Fireball", 3: "Feuerball (base)" }, 3, "fx"),
    ]),
  );
  write(
    "deDE/Spell.dbc",
    buildDbc(FORMAT, [
      row(116, { 3: "Frostblitz" }, 99, "blitz"),
      row(133, { 0: "ignored", 3: "Feuerball (de)" }, 99, ""),
    ]),
  );
  write(
    "esES/Spell.dbc",
    buildDbc(FORMAT, [
      row(116, { 6: "Descarga" }, 0, "rayo"),
      row(133, {}, 0, ""),
    ]),
  );
  // One record fewer than the base file: cannot be merged by position.
  write(
    "frFR/Spell.dbc",
    buildDbc(FORMAT, [row(116, { 2: "Éclair de givre" }, 0, "")]),
  );
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function context(
  p: Profile,
  previous: ReadonlyMap<string, string> = new Map(),
) {
  const recorded = new Map<string, string>();
  const progress: ReaderProgress[] = [];
  const ctx: ReadContext<DbcReaderConfig> = {
    snapshot: "s1",
    config: { folder },
    profile: p,
    plan: { reader: "dbc", items: [] },
    signal: new AbortController().signal,
    progress: (u) => progress.push(u),
    previousFingerprint: (reader, key) =>
      reader === "dbc" ? previous.get(key) : undefined,
    recordInput: (key, fp) => recorded.set(key, fp),
  };
  return { ctx, recorded, progress };
}

async function readAll(
  ctx: ReadContext<DbcReaderConfig>,
): Promise<NodeOrEdge[]> {
  const items: NodeOrEdge[] = [];
  for await (const item of dbcReader.read(ctx)) items.push(item);
  return items;
}
const nodeById = (items: NodeOrEdge[], id: string) =>
  items
    .flatMap((i) => (i.type === "node" ? [i.node] : []))
    .find((n) => n.id === id);

describe("the DBC reader", () => {
  test("plans every layout, with record counts, and marks a missing file", () => {
    expect(dbcReader.plan({ folder }, profile([spell, missing]))).toEqual({
      reader: "dbc",
      items: [
        { id: "Spell.dbc", label: "Spell.dbc", total: 2 },
        {
          id: "Missing.dbc",
          label: "Missing.dbc",
          total: null,
          status: "missing",
        },
      ],
    });
  });

  test("emits a dbc_file node and one dbc_record per record, keyed file/id", async () => {
    const items = await readAll(context(profile([spell])).ctx);
    expect(nodeById(items, "dbc_file:Spell.dbc")).toMatchObject({
      kind: "dbc_file",
      attrs: {
        file: "Spell.dbc",
        records: 2,
        fields: 20,
        // In the server's order: frFR (slot 2) before deDE (3) and esES (6).
        locales: ["frFR", "deDE", "esES"],
      },
      origin: { source: "dbc", file: "Spell.dbc" },
    });
    const r = nodeById(items, "dbc_record:Spell.dbc/116")!;
    expect(r.origin).toEqual({
      source: "dbc",
      file: "Spell.dbc",
      recordId: 116,
    });
    expect(
      items.every((i) => i.type !== "node" || i.input === "Spell.dbc"),
    ).toBe(true);
  });

  test("names fields from the layout, and unnamed ones by their position", async () => {
    const items = await readAll(context(profile([spell])).ctx);
    const attrs = nodeById(items, "dbc_record:Spell.dbc/133")!.attrs;
    expect(attrs["ID"]).toBe(133);
    expect(attrs["Level"]).toBe(3);
    expect(attrs["19"]).toBe("fx");
    // The localized name is one attribute, by locale; its slots are not repeated.
    expect(attrs["Name"]).toMatchObject({
      enUS: "Fireball",
      deDE: "Feuerball (base)",
      flags: 0,
    });
    // (JavaScript lists number-like keys first, so compare them unordered.)
    expect(Object.keys(attrs).sort()).toEqual(["19", "ID", "Level", "Name"]);
  });

  test("locale files fill only empty strings, in the server's locale order", async () => {
    const items = await readAll(context(profile([spell])).ctx);
    const frost = nodeById(items, "dbc_record:Spell.dbc/116")!.attrs;
    expect(frost["Name"]).toMatchObject({
      enUS: "Frostbolt",
      deDE: "Frostblitz",
      esES: "Descarga",
    });
    // The plain string was empty: deDE comes before esES, so deDE's wins.
    expect(frost["19"]).toBe("blitz");
    // Numbers never come from a locale file.
    expect(frost["Level"]).toBe(5);
    const fire = nodeById(items, "dbc_record:Spell.dbc/133")!.attrs;
    // Already set in the base file: the locale's own text does not replace it.
    expect(fire["Name"]).toMatchObject({
      enUS: "Fireball",
      deDE: "Feuerball (base)",
    });
  });

  test("labels records by the profile's label rule", async () => {
    const items = await readAll(context(profile([spell])).ctx);
    // Name is an object of slots, not text, so the label falls back to the key.
    expect(nodeById(items, "dbc_record:Spell.dbc/116")!.label).toBe(
      "Spell.dbc/116",
    );
  });

  test("a locale file with another record count is merged by position anyway, and reported", async () => {
    const run = context(profile([spell]));
    const items = await readAll(run.ctx);
    // frFR/Spell.dbc has one record: it lands on the first base record.
    expect(
      nodeById(items, "dbc_record:Spell.dbc/116")!.attrs["Name"],
    ).toMatchObject({ frFR: "Éclair de givre" });
    expect(
      nodeById(items, "dbc_record:Spell.dbc/133")!.attrs["Name"],
    ).toMatchObject({ frFR: "" });
    // The translation file is its own node, and the mismatch a finding.
    expect(nodeById(items, "dbc_file:frFR/Spell.dbc")).toMatchObject({
      attrs: { locale: "frFR", translates: "Spell.dbc", records: 1 },
    });
    expect(items.filter((i) => i.type === "finding")).toEqual([
      {
        type: "finding",
        input: "Spell.dbc",
        finding: {
          kind: "mismatch",
          expected: null,
          node: "dbc_file:frFR/Spell.dbc",
          related: ["dbc_file:Spell.dbc"],
          rule: "core.locale-mismatch",
        },
      },
    ]);
    // Still reported in progress: how many records lined up.
    expect(run.progress).toContainEqual({
      item: "frFR/Spell.dbc",
      done: 1,
      total: 2,
    });
  });

  test("a locale is dropped for every later file once one of its files is missing", async () => {
    // The profile loads Other.dbc first; esES has no Other.dbc.
    const other = {
      file: "Other.dbc",
      format: "ns",
      verified: true,
      source: cite,
    };
    write("Other.dbc", buildDbc("ns", [[1, ""]]));
    write("deDE/Other.dbc", buildDbc("ns", [[1, "Andere"]]));
    const run = context(profile([other, spell]));
    const items = await readAll(run.ctx);
    expect(run.progress).toContainEqual({
      item: "esES/Other.dbc",
      done: 0,
      total: 0,
    });
    const frost = nodeById(items, "dbc_record:Spell.dbc/116")!.attrs;
    // esES's Spell.dbc exists, but esES was already dropped, as on the server.
    expect(frost["Name"]).toMatchObject({
      deDE: "Frostblitz",
      esES: "",
      frFR: "",
    });
    expect(nodeById(items, "dbc_file:Spell.dbc")!.attrs["locales"]).toEqual([
      "deDE",
    ]);
    // frFR has no Other.dbc either, so it is dropped before Spell.dbc too.
    expect(run.progress).toContainEqual({
      item: "frFR/Other.dbc",
      done: 0,
      total: 0,
    });
  });

  test("a record ID that appears twice keeps its last record, with a duplicate finding", async () => {
    const twice = {
      file: "Twice.dbc",
      format: "ni",
      verified: true,
      source: cite,
    };
    write(
      "Twice.dbc",
      buildDbc("ni", [
        [5, 1],
        [6, 2],
        [5, 3],
      ]),
    );
    const items = await readAll(context(profile([twice])).ctx);
    const records = items.flatMap((i) =>
      i.type === "node" && i.node.kind === "dbc_record" ? [i.node] : [],
    );
    expect(records.map((r) => [r.id, r.attrs["1"]])).toEqual([
      ["dbc_record:Twice.dbc/6", 2],
      ["dbc_record:Twice.dbc/5", 3],
    ]);
    expect(items.filter((i) => i.type === "finding")).toEqual([
      {
        type: "finding",
        input: "Twice.dbc",
        finding: {
          kind: "duplicate",
          expected: null,
          node: "dbc_record:Twice.dbc/5",
          related: ["dbc_file:Twice.dbc"],
          rule: "core.duplicate-record",
        },
      },
    ]);
  });

  test("reads skipped fields marked readAs as text, and signed fields as signed", async () => {
    // ID, a skipped string, a skipped localized string, a signed int.
    const format = `nx${"x".repeat(17)}i`;
    const layout = {
      file: "TalentTab.dbc",
      format,
      fields: [
        { index: 1, name: "Icon", readAs: "string" as const },
        { index: 2, name: "Name", readAs: "localized" as const },
        { index: 19, name: "Order", signed: true },
      ],
      verified: true,
      source: cite,
    };
    // Build the file as if those fields were strings; the bytes are the same.
    write(
      "TalentTab.dbc",
      buildDbc(`ns${"s".repeat(16)}xi`, [
        [41, "icon_frost", ...slots({ 0: "Frost" }), 0, 0xffffffff],
      ]),
    );
    write(
      "deDE/TalentTab.dbc",
      buildDbc(`ns${"s".repeat(16)}xi`, [
        [41, "", ...slots({ 3: "Frost (de)" }), 0, 0],
      ]),
    );
    const items = await readAll(context(profile([layout])).ctx);
    const attrs = nodeById(items, "dbc_record:TalentTab.dbc/41")!.attrs;
    expect(attrs["Icon"]).toBe("icon_frost");
    // The server merges nothing into fields it skips, so neither does Canvas.
    expect(attrs["Name"]).toMatchObject({
      enUS: "Frost",
      deDE: "",
      flags: 0,
    });
    expect(attrs["Order"]).toBe(-1);
  });

  describe("a locale file that does not line up, as the server handles it", () => {
    // The profile loads Other.dbc first, then Spell.dbc; what happens to
    // deDE at Other.dbc decides whether Spell.dbc still gets deDE strings.
    const other = {
      file: "Other.dbc",
      format: "ns",
      verified: true,
      source: cite,
    };
    const deDEStillUsed = async (otherBytes: Uint8Array) => {
      write("Other.dbc", buildDbc("ns", [[1, ""]]));
      write("deDE/Other.dbc", otherBytes);
      const run = context(profile([other, spell]));
      const items = await readAll(run.ctx);
      const frost = nodeById(items, "dbc_record:Spell.dbc/116")!.attrs["Name"];
      return {
        run,
        items,
        kept: (frost as Record<string, string>)["deDE"] === "Frostblitz",
        otherName: nodeById(items, "dbc_record:Other.dbc/1")!.attrs["1"],
      };
    };
    const mismatchFor = (items: NodeOrEdge[], file: string) =>
      items.some(
        (i) =>
          i.type === "finding" &&
          i.finding.rule === "core.locale-mismatch" &&
          i.finding.node === `dbc_file:${file}`,
      );

    test("another field count: no strings from that file, but the locale is kept", async () => {
      const { items, kept, otherName } = await deDEStillUsed(
        buildDbc("nsi", [[1, "Andere", 7]]),
      );
      expect(otherName).toBe("");
      expect(kept).toBe(true);
      expect(mismatchFor(items, "deDE/Other.dbc")).toBe(true);
    });

    test("another record size: read at the file's own size, no failure, locale kept", async () => {
      // Same field count, but a 1-byte field: records are 5 bytes, not 8.
      const { items, kept } = await deDEStillUsed(
        buildDbc("bs", [[1, "Andere"]]),
      );
      expect(kept).toBe(true);
      expect(mismatchFor(items, "deDE/Other.dbc")).toBe(true);
    });

    test("not a WDBC file: it would not load, so the locale is dropped", async () => {
      const bad = buildDbc("ns", [[1, "Andere"]], { header: { magic: 0 } });
      const { run, kept } = await deDEStillUsed(bad);
      expect(kept).toBe(false);
      expect(run.progress).toContainEqual({
        item: "deDE/Other.dbc",
        done: 0,
        total: 0,
      });
    });

    test("shorter than its header promises: it would not load, so the locale is dropped", async () => {
      const full = buildDbc("ns", [[1, "Andere"]]);
      const { kept } = await deDEStillUsed(full.subarray(0, full.length - 3));
      expect(kept).toBe(false);
    });
  });

  test("a missing file is reported and the rest is still read", async () => {
    const run = context(profile([missing, spell]));
    const items = await readAll(run.ctx);
    expect(run.progress[0]).toEqual({ item: "Missing.dbc", done: 0, total: 0 });
    expect(nodeById(items, "dbc_file:Spell.dbc")).toBeDefined();
    expect(run.recorded.has("Missing.dbc")).toBe(false);
  });

  test("records a fingerprint, reuses an unchanged file and reads a changed locale again", async () => {
    const first = context(profile([spell]));
    await readAll(first.ctx);
    expect(first.recorded.get("Spell.dbc")).toMatch(/^sha256=[0-9a-f]{64}$/);

    const again = await readAll(context(profile([spell]), first.recorded).ctx);
    expect(again).toEqual([{ type: "reuse", input: "Spell.dbc" }]);

    write(
      "esES/Spell.dbc",
      buildDbc(FORMAT, [row(116, { 6: "Otro" }, 0, ""), row(133, {}, 0, "")]),
    );
    const changed = await readAll(
      context(profile([spell]), first.recorded).ctx,
    );
    expect(
      nodeById(changed, "dbc_record:Spell.dbc/116")!.attrs["Name"],
    ).toMatchObject({ esES: "Otro" });
  });

  test("a DBC folder that does not exist reports every file missing", async () => {
    const run = context(profile([spell]));
    const ctx = { ...run.ctx, config: { folder: join(folder, "nope") } };
    expect(await readAll(ctx)).toEqual([]);
    expect(run.progress).toEqual([{ item: "Spell.dbc", done: 0, total: 0 }]);
  });
});

test("recordView names unnamed fields by position and folds localized strings", () => {
  const view = recordView({ format: `n${"s".repeat(16)}xi` });
  const attrs = view([7, ...slots({ 0: "A", 9: "nine" }), 1, 42]);
  expect(attrs).toEqual({
    "0": 7,
    "1": {
      enUS: "A",
      koKR: "",
      frFR: "",
      deDE: "",
      zhCN: "",
      zhTW: "",
      esES: "",
      esMX: "",
      ruRU: "",
      unnamed: ["nine", "", "", "", "", "", ""],
      flags: 1,
    },
    "18": 42,
  });
});
