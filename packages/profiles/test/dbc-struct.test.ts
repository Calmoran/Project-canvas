import { describe, expect, test } from "vitest";
import {
  dbcStructs,
  deriveFields,
  integerConstants,
  nameStoredFields,
  sizeFrom,
  structMembers,
  type StructResult,
} from "./support/dbc-struct.js";

// A made-up header in the shape of DBCStructure.h; it describes no real file.
const header = [
  "#define MAX_THING_EFFECTS 3",
  "struct ThingEntry",
  "{",
  "    uint32 ID;                                    // 0",
  "    // uint32 Unused;                             // 1 (commented out)",
  "    std::array<uint32, MAX_THING_EFFECTS> Effect; // 2-4",
  "    char const* Name[16];                         // 5-20",
  "    flag96 FamilyFlags;                           // 22-24",
  "    float Speed;                                  // 25",
  "",
  "    bool IsThing() const",
  "    {",
  "        return ID != 0;",
  "    }",
  "};",
  "struct UnionEntry",
  "{",
  "    uint32 ID;",
  "    union",
  "    {",
  "        uint32 a;",
  "    };",
  "};",
];
const size = sizeFrom(integerConstants([header]));
const problemOf = (r: StructResult) => ("problem" in r ? r.problem : "");

describe("structMembers", () => {
  test("reads members in order, skipping comments and method bodies", () => {
    const result = structMembers(header, "ThingEntry", size);
    expect(result).toEqual({
      members: [
        { line: 4, base: "ID", names: ["ID"], signed: false },
        {
          line: 6,
          base: "Effect",
          names: ["Effect[0]", "Effect[1]", "Effect[2]"],
          signed: false,
        },
        {
          line: 7,
          base: "Name",
          names: Array.from({ length: 16 }, (_, k) => `Name[${k}]`),
          signed: false,
        },
        {
          line: 8,
          base: "FamilyFlags",
          names: ["FamilyFlags[0]", "FamilyFlags[1]", "FamilyFlags[2]"],
          signed: false,
        },
        { line: 9, base: "Speed", names: ["Speed"], signed: false },
      ],
    });
  });

  test("records a union as an unnamed gap, and refuses a second one", () => {
    expect(structMembers(header, "UnionEntry", size)).toEqual({
      members: [
        { line: 18, base: "ID", names: ["ID"], signed: false },
        { line: 19, base: "", names: [], signed: false, gap: true },
      ],
    });
    const twice = [...header.slice(0, -1), ...header.slice(-6, -1), "};"];
    expect(problemOf(structMembers(twice, "UnionEntry", size))).toContain(
      "second union",
    );
  });

  test("reports a missing struct and an unknown array length", () => {
    expect(structMembers(header, "NoSuchEntry", size)).toEqual({
      problem: "struct NoSuchEntry not found",
    });
    expect(
      problemOf(
        structMembers(
          ["struct XEntry", "{", "    uint32 A[MAX_NOPE];", "};"],
          "XEntry",
          size,
        ),
      ),
    ).toContain("MAX_NOPE");
  });
});

describe("nameStoredFields", () => {
  const members = [
    { line: 1, base: "ID", names: ["ID"], signed: false },
    { line: 2, base: "Name", names: ["Name"], signed: false },
    { line: 3, base: "Speed", names: ["Speed"], signed: false },
  ];

  test("names only the stored positions, skipping x, X and d", () => {
    expect(nameStoredFields("nxsXdf", members)).toEqual({
      fields: [
        { index: 0, name: "ID", line: 1 },
        { index: 2, name: "Name", line: 2 },
        { index: 5, name: "Speed", line: 3 },
      ],
    });
  });

  test("fails when the members do not cover the stored positions exactly", () => {
    expect(nameStoredFields("nsfi", members)).toEqual({
      problem: "the members cover 3 positions; the format stores 4",
    });
  });
});

test("dbcStructs pairs each loaded file with its store's struct", () => {
  const stores = [
    "DBCStorage <ThingEntry> sThingStore(ThingEntryfmt);",
    "DBCStorage <OtherEntry> sOtherStore(OtherEntryfmt);",
    '    LOAD_DBC(sThingStore,   "Thing.dbc",   "thing_dbc");',
    '    //LOAD_DBC(sOtherStore, "Other.dbc",   "other_dbc");',
  ];
  expect([...dbcStructs(stores)]).toEqual([["Thing.dbc", "ThingEntry"]]);
});

describe("deriveFields", () => {
  const members = [
    { line: 1, base: "ID", names: ["ID"], signed: false },
    { line: 2, base: "Offset", names: ["Offset"], signed: true },
    {
      line: 3,
      base: "Name",
      names: Array.from({ length: 16 }, (_, k) => `Name[${k}]`),
      signed: false,
    },
    { line: 4, base: "Speed", names: ["Speed"], signed: true },
  ];

  test("groups a localized string at its first slot and marks int32 fields signed", () => {
    const format = "ni" + "s".repeat(16) + "xf";
    expect(deriveFields(format, members)).toEqual({
      fields: [
        { index: 0, name: "ID", line: 1 },
        { index: 1, name: "Offset", signed: true, line: 2 },
        { index: 2, name: "Name", line: 3 },
        // A float is never signed, whatever the member says.
        { index: 19, name: "Speed", line: 4 },
      ],
    });
  });

  test("keeps 16 strings without the trailing flags as separate slots", () => {
    const format = "ni" + "s".repeat(16) + "f";
    const result = deriveFields(format, members);
    expect("fields" in result && result.fields.map((f) => f.name)).toContain(
      "Name[15]",
    );
  });
});

describe("unions and unnamed struct arrays", () => {
  const lines = [
    "#define MAX_REQS 2",
    "struct CriteriaEntry",
    "{",
    "    uint32 ID;",
    "    union",
    "    {",
    "        struct",
    "        {",
    "            uint32 a;",
    "            uint32 b;",
    "        } first;",
    "    };",
    "    struct",
    "    {",
    "        uint32 type;",
    "        uint32 value;",
    "    } reqs[MAX_REQS];",
    "    uint32 flags;",
    "};",
  ];
  const sizes = sizeFrom(integerConstants([lines]));

  test("a union covers the positions the other members leave, unnamed", () => {
    const result = structMembers(lines, "CriteriaEntry", sizes);
    if (!("members" in result)) throw new Error(result.problem);
    expect(nameStoredFields("niiiiiixi", result.members)).toEqual({
      fields: [
        { index: 0, name: "ID", line: 4 },
        { index: 3, name: "reqs[0].type", line: 13 },
        { index: 4, name: "reqs[0].value", line: 13 },
        { index: 5, name: "reqs[1].type", line: 13 },
        { index: 6, name: "reqs[1].value", line: 13 },
        { index: 8, name: "flags", line: 18 },
      ],
    });
  });

  test("a format too short for the named members still fails", () => {
    const result = structMembers(lines, "CriteriaEntry", sizes);
    if (!("members" in result)) throw new Error(result.problem);
    expect(nameStoredFields("niiii", result.members)).toMatchObject({
      problem: "the members cover 6 positions; the format stores 5",
    });
  });
});
