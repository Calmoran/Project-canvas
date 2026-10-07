import type { BindingDef } from "@canvas/core";

/**
 * C++ code that names a spell by its ID (code research 1.5c, 1.5d, 2.10;
 * binding catalogue rows 17, 20, 22). Each emits an `id_literal` for the
 * spell an integer argument names, so the reference is bound through the
 * data that ID names (`db`), as with the Lua entry-bound functions.
 *
 * Only names whose ID argument sits in one place are here. Functions with
 * overloads that move the ID or take a SpellInfo instead (CastSpell,
 * DoCast), and names other classes reuse for other things (GetAura,
 * AddAura, HasAura), wait for a decision on how to describe them.
 */

const SPELLS = "src/server/game/Spells";
const spellIds = { index: 0, holds: "id", kind: "spell", list: true } as const;
const spellId = { index: 0, holds: "id", kind: "spell" } as const;

export const cppReferences: BindingDef[] = [
  {
    // Hardcoded corrections: ApplySpellFix({ ids }, [](SpellInfo*) { ... }).
    id: "cpp.call.ApplySpellFix",
    language: "cpp",
    form: "function_call",
    symbol: "ApplySpellFix",
    args: [spellIds],
    bound: "db",
    emits: "id_literal",
    confidence: "exact",
    source: [`core:${SPELLS}/SpellInfoCorrections.cpp:24`],
  },
  {
    // A script's declared dependencies, inside its Validate().
    id: "cpp.call.ValidateSpellInfo",
    language: "cpp",
    form: "function_call",
    symbol: "ValidateSpellInfo",
    args: [spellIds],
    bound: "db",
    emits: "id_literal",
    confidence: "exact",
    source: [
      `core:${SPELLS}/SpellScript.h:125`,
      `core:${SPELLS}/SpellScript.h:131`,
    ],
  },
  ...(
    [
      ["SpellMgr::GetSpellInfo", "GetSpellInfo", "SpellMgr.h:742"],
      ["SpellMgr::AssertSpellInfo", "AssertSpellInfo", "SpellMgr.h:744"],
      [
        "Unit::RemoveAurasDueToSpell",
        "RemoveAurasDueToSpell",
        "Entities/Unit/Unit.h:1407",
      ],
    ] as const
  ).map(([qualified, symbol, at]): BindingDef => ({
    id: `cpp.call.${qualified}`,
    language: "cpp",
    form: "function_call",
    symbol,
    args: [spellId],
    bound: "db",
    emits: "id_literal",
    confidence: "exact",
    source: [
      at.startsWith("Entities/")
        ? `core:src/server/game/${at}`
        : `core:${SPELLS}/${at}`,
    ],
  })),
  {
    // Hardcoded spell IDs in the custom-attribute loader: `case 44801:`.
    id: "cpp.case.SpellMgr::LoadSpellInfoCustomAttributes",
    language: "cpp",
    form: "case",
    symbol: "SpellMgr::LoadSpellInfoCustomAttributes",
    args: [spellId],
    bound: "db",
    emits: "id_literal",
    confidence: "exact",
    source: [`core:${SPELLS}/SpellMgr.cpp:3166`],
  },
];
