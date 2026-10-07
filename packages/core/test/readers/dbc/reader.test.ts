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
});
const names = [
  "ID",
  "Name",
  ...Array.from({ length: 16 }, () => null),
  "Level",
  null,
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
        locales: ["deDE", "esES"],
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

  test("a locale file with another record count is skipped and reported", async () => {
    const run = context(profile([spell]));
    const items = await readAll(run.ctx);
    expect(
      nodeById(items, "dbc_record:Spell.dbc/116")!.attrs["Name"],
    ).toMatchObject({ frFR: "" });
    expect(run.progress).toContainEqual({
      item: "frFR/Spell.dbc",
      done: 0,
      total: 0,
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
