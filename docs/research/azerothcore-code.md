# AzerothCore 3.3.5a: how code binds to data (feasibility research)

Source: the clean AzerothCore checkout (path in `CLAUDE.local.md`) at commit `9d9b6049a`. All paths below are relative to that checkout root. `mod-ale` is at commit `c3de794`. Everything here was read from local files; anything not confirmed from them is marked **UNVERIFIED**.

Scope note: module examples use `mod-transmog`, `mod-autobalance` and `mod-ale` only.

Plain-language key: a **DBC** is a binary table shipped with the WoW client (spells, talents, classes...). The **world DB** is the server's MySQL database (creatures, quests, loot...). A **binding** is any place where code refers to a piece of game content, by ID number or by name.

---

## Part 1: DBC files

### 1.1 WDBC binary format as the server reads it

The loader is `src/common/DataStores/DBCFileLoader.cpp` / `.h` (not `src/server/shared`).

**Header**: five little-endian `uint32` values, 20 bytes total, read in `DBCFileLoader::Load`:

| Offset | Field                                | Code                                            |
| ------ | ------------------------------------ | ----------------------------------------------- |
| 0      | magic, must be `0x43424457` ("WDBC") | `src/common/DataStores/DBCFileLoader.cpp:39-51` |
| 4      | `recordCount`                        | `DBCFileLoader.cpp:53`                          |
| 8      | `fieldCount`                         | `DBCFileLoader.cpp:61`                          |
| 12     | `recordSize` (bytes per record)      | `DBCFileLoader.cpp:69`                          |
| 16     | `stringSize` (bytes in string block) | `DBCFileLoader.cpp:77`                          |

**Body**: `recordCount * recordSize` bytes of records, then `stringSize` bytes of string block, read in one go:

```cpp
data = new unsigned char[recordSize * recordCount + stringSize];
stringTable = data + recordSize * recordCount;
```

(`DBCFileLoader.cpp:101-102`). Record _i_ starts at `data + i * recordSize` (`DBCFileLoader.cpp:125`).

**Field offsets inside a record** are computed from the format string, not the file: each field is 4 bytes unless the format char is `b` or `X` (1 byte):

```cpp
for (uint32 i = 1; i < fieldCount; ++i)
{
    fieldsOffset[i] = fieldsOffset[i - 1];
    if (fmt[i - 1] == 'b' || fmt[i - 1] == 'X')         // byte fields
    {
        fieldsOffset[i] += sizeof(uint8);
    }
    else                                                // 4 byte fields (int32/float/strings)
    {
        fieldsOffset[i] += sizeof(uint32);
    }
}
```

(`DBCFileLoader.cpp:88-99`). The format string length must equal the file's `fieldCount`, otherwise loading fails (`DBCFileLoader.cpp:190-193`, `:278-281`).

**Strings**: a string field holds a `uint32` byte offset into the string block; the string is NUL-terminated at `stringTable + offset`:

```cpp
std::size_t stringOffset = getUInt(field);
ASSERT(stringOffset < file.stringSize);
return reinterpret_cast<char*>(file.stringTable + stringOffset);
```

(`DBCFileLoader.h:74-76`). That offset 0 always points at an empty string is the usual WDBC convention, **UNVERIFIED** here (the code does not assume it).

**Format characters** (verbatim, `src/common/DataStores/DBCFileLoader.h:25-36`):

```cpp
enum DbcFieldFormat
{
    FT_NA = 'x',                                              //not used or unknown, 4 byte size
    FT_NA_BYTE = 'X',                                         //not used or unknown, byte
    FT_STRING = 's',                                          //char*
    FT_FLOAT = 'f',                                           //float
    FT_INT = 'i',                                             //uint32
    FT_BYTE = 'b',                                            //uint8
    FT_SORT = 'd',                                            //sorted by this field, field is not included
    FT_IND = 'n',                                             //the same, but parsed to data
    FT_LOGIC = 'l'                                           //Logical (boolean)
};
```

| Char | Bytes in file | Kept in server struct?                     | Meaning for Canvas                                                                                 |
| ---- | ------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `n`  | 4             | yes, `uint32`                              | the ID / index column; records are indexed by this value (`DBCFileLoader.cpp:149-151`, `:229-231`) |
| `d`  | 4             | **no**                                     | ID column used for indexing only, not copied into the struct (`DBCFileLoader.cpp:146-148`, `:264`) |
| `i`  | 4             | yes, `uint32` (struct may declare `int32`) | integer                                                                                            |
| `f`  | 4             | yes, `float`                               | float                                                                                              |
| `s`  | 4 (offset)    | yes, `char*`                               | string offset                                                                                      |
| `b`  | 1             | yes, `uint8`                               | byte                                                                                               |
| `x`  | 4             | **no**                                     | skipped 4-byte field; Canvas must still read it from the file                                      |
| `X`  | 1             | **no**                                     | skipped 1-byte field                                                                               |
| `l`  | n/a           | n/a                                        | never valid; asserts "do not have field types that match" (`DBCFileLoader.cpp:159-161`)            |

Size check: at load the server asserts that the size implied by the format string equals `sizeof(struct)` (`src/server/game/DataStores/DBCStores.cpp:216`). This guarantees that the format strings below are in sync with the structs. **The struct comments are not reliable** (see ChrClasses in 1.2), so the format string is the source of truth for file layout.

### 1.2 Format strings and structs

Format strings: `src/server/shared/DataStores/DBCfmt.h`. Structs: `src/server/shared/DataStores/DBCStructure.h` (not `src/server/game/...`). Per format string, the "kept fields" list gives the 0-based file index and format char of every non-`x` field (computed from the string).

**Spell.dbc** (`DBCfmt.h:108`, 234 fields):

```
char constexpr SpellEntryfmt[] = "niiiiiiiiiiiixixiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiifxiiiiiiiiiiiiiiiiiiiiiiiiiiiifffiiiiiiiiiiiiiiiiiiiiifffiiiiiiiiiiiiiiifffiiiiiiiiiiiiiissssssssssssssssxssssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxiiiiiiiiiiixfffxxxiiiiixxfffxx";
```

Struct `SpellEntry`: `DBCStructure.h:1641-1750` (field-by-field table below; the struct is long, so it is given as the table rather than repeated verbatim; every row cites its struct line). `MAX_SPELL_EFFECTS 3` (`DBCStructure.h:1637`), `MAX_SPELL_REAGENTS 8` (`:1639`).

**Spell.dbc field table.** Columns: file index; struct member (`DBCStructure.h` line); the world-DB column name in `spell_dbc` (`data/sql/base/db_world/spell_dbc.sql:24-257`); format char; meaning. **Fmt `x` = the server skips it; Canvas must read it from the file.**

| Idx     | Struct member (line)                                                                                 | `spell_dbc` column                              | Fmt       | Meaning                                                                                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0       | `Id` (1643)                                                                                          | ID                                              | n         | spell ID                                                                                                                                                                                                                                                                           |
| 1       | `Category` (1644)                                                                                    | Category                                        | i         | -> SpellCategory.dbc                                                                                                                                                                                                                                                               |
| 2       | `Dispel` (1645)                                                                                      | DispelType                                      | i         | dispel type                                                                                                                                                                                                                                                                        |
| 3       | `Mechanic` (1646)                                                                                    | Mechanic                                        | i         | mechanic                                                                                                                                                                                                                                                                           |
| 4-11    | `Attributes`, `AttributesEx`..`AttributesEx7` (1647-1654)                                            | Attributes, AttributesEx..AttributesEx7         | i x8      | flag words; names `SPELL_ATTR0_*`..`SPELL_ATTR7_*`                                                                                                                                                                                                                                 |
| 12      | `Stances` (1655)                                                                                     | ShapeshiftMask                                  | i         | form mask                                                                                                                                                                                                                                                                          |
| 13      | none                                                                                                 | unk_320_2                                       | **x**     | unknown; probably high dword of the stance mask (**UNVERIFIED**)                                                                                                                                                                                                                   |
| 14      | `StancesNot` (1656)                                                                                  | ShapeshiftExclude                               | i         | excluded forms                                                                                                                                                                                                                                                                     |
| 15      | none                                                                                                 | unk_320_3                                       | **x**     | unknown (**UNVERIFIED**)                                                                                                                                                                                                                                                           |
| 16      | `Targets` (1657)                                                                                     | Targets                                         | i         | target flags                                                                                                                                                                                                                                                                       |
| 17      | `TargetCreatureType` (1658)                                                                          | TargetCreatureType                              | i         | creature type mask                                                                                                                                                                                                                                                                 |
| 18      | `RequiresSpellFocus` (1659)                                                                          | RequiresSpellFocus                              | i         | -> SpellFocusObject.dbc                                                                                                                                                                                                                                                            |
| 19      | `FacingCasterFlags` (1660)                                                                           | FacingCasterFlags                               | i         |                                                                                                                                                                                                                                                                                    |
| 20-23   | `CasterAuraState`, `TargetAuraState`, `CasterAuraStateNot`, `TargetAuraStateNot` (1661-1664)         | CasterAuraState.. ExcludeTargetAuraState        | i x4      | aura-state requirements                                                                                                                                                                                                                                                            |
| 24-27   | `CasterAuraSpell`, `TargetAuraSpell`, `ExcludeCasterAuraSpell`, `ExcludeTargetAuraSpell` (1665-1668) | same                                            | i x4      | **spell -> spell edges** (required/excluded auras)                                                                                                                                                                                                                                 |
| 28      | `CastingTimeIndex` (1669)                                                                            | CastingTimeIndex                                | i         | -> SpellCastTimes.dbc                                                                                                                                                                                                                                                              |
| 29-30   | `RecoveryTime`, `CategoryRecoveryTime` (1670-1671)                                                   | same                                            | i         | cooldowns (ms)                                                                                                                                                                                                                                                                     |
| 31-33   | `InterruptFlags`, `AuraInterruptFlags`, `ChannelInterruptFlags` (1672-1674)                          | same                                            | i         |                                                                                                                                                                                                                                                                                    |
| 34-36   | `ProcFlags`, `ProcChance`, `ProcCharges` (1675-1677)                                                 | ProcTypeMask, ProcChance, ProcCharges           | i         | proc settings                                                                                                                                                                                                                                                                      |
| 37-39   | `MaxLevel`, `BaseLevel`, `SpellLevel` (1678-1680)                                                    | same                                            | i         |                                                                                                                                                                                                                                                                                    |
| 40      | `DurationIndex` (1681)                                                                               | DurationIndex                                   | i         | -> SpellDuration.dbc                                                                                                                                                                                                                                                               |
| 41      | `PowerType` (1682)                                                                                   | PowerType                                       | i         | mana/rage/energy/...                                                                                                                                                                                                                                                               |
| 42-45   | `ManaCost`, `ManaCostPerlevel`, `ManaPerSecond`, `ManaPerSecondPerLevel` (1683-1686)                 | same                                            | i         |                                                                                                                                                                                                                                                                                    |
| 46      | `RangeIndex` (1687)                                                                                  | RangeIndex                                      | i         | -> SpellRange.dbc                                                                                                                                                                                                                                                                  |
| 47      | `Speed` (1688)                                                                                       | Speed                                           | f         | missile speed                                                                                                                                                                                                                                                                      |
| 48      | none (`ModalNextSpell` commented, 1689)                                                              | ModalNextSpell                                  | **x**     | modal next spell (spell ID; **UNVERIFIED** semantics)                                                                                                                                                                                                                              |
| 49      | `StackAmount` (1690)                                                                                 | CumulativeAura                                  | i         | max stacks                                                                                                                                                                                                                                                                         |
| 50-51   | `Totem[2]` (1691)                                                                                    | Totem_1..2                                      | i         | required item IDs                                                                                                                                                                                                                                                                  |
| 52-59   | `Reagent[8]` (1692)                                                                                  | Reagent_1..8                                    | i         | **reagent item IDs**                                                                                                                                                                                                                                                               |
| 60-67   | `ReagentCount[8]` (1693)                                                                             | ReagentCount_1..8                               | i         |                                                                                                                                                                                                                                                                                    |
| 68      | `EquippedItemClass` (1694)                                                                           | EquippedItemClass                               | i         | item class required, -1 none                                                                                                                                                                                                                                                       |
| 69      | `EquippedItemSubClassMask` (1695)                                                                    | EquippedItemSubclass                            | i         |                                                                                                                                                                                                                                                                                    |
| 70      | `EquippedItemInventoryTypeMask` (1696)                                                               | EquippedItemInvTypes                            | i         |                                                                                                                                                                                                                                                                                    |
| 71-73   | `Effect[3]` (1697)                                                                                   | Effect_1..3                                     | i         | effect type, `SPELL_EFFECT_*`                                                                                                                                                                                                                                                      |
| 74-76   | `EffectDieSides[3]` (1698)                                                                           | EffectDieSides_1..3                             | i         |                                                                                                                                                                                                                                                                                    |
| 77-79   | `EffectRealPointsPerLevel[3]` (1699)                                                                 | EffectRealPointsPerLevel_1..3                   | f         |                                                                                                                                                                                                                                                                                    |
| 80-82   | `EffectBasePoints[3]` (1700)                                                                         | EffectBasePoints_1..3                           | i         | value is base+1 by convention (**UNVERIFIED** here)                                                                                                                                                                                                                                |
| 83-85   | `EffectMechanic[3]` (1701)                                                                           | EffectMechanic_1..3                             | i         |                                                                                                                                                                                                                                                                                    |
| 86-88   | `EffectImplicitTargetA[3]` (1702)                                                                    | ImplicitTargetA_1..3                            | i         | `TARGET_*`                                                                                                                                                                                                                                                                         |
| 89-91   | `EffectImplicitTargetB[3]` (1703)                                                                    | ImplicitTargetB_1..3                            | i         |                                                                                                                                                                                                                                                                                    |
| 92-94   | `EffectRadiusIndex[3]` (1704)                                                                        | EffectRadiusIndex_1..3                          | i         | -> SpellRadius.dbc                                                                                                                                                                                                                                                                 |
| 95-97   | `EffectApplyAuraName[3]` (1705)                                                                      | EffectAura_1..3                                 | i         | aura type, `SPELL_AURA_*`                                                                                                                                                                                                                                                          |
| 98-100  | `EffectAmplitude[3]` (1706)                                                                          | EffectAuraPeriod_1..3                           | i         | periodic tick (ms)                                                                                                                                                                                                                                                                 |
| 101-103 | `EffectValueMultiplier[3]` (1707)                                                                    | EffectMultipleValue_1..3                        | f         |                                                                                                                                                                                                                                                                                    |
| 104-106 | `EffectChainTarget[3]` (1708)                                                                        | EffectChainTargets_1..3                         | i         |                                                                                                                                                                                                                                                                                    |
| 107-109 | `EffectItemType[3]` (1709)                                                                           | EffectItemType_1..3                             | i         | **item ID created/used by the effect**                                                                                                                                                                                                                                             |
| 110-112 | `EffectMiscValue[3]` (1710)                                                                          | EffectMiscValue_1..3                            | i         | polymorphic: creature entry (summon), GO entry, skill, school, stat... meaning depends on Effect/Aura type                                                                                                                                                                         |
| 113-115 | `EffectMiscValueB[3]` (1711)                                                                         | EffectMiscValueB_1..3                           | i         | polymorphic, e.g. SummonProperties ID for summons                                                                                                                                                                                                                                  |
| 116-118 | `EffectTriggerSpell[3]` (1712)                                                                       | EffectTriggerSpell_1..3                         | i         | **spell -> spell edge**                                                                                                                                                                                                                                                            |
| 119-121 | `EffectPointsPerComboPoint[3]` (1713)                                                                | EffectPointsPerCombo_1..3                       | f         |                                                                                                                                                                                                                                                                                    |
| 122-130 | `EffectSpellClassMask[3]` as `flag96` x3 (1714)                                                      | EffectSpellClassMaskA_1..3, B_1..3, C_1..3      | i x9      | per-effect 96-bit family mask; the server reads it as `[effect][word]`: index = 122 + 3*effect + word (`DBCStructure.h:1714`, used at `src/server/game/Spells/SpellInfo.cpp:349`). The DB column names (A/B/C x 1..3) do not say which axis is which; follow the server's reading. |
| 131-132 | `SpellVisual[2]` (1715)                                                                              | SpellVisualID_1..2                              | i         | -> SpellVisual.dbc                                                                                                                                                                                                                                                                 |
| 133     | `SpellIconID` (1716)                                                                                 | SpellIconID                                     | i         | -> SpellIcon.dbc (not loaded by server)                                                                                                                                                                                                                                            |
| 134     | `ActiveIconID` (1717)                                                                                | ActiveIconID                                    | i         |                                                                                                                                                                                                                                                                                    |
| 135     | `SpellPriority` (1718)                                                                               | SpellPriority                                   | i         |                                                                                                                                                                                                                                                                                    |
| 136-151 | `SpellName[16]` (1719)                                                                               | Name_Lang_* (16)                                | s x16     | name, 16 locale slots                                                                                                                                                                                                                                                              |
| 152     | none (1720)                                                                                          | Name_Lang_Mask                                  | **x**     | locale flags                                                                                                                                                                                                                                                                       |
| 153-168 | `Rank[16]` (1721)                                                                                    | NameSubtext_Lang_*                              | s x16     | rank text ("Rank 3")                                                                                                                                                                                                                                                               |
| 169     | none (1722)                                                                                          | NameSubtext_Lang_Mask                           | **x**     | flags                                                                                                                                                                                                                                                                              |
| 170-185 | none (`Description` commented, 1723)                                                                 | Description_Lang_*                              | **x** x16 | description text (string offsets)                                                                                                                                                                                                                                                  |
| 186     | none (1724)                                                                                          | Description_Lang_Mask                           | **x**     | flags                                                                                                                                                                                                                                                                              |
| 187-202 | none (`ToolTip` commented, 1725)                                                                     | AuraDescription_Lang_*                          | **x** x16 | aura tooltip (string offsets)                                                                                                                                                                                                                                                      |
| 203     | none (1726)                                                                                          | AuraDescription_Lang_Mask                       | **x**     | flags                                                                                                                                                                                                                                                                              |
| 204     | `ManaCostPercentage` (1727)                                                                          | ManaCostPct                                     | i         |                                                                                                                                                                                                                                                                                    |
| 205-206 | `StartRecoveryCategory`, `StartRecoveryTime` (1728-1729)                                             | same                                            | i         | GCD category/time                                                                                                                                                                                                                                                                  |
| 207     | `MaxTargetLevel` (1730)                                                                              | MaxTargetLevel                                  | i         |                                                                                                                                                                                                                                                                                    |
| 208     | `SpellFamilyName` (1731)                                                                             | SpellClassSet                                   | i         | `SPELLFAMILY_*` (mage=3, ...)                                                                                                                                                                                                                                                      |
| 209-211 | `SpellFamilyFlags` (`flag96`, 1732)                                                                  | SpellClassMask_1..3                             | i x3      | 96-bit family flags; matched against `EffectSpellClassMask` of other spells (implicit spell -> spell edges)                                                                                                                                                                        |
| 212     | `MaxAffectedTargets` (1733)                                                                          | MaxTargets                                      | i         |                                                                                                                                                                                                                                                                                    |
| 213     | `DmgClass` (1734)                                                                                    | DefenseType                                     | i         |                                                                                                                                                                                                                                                                                    |
| 214     | `PreventionType` (1735)                                                                              | PreventionType                                  | i         |                                                                                                                                                                                                                                                                                    |
| 215     | none (1736)                                                                                          | StanceBarOrder                                  | **x**     |                                                                                                                                                                                                                                                                                    |
| 216-218 | `EffectDamageMultiplier[3]` (1737)                                                                   | EffectChainAmplitude_1..3                       | f         |                                                                                                                                                                                                                                                                                    |
| 219-221 | none (1738-1740)                                                                                     | MinFactionID, MinReputation, RequiredAuraVision | **x** x3  | **faction requirement is here, server ignores it**                                                                                                                                                                                                                                 |
| 222-223 | `TotemCategory[2]` (1741)                                                                            | RequiredTotemCategoryID_1..2                    | i         | -> TotemCategory.dbc                                                                                                                                                                                                                                                               |
| 224     | `AreaGroupId` (1742)                                                                                 | RequiredAreasID                                 | i         | -> AreaGroup.dbc                                                                                                                                                                                                                                                                   |
| 225     | `SchoolMask` (1743)                                                                                  | SchoolMask                                      | i         |                                                                                                                                                                                                                                                                                    |
| 226     | `RuneCostID` (1744)                                                                                  | RuneCostID                                      | i         | -> SpellRuneCost.dbc                                                                                                                                                                                                                                                               |
| 227     | none (1745)                                                                                          | SpellMissileID                                  | **x**     |                                                                                                                                                                                                                                                                                    |
| 228     | none (1746)                                                                                          | PowerDisplayID                                  | **x**     | -> PowerDisplay.dbc                                                                                                                                                                                                                                                                |
| 229-231 | `EffectBonusMultiplier[3]` (1747)                                                                    | EffectBonusMultiplier_1..3                      | f         |                                                                                                                                                                                                                                                                                    |
| 232     | none (1748)                                                                                          | SpellDescriptionVariableID                      | **x**     |                                                                                                                                                                                                                                                                                    |
| 233     | none (1749)                                                                                          | SpellDifficultyID                               | **x**     | -> SpellDifficulty.dbc                                                                                                                                                                                                                                                             |

Skill/class links for a spell are **not in Spell.dbc**. They come from SkillLineAbility (spell -> skill line + race/class masks), SkillLine, Talent/TalentTab (talent -> spell ranks, tab -> class mask) and `SpellFamilyName` (class family). Note the struct comments in `DBCStructure.h:1655-1657` give file indices 12/14/16 for consecutive members; that matches the `x` gaps at 13 and 15.

**SkillLineAbility.dbc** (`DBCfmt.h:100`): `char constexpr SkillLineAbilityfmt[] = "niiiixxiiiiixx";`
Kept: 0n 1i 2i 3i 4i 7i 8i 9i 10i 11i. Struct `DBCStructure.h:1597-1612`:

```cpp
struct SkillLineAbilityEntry
{
    uint32 ID;                                              // 0
    uint32 SkillLine;                                       // 1
    uint32 Spell;                                           // 2
    uint32 RaceMask;                                        // 3
    uint32 ClassMask;                                       // 4
    //uint32 ExcludeRace;                                   // 5
    //uint32 ExcludeClass;                                  // 6
    uint32 MinSkillLineRank;                                // 7
    uint32 SupercededBySpell;                               // 8
    uint32 AcquireMethod;                                   // 9
    uint32 TrivialSkillLineRankHigh;                        // 10
    uint32 TrivialSkillLineRankLow;                         // 11
    //uint32 CharacterPoints[2];                            // 12-13
};
```

**SkillLine.dbc** (`DBCfmt.h:99`): `char constexpr SkillLinefmt[] = "nixssssssssssssssssxxxxxxxxxxxxxxxxxxixxxxxxxxxxxxxxxxxi";`
Kept: 0n 1i 3-18s 37i 55i. Struct `DBCStructure.h:1582-1595`:

```cpp
struct SkillLineEntry
{
    uint32    id;                                           // 0        m_ID
    int32     categoryId;                                   // 1        m_categoryID
    //uint32    skillCostID;                                // 2        m_skillCostsID
    char const*     name[16];                               // 3-18     m_displayName_lang
    // 19 string flags
    //char const*     description[16];                      // 20-35    m_description_lang
    // 36 string flags
    uint32    spellIcon;                                    // 37       m_spellIconID
    //char const*     alternateVerb[16];                    // 38-53    m_alternateVerb_lang
    // 54 string flags
    uint32    canLink;                                      // 55       m_canLink (prof. with recipes
};
```

**Talent.dbc** (`DBCfmt.h:119`): `char constexpr TalentEntryfmt[] = "niiiiiiiixxxxixxixxixxx";`
Kept: 0n 1-8i 13i 16i 19i. Struct `DBCStructure.h:1922-1937`:

```cpp
struct TalentEntry
{
    uint32    TalentID;                                     // 0
    uint32    TalentTab;                                    // 1 index in TalentTab.dbc (TalentTabEntry)
    uint32    Row;                                          // 2
    uint32    Col;                                          // 3
    std::array<uint32, MAX_TALENT_RANK> RankID;             // 4-8
    // uint32 spellRank [4]                                 // 9-12 not used, always 0, maybe not used high ranks
    uint32    DependsOn;                                    // 13 preReqTalent1 index in Talent.dbc (TalentEntry)
    // uint32 preReqTalent[2]                               // 14-15 not used
    uint32    DependsOnRank;                                // 16 preReqRank1
    // uint32 preReqRank[2]                                 // 17-18 not used
    uint32    addToSpellBook;                               // 19  also need disable higest ranks on reset talent tree
    //uint32  requiredSpellID;                              // 20, all 0
    //uint64  categoryMask[2];                              // 21-22 its a 64 bit mask for pet 1<<m_categoryEnumID in CreatureFamily.dbc
};
```

`RankID[0..4]` (file 4-8) are spell IDs: the talent -> spell edges.

**TalentTab.dbc** (`DBCfmt.h:120`): `char constexpr TalentTabEntryfmt[] = "nxxxxxxxxxxxxxxxxxxxiiix";`
Kept: 0n 20i 21i 22i. The tab name (1-16), name flags (17), SpellIconID (18) and internal name (23) are all skipped; Canvas needs to read them from the file. Struct `DBCStructure.h:1939-1950`:

```cpp
struct TalentTabEntry
{
    uint32  TalentTabID;                                    // 0
    //char const* name[16];                                 // 1-16, unused
    //uint32  nameFlags;                                    // 17, unused
    //unit32  spellicon;                                    // 18
    // 19 not used
    uint32  ClassMask;                                      // 20
    uint32  petTalentMask;                                  // 21
    uint32  tabpage;                                        // 22
    //char const* internalname;                             // 23
};
```

**ChrClasses.dbc** (`DBCfmt.h:34`): `char constexpr ChrClassesEntryfmt[] = "nxixssssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxixii";`
Kept: 0n 2i 4-19s 56i 58i 59i. Struct `DBCStructure.h:652-669`:

```cpp
struct ChrClassesEntry
{
    uint32  ClassID;                                        // 0
    // 1, unused
    uint32  powerType;                                      // 2
    // 3-4, unused
    char const*       name[16];                             // 5-20 unused
    // 21 string flag, unused
    //char const*       nameFemale[16];                     // 21-36 unused, if different from base (male) case
    // 37 string flag, unused
    //char const*       nameNeutralGender[16];              // 38-53 unused, if different from base (male) case
    // 54 string flag, unused
    // 55, unused
    uint32  spellfamily;                                    // 56
    // 57, unused
    uint32  CinematicSequence;                              // 58 id from CinematicSequences.dbc
    uint32  expansion;                                      // 59 (0 - original race, 1 - tbc addon, ...)
};
```

**Discrepancy:** the comment says `name` is at 5-20; the format string puts the 16 `s` at **4-19** and the flags `x` at 20. The format string wins (it is size-checked at `DBCStores.cpp:216`). Use format-derived indices, not struct comments.

**ChrRaces.dbc** (`DBCfmt.h:35`): `char constexpr ChrRacesEntryfmt[] = "niixiixixxxxiissssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxi";`
Kept: 0n 1i 2i 4i 5i 7i 12i 13i 14-29s 68i. Struct `DBCStructure.h:678-701`:

```cpp
struct ChrRacesEntry
{
    uint32      RaceID;                                     // 0
    uint32      Flags;                                      // 1
    uint32      FactionID;                                  // 2 facton template id
    // 3 unused
    uint32      model_m;                                    // 4
    uint32      model_f;                                    // 5
    // 6 unused
    uint32      TeamID;                                     // 7 (7-Alliance 1-Horde)
    // 8-11 unused
    uint32      CinematicSequence;                          // 12 id from CinematicSequences.dbc
    uint32      alliance;                                   // 13 faction (0 alliance, 1 horde, 2 not available?)
    char const* name[16];                                   // 14-29 used for DBC language detection/selection
    // 30 string flags, unused
    //char const*       nameFemale[16];                     // 31-46, if different from base (male) case
    // 47 string flags, unused
    //char const*       nameNeutralGender[16];              // 48-63, if different from base (male) case
    // 64 string flags, unused
    // 65-67 unused
    uint32      expansion;                                  // 68 (0 - original race, 1 - tbc addon, ...)

    inline bool HasFlag(ChrRacesFlags flag) const { return (Flags & flag) != 0; }
};
```

**SpellCastTimes.dbc** (`DBCfmt.h:104`): `char constexpr SpellCastTimefmt[] = "nixx";` Struct `DBCStructure.h:1757-1763`:

```cpp
struct SpellCastTimesEntry
{
    uint32    ID;                                           // 0
    int32     CastTime;                                     // 1
    //float     CastTimePerLevel;                           // 2 unsure / per skill?
    //int32     MinCastTime;                                // 3 unsure
};
```

**SpellDuration.dbc** (`DBCfmt.h:107`): `char constexpr SpellDurationfmt[] = "niii";` Struct `DBCStructure.h:1832-1836`:

```cpp
struct SpellDurationEntry
{
    uint32    ID;
    int32     Duration[3];
};
```

**SpellRange.dbc** (`DBCfmt.h:113`): `char constexpr SpellRangefmt[] = "nffffixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";` Struct `DBCStructure.h:1792-1802`:

```cpp
struct SpellRangeEntry
{
    uint32 ID;          // 0
    float  RangeMin[2]; // 1-2 [0] Hostile [1] Friendly
    float  RangeMax[2]; // 3-4 [0] Hostile [1] Friendly
    uint32 Flags;       // 5
    // char const* DisplayName[16];                          // 6-21
    // uint32 DisplayName_lang_mask;                         // 22
    // char const* DisplayNameShort[16];                     // 23-38
    // uint32 DisplayNameShort_lang_mask;                    // 39
};
```

The range display names are `x` (strings the tool must read itself).

**SpellRadius.dbc** (`DBCfmt.h:112`): `char constexpr SpellRadiusfmt[] = "nfff";` Struct `DBCStructure.h:1784-1790`:

```cpp
struct SpellRadiusEntry
{
    uint32    ID;
    float     RadiusMin;
    float     RadiusPerLevel;
    float     RadiusMax;
};
```

**SpellItemEnchantment.dbc** (`DBCfmt.h:110`): `char constexpr SpellItemEnchantmentfmt[] = "niiiiiiixxxiiissssssssssssssssxiiiiiii";`
Kept: 0n 1-7i 11-13i 14-29s 31-37i. Struct `DBCStructure.h:1840-1857`:

```cpp
struct SpellItemEnchantmentEntry
{
    uint32      ID;                                             // 0        m_ID
    uint32      charges;                                        // 1        m_charges
    uint32      type[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS];       // 2-4      m_effect[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS]
    uint32      amount[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS];     // 5-7      m_effectPointsMin[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS]
    //uint32      amount2[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS]   // 8-10     m_effectPointsMax[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS]
    uint32      spellid[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS];    // 11-13    m_effectArg[MAX_SPELL_ITEM_ENCHANTMENT_EFFECTS]
    char const*       description[16];                          // 14-29    m_name_lang[16]
    //uint32      descriptionFlags;                             // 30 name flags
    uint32      aura_id;                                        // 31       m_itemVisual
    uint32      slot;                                           // 32       m_flags
    uint32      GemID;                                          // 33       m_src_itemID
    uint32      EnchantmentCondition;                           // 34       m_condition_id
    uint32      requiredSkill;                                  // 35       m_requiredSkillID
    uint32      requiredSkillValue;                             // 36       m_requiredSkillRank
    uint32      requiredLevel;                                  // 37       m_requiredLevel
};
```

`spellid[]` (11-13) is an enchant -> spell edge (for proc/equip enchant types); `GemID` an enchant -> item edge. Spells point to enchants via `EffectMiscValue` of `SPELL_EFFECT_ENCHANT_ITEM*` effects (polymorphic, see 1.2 table).

**ItemDisplayInfo.dbc** (`DBCfmt.h:73`): `char constexpr ItemDisplayTemplateEntryfmt[] = "nxxxxsxxxxxxxxxxxxxxxxxxx";`
Kept: 0n, 5s only. Struct `DBCStructure.h:1161-1175`:

```cpp
struct ItemDisplayInfoEntry
{
    uint32      ID;                                         // 0        m_ID
    // 1        m_modelName[2]
    // 2        m_modelTexture[2]
    char const*       inventoryIcon;                        // 3        m_inventoryIcon
    // 4        m_geosetGroup[3]
    // 5        m_flags
    // 6        m_spellVisualID
    // 7        m_groupSoundIndex
    // 8        m_helmetGeosetVis[2]
    // 9        m_texture[2]
    // 10       m_itemVisual[8]
    // 11       m_particleColorID
};
```

The comments number _logical_ columns (arrays count once). In file indices, `inventoryIcon` is field **5** (after modelName[2] at 1-2 and modelTexture[2] at 3-4); the rest of the 25 fields are skipped.

**Item.dbc** (loaded; `DBCfmt.h:71`): `char constexpr Itemfmt[] = "niiiiiii";` Struct `DBCStructure.h:1142-1152`:

```cpp
struct ItemEntry
{
    uint32 ID;                                               // 0
    uint32 ClassID;                                          // 1
    uint32 SubclassID;                                       // 2
    int32 SoundOverrideSubclassID;                           // 3
    int32 Material;                                          // 4
    uint32 DisplayInfoID;                                    // 5
    uint32 InventoryType;                                    // 6
    uint32 SheatheType;                                      // 7
};
```

Note: the server's real item definitions are the world-DB `item_template` table (`src/server/game/Globals/ObjectMgr.cpp:3350`); Item.dbc is the client-side subset.

**SkillRaceClassInfo.dbc** (`DBCfmt.h:101`): `char constexpr SkillRaceClassInfofmt[] = "diiiixix";`
Index 0 is `d` (indexed, not stored). Struct `DBCStructure.h:1568-1578`:

```cpp
struct SkillRaceClassInfoEntry
{
    //uint32 ID;                                            // 0
    uint32 SkillID;                                         // 1
    uint32 RaceMask;                                        // 2
    uint32 ClassMask;                                       // 3
    uint32 Flags;                                           // 4
    //uint32 MinLevel;                                      // 5
    uint32 SkillTierID;                                     // 6
    //uint32 SkillCostIndex;                                // 7
};
```

**SpellCategory.dbc** (`DBCfmt.h:105`): `char constexpr SpellCategoryfmt[] = "ni";` Struct `DBCStructure.h:1765-1769`:

```cpp
struct SpellCategoryEntry
{
    uint32 Id;
    uint32 Flags;
};
```

**SpellVisual.dbc** (`DBCfmt.h:116`): `char constexpr SpellVisualfmt[] = "dxxxxxxiixxxxxxxxxxxxxxxxxxxxxxx";`
Kept: 0d (index only), 7i, 8i. Struct `DBCStructure.h:1870-1900` keeps only `HasMissile` and `MissileModel`; everything else (kits, sounds) is commented out and skipped:

```cpp
struct SpellVisualEntry
{
    //uint32 Id;
    //uint32 PrecastKit;
    //uint32 CastingKit;
    //uint32 ImpactKit;
    //uint32 StateKit;
    //uint32 StateDoneKit;
    //uint32 ChannelKit;
    uint32 HasMissile;
    int32 MissileModel;
    //uint32 MissilePathType;
    //uint32 MissileDestinationAttachment;
    //uint32 MissileSound;
    //uint32 AnimEventSoundID;
    //uint32 Flags;
    //uint32 CasterImpactKit;
    //uint32 TargetImpactKit;
    //int32 MissileAttachment;
    //uint32 MissileFollowGroundHeight;
    //uint32 MissileFollowGroundDropSpeed;
    //uint32 MissileFollowGroundApprach;
    //uint32 MissileFollowGroundFlags;
    //uint32 MissileMotionId;
    //uint32 MissileTargetingKit;
    //uint32 InstantAreaKit;
    //uint32 ImpactAreaKit;
    //uint32 PersistentAreaKit;
    //DBCPosition3D MissileCastOffset;
    //DBCPosition3D MissileImpactOffset;
};
```

**SpellIcon.dbc and CharBaseInfo.dbc: NOT loaded by the server.** There is no format string, struct or `LOAD_DBC` for either (search of `DBCfmt.h`, `DBCStores.cpp`, `DBCStores.h` finds none). Canvas must define their layouts itself; those layouts are **UNVERIFIED** from this checkout. The server still matches on raw `SpellIconID` values in code, e.g. `src/server/game/Entities/Player/Player.cpp:10226`, `src/server/game/Entities/Unit/Unit.cpp:8577`, `src/server/scripts/Spells/spell_mage.cpp:564`, and the `MageSpellIcons` enum (`spell_mage.cpp:77-83`).

### 1.3 DBC files the server loads, and from where

- Path: config key `DataDir` (`src/server/game/World/World.cpp:264`, default `"./"`; shipped value `DataDir = "."` at `src/server/apps/worldserver/worldserver.conf.dist:185`), a trailing slash is added (`World.cpp:265-266`), then `dbcPath = dataPath + "dbc/"` (`src/server/game/DataStores/DBCStores.cpp:265`).
- Each file is loaded as `dbc/<File>.dbc`, then each locale variant `dbc/<locale>/<File>.dbc` is tried for strings (`DBCStores.cpp:222-236`), then the world-DB table override is applied (`DBCStores.cpp:239-240`).
- Macro: `#define LOAD_DBC(store, file, dbtable) LoadDBC(availableDbcLocales, bad_dbc_files, store, dbcPath, file, dbtable)` (`DBCStores.cpp:270`).
- Missing/incompatible files are fatal (`exit(1)`, `DBCStores.cpp:624-637`), and a version check requires specific 3.3.5a IDs (e.g. `sSpellStore.LookupEntry(80864)`, `DBCStores.cpp:640-649`).

110 active `LOAD_DBC` calls, `DBCStores.cpp:272-383` (file -> DB override table). Two are commented out: `gtOCTRegenMP.dbc` (`:318`), `ItemCondExtCosts.dbc` (`:325`).

| Line | DBC file                         | DB table                         | Line | DBC file                          | DB table                          |
| ---- | -------------------------------- | -------------------------------- | ---- | --------------------------------- | --------------------------------- |
| 272  | AreaTable.dbc                    | areatable_dbc                    | 328  | ItemRandomProperties.dbc          | itemrandomproperties_dbc          |
| 273  | Achievement.dbc                  | achievement_dbc                  | 329  | ItemRandomSuffix.dbc              | itemrandomsuffix_dbc              |
| 274  | Achievement_Category.dbc         | achievement_category_dbc         | 330  | ItemSet.dbc                       | itemset_dbc                       |
| 275  | Achievement_Criteria.dbc         | achievement_criteria_dbc         | 331  | LFGDungeons.dbc                   | lfgdungeons_dbc                   |
| 276  | AreaGroup.dbc                    | areagroup_dbc                    | 332  | Light.dbc                         | light_dbc                         |
| 277  | AreaPOI.dbc                      | areapoi_dbc                      | 333  | LiquidType.dbc                    | liquidtype_dbc                    |
| 278  | AuctionHouse.dbc                 | auctionhouse_dbc                 | 334  | Lock.dbc                          | lock_dbc                          |
| 279  | BankBagSlotPrices.dbc            | bankbagslotprices_dbc            | 335  | MailTemplate.dbc                  | mailtemplate_dbc                  |
| 280  | BattlemasterList.dbc             | battlemasterlist_dbc             | 336  | Map.dbc                           | map_dbc                           |
| 281  | BarberShopStyle.dbc              | barbershopstyle_dbc              | 337  | MapDifficulty.dbc                 | mapdifficulty_dbc                 |
| 282  | CharStartOutfit.dbc              | charstartoutfit_dbc              | 338  | Movie.dbc                         | movie_dbc                         |
| 283  | CharTitles.dbc                   | chartitles_dbc                   | 339  | NamesReserved.dbc                 | namesreserved_dbc                 |
| 284  | ChatChannels.dbc                 | chatchannels_dbc                 | 340  | NamesProfanity.dbc                | namesprofanity_dbc                |
| 285  | ChrClasses.dbc                   | chrclasses_dbc                   | 341  | OverrideSpellData.dbc             | overridespelldata_dbc             |
| 286  | ChrRaces.dbc                     | chrraces_dbc                     | 342  | PowerDisplay.dbc                  | powerdisplay_dbc                  |
| 287  | CinematicCamera.dbc              | cinematiccamera_dbc              | 343  | PvpDifficulty.dbc                 | pvpdifficulty_dbc                 |
| 288  | CinematicSequences.dbc           | cinematicsequences_dbc           | 344  | QuestXP.dbc                       | questxp_dbc                       |
| 289  | CreatureDisplayInfo.dbc          | creaturedisplayinfo_dbc          | 345  | QuestFactionReward.dbc            | questfactionreward_dbc            |
| 290  | CreatureDisplayInfoExtra.dbc     | creaturedisplayinfoextra_dbc     | 346  | QuestSort.dbc                     | questsort_dbc                     |
| 291  | CreatureFamily.dbc               | creaturefamily_dbc               | 347  | RandPropPoints.dbc                | randproppoints_dbc                |
| 292  | CreatureModelData.dbc            | creaturemodeldata_dbc            | 348  | ScalingStatDistribution.dbc       | scalingstatdistribution_dbc       |
| 293  | CreatureSpellData.dbc            | creaturespelldata_dbc            | 349  | ScalingStatValues.dbc             | scalingstatvalues_dbc             |
| 294  | CreatureType.dbc                 | creaturetype_dbc                 | 350  | SkillLine.dbc                     | skillline_dbc                     |
| 295  | CurrencyTypes.dbc                | currencytypes_dbc                | 351  | SkillLineAbility.dbc              | skilllineability_dbc              |
| 296  | DestructibleModelData.dbc        | destructiblemodeldata_dbc        | 352  | SkillRaceClassInfo.dbc            | skillraceclassinfo_dbc            |
| 297  | DungeonEncounter.dbc             | dungeonencounter_dbc             | 353  | SkillTiers.dbc                    | skilltiers_dbc                    |
| 298  | DurabilityCosts.dbc              | durabilitycosts_dbc              | 354  | SoundEntries.dbc                  | soundentries_dbc                  |
| 299  | DurabilityQuality.dbc            | durabilityquality_dbc            | 355  | Spell.dbc                         | spell_dbc                         |
| 300  | Emotes.dbc                       | emotes_dbc                       | 356  | SpellCastTimes.dbc                | spellcasttimes_dbc                |
| 301  | EmotesText.dbc                   | emotestext_dbc                   | 357  | SpellCategory.dbc                 | spellcategory_dbc                 |
| 302  | Faction.dbc                      | faction_dbc                      | 358  | SpellDifficulty.dbc               | spelldifficulty_dbc               |
| 303  | FactionTemplate.dbc              | factiontemplate_dbc              | 359  | SpellDuration.dbc                 | spellduration_dbc                 |
| 304  | GameObjectArtKit.dbc             | gameobjectartkit_dbc             | 360  | SpellFocusObject.dbc              | spellfocusobject_dbc              |
| 305  | GameObjectDisplayInfo.dbc        | gameobjectdisplayinfo_dbc        | 361  | SpellItemEnchantment.dbc          | spellitemenchantment_dbc          |
| 306  | GemProperties.dbc                | gemproperties_dbc                | 362  | SpellItemEnchantmentCondition.dbc | spellitemenchantmentcondition_dbc |
| 307  | GlyphProperties.dbc              | glyphproperties_dbc              | 363  | SpellRadius.dbc                   | spellradius_dbc                   |
| 308  | GlyphSlot.dbc                    | glyphslot_dbc                    | 364  | SpellRange.dbc                    | spellrange_dbc                    |
| 309  | gtBarberShopCostBase.dbc         | gtbarbershopcostbase_dbc         | 365  | SpellRuneCost.dbc                 | spellrunecost_dbc                 |
| 310  | gtCombatRatings.dbc              | gtcombatratings_dbc              | 366  | SpellShapeshiftForm.dbc           | spellshapeshiftform_dbc           |
| 311  | gtChanceToMeleeCritBase.dbc      | gtchancetomeleecritbase_dbc      | 367  | SpellVisual.dbc                   | spellvisual_dbc                   |
| 312  | gtChanceToMeleeCrit.dbc          | gtchancetomeleecrit_dbc          | 368  | StableSlotPrices.dbc              | stableslotprices_dbc              |
| 313  | gtChanceToSpellCritBase.dbc      | gtchancetospellcritbase_dbc      | 369  | SummonProperties.dbc              | summonproperties_dbc              |
| 314  | gtChanceToSpellCrit.dbc          | gtchancetospellcrit_dbc          | 370  | Talent.dbc                        | talent_dbc                        |
| 315  | gtNPCManaCostScaler.dbc          | gtnpcmanacostscaler_dbc          | 371  | TalentTab.dbc                     | talenttab_dbc                     |
| 316  | gtOCTClassCombatRatingScalar.dbc | gtoctclasscombatratingscalar_dbc | 372  | TaxiNodes.dbc                     | taxinodes_dbc                     |
| 317  | gtOCTRegenHP.dbc                 | gtoctregenhp_dbc                 | 373  | TaxiPath.dbc                      | taxipath_dbc                      |
| 319  | gtRegenHPPerSpt.dbc              | gtregenhpperspt_dbc              | 374  | TaxiPathNode.dbc                  | taxipathnode_dbc                  |
| 320  | gtRegenMPPerSpt.dbc              | gtregenmpperspt_dbc              | 375  | TeamContributionPoints.dbc        | teamcontributionpoints_dbc        |
| 321  | Holidays.dbc                     | holidays_dbc                     | 376  | TotemCategory.dbc                 | totemcategory_dbc                 |
| 322  | Item.dbc                         | item_dbc                         | 377  | TransportAnimation.dbc            | transportanimation_dbc            |
| 323  | ItemBagFamily.dbc                | itembagfamily_dbc                | 378  | TransportRotation.dbc             | transportrotation_dbc             |
| 324  | ItemDisplayInfo.dbc              | itemdisplayinfo_dbc              | 379  | Vehicle.dbc                       | vehicle_dbc                       |
| 326  | ItemExtendedCost.dbc             | itemextendedcost_dbc             | 380  | VehicleSeat.dbc                   | vehicleseat_dbc                   |
| 327  | ItemLimitCategory.dbc            | itemlimitcategory_dbc            | 381  | WMOAreaTable.dbc                  | wmoareatable_dbc                  |
|      |                                  |                                  | 382  | WorldMapArea.dbc                  | worldmaparea_dbc                  |
|      |                                  |                                  | 383  | WorldMapOverlay.dbc               | worldmapoverlay_dbc               |

### 1.4 Localized string layout

- In every localized DBC the server reads a localized string as **16 consecutive `s` fields followed by one `x` (the flags/mask uint32)**: 17 fields, 68 bytes. Examples: Spell `SpellName` 136-151 + flags 152 (`DBCfmt.h:108`, `DBCStructure.h:1719-1720`); SkillLine `name` 3-18 + flags 19 (`DBCStructure.h:1587-1588`).
- The slot index is `LocaleConstant` (verbatim, `src/common/Common.h:124-137`):

```cpp
enum LocaleConstant
{
    LOCALE_enUS = 0,
    LOCALE_koKR = 1,
    LOCALE_frFR = 2,
    LOCALE_deDE = 3,
    LOCALE_zhCN = 4,
    LOCALE_zhTW = 5,
    LOCALE_esES = 6,
    LOCALE_esMX = 7,
    LOCALE_ruRU = 8,

    TOTAL_LOCALES
};
```

**enUS is slot 0.** Names array: `src/common/Common.cpp:20-31`. Code indexes as `spellInfo->SpellName[locale]` (`src/server/scripts/Commands/cs_lookup.cpp:1027`). Slots 9-15 are never indexed by the server (`TOTAL_LOCALES` = 9).

- Multiple locales: after the base file, `dbc/<localeName>/<File>.dbc` is loaded for each of the 9 locales (`DBCStores.cpp:224-236`), and `AutoProduceStrings` fills **only slots that are still empty** (`DBCFileLoader.cpp:306-312`). So the first file with a non-empty string for a slot wins.
- **Conflict to know about:** the world-DB override tables label the 16 slots in a different order: `Name_Lang_enUS, enGB, koKR, frFR, deDE, enCN, zhCN, enTW, zhTW, esES, esMX, ruRU, ptPT, ptBR, itIT, Unk`, then `Name_Lang_Mask` (`data/sql/base/db_world/spell_dbc.sql:160-176`). The loader maps columns to slots purely by position (`src/server/shared/DataStores/DBCDatabaseLoader.cpp:87-118`), so DB column 2 ("enGB") lands in server slot 1 (koKR). Only slot 0 (enUS) agrees. Canvas should label slots by the server enum and treat the DB column names as cosmetic. Which order the 3.3.5a client itself uses for slots 1-15 is **UNVERIFIED** here.

### 1.5 Server-side overrides of DBC data

Four layers change DBC data after it is read. Canvas has to model all four to show "what the server actually uses".

**(a) `<name>_dbc` world-DB tables: whole-row override or addition, for every loaded DBC.**

- Each `LOAD_DBC` passes a table name (table in 1.3). `DBCDatabaseLoader::Load` runs ``SELECT * FROM `{}` ORDER BY `ID` DESC`` (`src/server/shared/DataStores/DBCDatabaseLoader.cpp:42`).
- Rows **replace** a DBC record with the same ID or **add** a new one; the index table grows if needed (`DBCDatabaseLoader.cpp:58-66`, `:79-81`, `:127-131`).
- Columns are consumed one per format character, **including `x` columns** (`sqlColumnNumber` increments for every char, `DBCDatabaseLoader.cpp:87-118`). The column count must equal the format length (`:120`). So the DB table mirrors the full file layout, e.g. `spell_dbc` has 234 columns (`data/sql/base/db_world/spell_dbc.sql:24-257`).
- The base world DB already ships override rows: the snapshot `spell_dbc.sql` has 4491 rows (count of `^(` lines). Module SQL also writes these tables: `mod-transmog` inserts spell 200100 (`modules/mod-transmog/data/sql/db-world/trasm_world_NPC.sql:47-49`).
- If the DBC file is missing but the DB has rows, loading still succeeds (`DBCStores.cpp:239-243`).

**(b) `SpellMgr::LoadSpellInfoStore`**: builds a `SpellInfo` object per `SpellEntry` (`src/server/game/Spells/SpellMgr.cpp:3022-3051`). `SpellInfo` is the runtime copy that all later layers mutate. Load order (`src/server/game/World/World.cpp:404-429`): `LoadSpellInfoStore` -> `LoadSpellCooldownOverrides` -> `LoadSpellInfoCorrections` -> `LoadSpellRanks` -> `LoadSpellSpecificAndAuraState` -> `LoadSkillLineAbilityMap` -> `LoadSpellInfoCustomAttributes` -> `LoadSpellJumpDistances` -> `LoadSpellInfoImmunities`.

**(c) Hardcoded corrections, `SpellMgr::LoadSpellInfoCorrections`** (`src/server/game/Spells/SpellInfoCorrections.cpp:39-5429`, 5429-line file).

- Helper (verbatim, `SpellInfoCorrections.cpp:24-37`):

```cpp
inline void ApplySpellFix(std::initializer_list<uint32> spellIds, void(*fix)(SpellInfo*))
{
    for (uint32 spellId : spellIds)
    {
        SpellInfo const* spellInfo = sSpellMgr->GetSpellInfo(spellId);
        if (!spellInfo)
        {
            LOG_ERROR("sql.sql", "Spell info correction specified for non-existing spell {}", spellId);
            continue;
        }

        fix(const_cast<SpellInfo*>(spellInfo));
    }
}
```

- 729 lines contain `ApplySpellFix(`. Typical shape (`SpellInfoCorrections.cpp:67-70`):

```cpp
    // Has Brewfest Mug
    ApplySpellFix({ 42533 }, [](SpellInfo* spellInfo)
    {
        spellInfo->DurationEntry = sSpellDurationStore.LookupEntry(347); // 15 min
    });
```

Changes include attribute bits (`:57`), interrupt flags (`:63`), duration/range/radius/cast-time/category entries (`:69`, `:149`, `:141`, `:1608`, `:3437`), mana costs (`:75-76`).

- After the per-spell fixes there are whole-store loops (`:5247-5330`, e.g. trigger-spell propagation at `:5279-5290`) and **direct mutations of non-spell DBC stores**: AreaTable (`:5331-5332`), SummonProperties 121/647/628 (`:5342-5346`), CreatureDisplayInfo 17028 (`:5353`), Faction 1104/1105 (`:5357-5359`), FactionTemplate 1978/1921 (`:5363-5365`), VehicleSeat (`:5369-5412`), Achievement 4539 `mapID = 631` (`:5415-5416`), graveyards 1364/1365 (`:5419-5422`), Lock 36 (`:5424-5425`).
- **For Canvas these are bindings**: C++ code -> spell ID (or other DBC ID) -> field changed. A scanner can extract them statically by parsing every `ApplySpellFix({ ids }, lambda)` call (IDs are integer literals, often with a trailing name comment) and every `const_cast<XEntry*>(sXStore.LookupEntry(N))`.

**(d) `spell_custom_attr` and computed custom attributes, `SpellMgr::LoadSpellInfoCustomAttributes`** (`SpellMgr.cpp:3166`).

- DB: `SELECT spell_id, attributes FROM spell_custom_attr` (`SpellMgr.cpp:3172`); ORs `SPELL_ATTR0_CU_*` bits into `SpellInfo::AttributesCu`. The base snapshot has 413 rows (`data/sql/base/db_world/spell_custom_attr.sql`).
- The same function also computes attributes from effects/auras and has hardcoded spell-ID `switch` cases (e.g. `case 44801:` at `SpellMgr.cpp:3277`).
- It calls the module hook `sScriptMgr->OnLoadSpellCustomAttr(spellInfo)` (`SpellMgr.cpp:3583`), which dispatches to `GlobalScript::OnLoadSpellCustomAttr` (`src/server/game/Scripting/ScriptDefines/GlobalScript.cpp:97-99`). So **modules can rewrite any SpellInfo at load time** through a GlobalScript. Canvas can only detect this heuristically (a `GlobalScript` that overrides `OnLoadSpellCustomAttr`, then the spell IDs it compares against).

Other spell-shaping DB tables loaded by SpellMgr are listed in 2.11.

---

## Part 2: C++ script registration

### 2.6 Registration macros and the templates behind them

All verbatim.

Spell scripts, `src/server/game/Scripting/ScriptDefines/SpellScriptLoader.h`:

```cpp
class SpellScriptLoader : public ScriptObject
{
protected:
    SpellScriptLoader(char const* name);

public:
    [[nodiscard]] bool IsDatabaseBound() const override { return true; }

    // Should return a fully valid SpellScript pointer.
    [[nodiscard]] virtual SpellScript* GetSpellScript() const { return nullptr; }

    // Should return a fully valid AuraScript pointer.
    [[nodiscard]] virtual AuraScript* GetAuraScript() const { return nullptr; }
};
```

(`:25-38`). `GenericSpellAndAuraScriptLoader<Ts...>` picks the SpellScript subclass, the AuraScript subclass and an argument tuple out of its template parameters and constructs them with the tuple (`:49-85`). Macros (`:87-90`):

```cpp
#define RegisterSpellScriptWithArgs(spell_script, script_name, ...) new GenericSpellAndAuraScriptLoader<spell_script, decltype(std::make_tuple(__VA_ARGS__))>(script_name, std::make_tuple(__VA_ARGS__))
#define RegisterSpellScript(spell_script) RegisterSpellScriptWithArgs(spell_script, #spell_script)
#define RegisterSpellAndAuraScriptPairWithArgs(script_1, script_2, script_name, ...) new GenericSpellAndAuraScriptLoader<script_1, script_2, decltype(std::make_tuple(__VA_ARGS__))>(script_name, std::make_tuple(__VA_ARGS__))
#define RegisterSpellAndAuraScriptPair(script_1, script_2) RegisterSpellAndAuraScriptPairWithArgs(script_1, script_2, #script_1)
```

A commented-out duplicate of this block exists at `SpellScriptLoader.h:92-142`; a scanner must skip `//` lines.

Creature AI, `src/server/game/Scripting/ScriptDefines/CreatureScript.h:63-81`:

```cpp
template <class AI>
class GenericCreatureScript : public CreatureScript
{
public:
    GenericCreatureScript(char const* name) : CreatureScript(name) { }
    CreatureAI* GetAI(Creature* me) const override { return new AI(me); }
};

#define RegisterCreatureAI(ai_name) new GenericCreatureScript<ai_name>(#ai_name)

template <class AI, AI*(*AIFactory)(Creature*)>
class FactoryCreatureScript : public CreatureScript
{
public:
    FactoryCreatureScript(char const* name) : CreatureScript(name) { }
    CreatureAI* GetAI(Creature* me) const override { return AIFactory(me); }
};

#define RegisterCreatureAIWithFactory(ai_name, factory_fn) new FactoryCreatureScript<ai_name, &factory_fn>(#ai_name)
```

GameObject AI, `src/server/game/Scripting/ScriptDefines/GameObjectScript.h:69-86`:

```cpp
template <class AI>
class GenericGameObjectScript : public GameObjectScript
{
public:
    GenericGameObjectScript(char const* name) : GameObjectScript(name) { }
    GameObjectAI* GetAI(GameObject* go) const override { return new AI(go); }
};

#define RegisterGameObjectAI(ai_name) new GenericGameObjectScript<ai_name>(#ai_name)

template <class AI, AI* (*AIFactory)(GameObject*)> class FactoryGameObjectScript : public GameObjectScript
{
public:
    FactoryGameObjectScript(char const* name) : GameObjectScript(name) {}
    GameObjectAI* GetAI(GameObject* go) const override { return AIFactory(go); }
};

#define RegisterGameObjectAIWithFactory(ai_name, factory_fn) new FactoryGameObjectScript<ai_name, &factory_fn>(#ai_name)
```

Instance scripts, `src/server/game/Scripting/ScriptDefines/InstanceMapScript.h:37-45`:

```cpp
template<typename IS>
class GenericInstanceMapScript : public InstanceMapScript
{
public:
    GenericInstanceMapScript(char const* name, uint32 mapId) : InstanceMapScript(name, mapId) { }
    InstanceScript* GetInstanceScript(InstanceMap* map) const override { return new IS(map); }
};

#define RegisterInstanceScript(script_name, mapId) new GenericInstanceMapScript<script_name>(#script_name, mapId)
```

Per-dungeon wrapper macros exist, e.g. `#define RegisterKarazhanCreatureAI(ai_name) RegisterCreatureAIWithFactory(ai_name, GetKarazhanAI)` (`src/server/scripts/EasternKingdoms/Karazhan/karazhan.h:223`), and similar in `blackrock_depths.h:154-155`, `molten_core.h:130-131`, `scholomance.h:73`, `stratholme.h:117`, `sunwell_plateau.h:116`, and others. A scanner should collect every `#define Register\w+(ai_name) Register\w+WithFactory(ai_name, ...)` and treat it as an alias.

**How a class name becomes the ScriptName string**: the C preprocessor's `#` operator turns the macro argument into a string literal: `RegisterSpellScript(spell_mage_arcane_blast)` expands to `new GenericSpellAndAuraScriptLoader<spell_mage_arcane_blast, ...>("spell_mage_arcane_blast", ...)`. For `RegisterSpellAndAuraScriptPair(a, b)` the name is the **first** class (`#script_1`). For `...WithArgs` the name is the explicit `script_name` argument, so it is a free string and may differ from any class name. Hand-written classes pass the name to the base constructor directly, e.g. `npc_transmogrifier() : CreatureScript("npc_transmogrifier") { }` (`modules/mod-transmog/src/transmog_scripts.cpp:173`).

**How the name is bound to data**: `ScriptRegistry<T>::AddScript` defers DB-bound scripts (`isAfterLoadScript()` defaults to `IsDatabaseBound()`, `src/server/game/Scripting/ScriptObject.h:50`) to `AddALScripts`, which looks up `sObjectMgr->GetScriptId(script->GetName())` (`src/server/game/Scripting/ScriptMgr.h:774-818`). If the name is unused in the DB it logs `Script named '{}' is not assigned in the database.` (except names containing "Smart", `ScriptMgr.h:860-862`). **A second script with the same name replaces the first** (`ScriptMgr.h:820-849`). The universe of names comes from one UNION query in `ObjectMgr::LoadScriptNames` (`src/server/game/Globals/ObjectMgr.cpp:10457-10484`):
`achievement_criteria_data.ScriptName (type = 11)`, `battleground_template.ScriptName`, `creature.ScriptName`, `creature_template.ScriptName`, `gameobject.ScriptName`, `gameobject_template.ScriptName`, `item_template.ScriptName`, `areatrigger_scripts.ScriptName`, `spell_script_names.ScriptName`, `transports.ScriptName`, `game_weather.ScriptName`, `conditions.ScriptName`, `outdoorpvp_template.ScriptName`, `instance_template.script`.

Spell binding specifics, `ObjectMgr::LoadSpellScriptNames` (`ObjectMgr.cpp:6340-6398`): `SELECT spell_id, ScriptName FROM spell_script_names` (`:6346`). A **negative `spell_id` means "this spell and all higher ranks"** and must be the first rank (`:6364-6390`). Example rows: `(-30451,'spell_mage_arcane_blast')`, `(11958,'spell_mage_cold_snap')` (`data/sql/base/db_world/spell_script_names.sql:148`, `:312`). One spell may have several script names (UNIQUE key is `(spell_id, ScriptName)`, `spell_script_names.sql:26`).

Creature binding specifics: per-spawn `creature.ScriptName` overrides `creature_template.ScriptName` (`src/server/game/Entities/Creature/Creature.cpp:3187-3197`). AI selection order: pet -> `PetAI`; else ScriptName (C++ `CreatureScript::GetAI`); else `creature_template.AIName` (e.g. `SmartAI`) via the AI registry (`src/server/game/AI/CreatureAISelector.cpp:62-65`, `:78-89`).

**Hook registration inside a script** (`src/server/game/Spells/SpellScript.h`):

- `#define PrepareSpellScript(CLASSNAME) SPELLSCRIPT_FUNCTION_TYPE_DEFINES(CLASSNAME) SPELLSCRIPT_FUNCTION_CAST_DEFINES(CLASSNAME)` (`:296`)
- `#define PrepareAuraScript(CLASSNAME) AURASCRIPT_FUNCTION_TYPE_DEFINES(CLASSNAME) AURASCRIPT_FUNCTION_CAST_DEFINES(CLASSNAME)` (`:696`)
- Base methods: `virtual void Register() = 0;` (`:114`), `virtual bool Validate(SpellInfo const* /*spellInfo*/)` (`:117`), `virtual bool Load()` (`:120`), `static bool ValidateSpellInfo(std::initializer_list<uint32> spellIds)` (`:125`).
- Hooks are assigned in `Register()` with `+=` and a wrapper macro. SpellScript hook lists and macros (`SpellScript.h:318-364`): `BeforeCast`/`OnCast`/`AfterCast` + `#define SpellCastFn(F) CastHandlerFunction(&F)`; `OnCheckCast` + `#define SpellCheckCastFn(F) CheckCastHandlerFunction(&F)`; `OnEffectLaunch`/`OnEffectLaunchTarget`/`OnEffectHit`/`OnEffectHitTarget` + `#define SpellEffectFn(F, I, N) EffectHandlerFunction(&F, I, N)`; `BeforeHit` + `BeforeSpellHitFn(F)`; `OnHit`/`AfterHit` + `SpellHitFn(F)`; `OnObjectAreaTargetSelect` + `SpellObjectAreaTargetSelectFn(F, I, N)`; `OnObjectTargetSelect` + `SpellObjectTargetSelectFn(F, I, N)`; `OnDestinationTargetSelect` + `SpellDestinationTargetSelectFn(F, I, N)`.
- AuraScript hooks (`SpellScript.h:730-867`): `DoCheckAreaTarget` (`AuraCheckAreaTargetFn`), `OnDispel`/`AfterDispel` (`AuraDispelFn`), `OnEffectApply`/`AfterEffectApply` (`#define AuraEffectApplyFn(F, I, N, M) EffectApplyHandlerFunction(&F, I, N, M)`), `OnEffectRemove`/`AfterEffectRemove` (`AuraEffectRemoveFn(F, I, N, M)`), `OnEffectPeriodic` (`AuraEffectPeriodicFn(F, I, N)`), `OnEffectUpdatePeriodic`, `DoEffectCalcAmount` (`AuraEffectCalcAmountFn`), `DoEffectCalcPeriodic`, `DoEffectCalcSpellMod`, `OnEffectAbsorb`/`AfterEffectAbsorb` (`AuraEffectAbsorbFn(F, I)`), `OnEffectManaShield`/`AfterEffectManaShield`, `OnEffectSplit`, `DoCheckProc` (`#define AuraCheckProcFn(F) CheckProcHandlerFunction(&F)`), `DoCheckEffectProc`, `DoAfterCheckProc`, `DoPrepareProc`/`OnProc`/`AfterProc` (`AuraProcFn(F)`), `OnEffectProc`/`AfterEffectProc` (`#define AuraEffectProcFn(F, I, N) EffectProcHandlerFunction(&F, I, N)`).
- Scanner regex shape: `\b(<HookName>)\s*\+=\s*(\w+Fn)\(\s*([\w:]+)\s*(?:,\s*(EFFECT_\d|EFFECT_ALL|EFFECT_FIRST_FOUND)\s*)?(?:,\s*(SPELL_EFFECT_\w+|SPELL_AURA_\w+|TARGET_\w+)\s*)?`. The effect index + effect/aura name arguments are themselves bindings: they say _which effect of the bound spell_ the code handles, and can be cross-checked against `Effect[i]` / `EffectApplyAuraName[i]` in Spell.dbc. `SPELL_EFFECT_ANY` / `SPELL_AURA_ANY` are wildcards (`SpellScript.h:42-43`).
- Real examples: `OnEffectLaunch += SpellEffectFn(spell_mage_arcane_blast::HandleTriggerSpell, EFFECT_1, SPELL_EFFECT_TRIGGER_SPELL);` and `AfterCast += SpellCastFn(spell_mage_arcane_blast::HandleAfterCast);` (`src/server/scripts/Spells/spell_mage.cpp:104-106`); `DoCheckProc += AuraCheckProcFn(spell_mage_burning_determination::CheckProc);` (`:155`); `OnEffectProc += AuraEffectProcFn(spell_mage_burnout::HandleProc, EFFECT_1, SPELL_AURA_DUMMY);` (`:236`); `OnEffectHitTarget += SpellEffectFn(spell_mage_blast_wave::HandleKnockBack, EFFECT_2, SPELL_EFFECT_KNOCK_BACK);` (`:480`); `AfterEffectRemove += AuraEffectRemoveFn(spell_mage_combustion_proc::OnRemove, EFFECT_0, SPELL_AURA_ADD_FLAT_MODIFIER, AURA_EFFECT_HANDLE_REAL);` (`:430`).
- `PrepareSpellScript(...)` is still used in this checkout (`spell_mage.cpp:87`, `:115`). Detect the script kind by the base class (`: public SpellScript` / `: public AuraScript`) rather than by the macro, because the macro is optional boilerplate (whether every script uses it is **UNVERIFIED**).

### 2.7 Script base classes

Constructor signatures from `src/server/game/Scripting/ScriptDefines/*.h`. "DB-bound" = `IsDatabaseBound()` returns true: the script runs only for entities whose DB ScriptName column names it. "Map-bound" = keyed by a map ID literal in the constructor, matched against `MapEntry::MapID` (`src/server/game/Scripting/ScriptDefines/AllMapScript.cpp:76`), checked for existence in Map.dbc (`src/server/game/Scripting/ScriptObject.cpp:33-39`). "Global" = fires for every object of that type; most take an `enabledHooks` vector, and **a hook only fires if its ID is listed there** (`ScriptMgr.h:792-793`, `:867-868`).

| Class                                                                                                                                                                                                                                                                                                                                      | Constructor (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Binding                                                                                                        | Data side                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SpellScriptLoader`                                                                                                                                                                                                                                                                                                                        | `SpellScriptLoader(char const* name)` (`SpellScriptLoader.h:28`)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | DB-bound (`:31`)                                                                                               | `spell_script_names.ScriptName` -> `spell_id` (looked up at `SpellScriptLoader.cpp:28`)                                                                                                  |
| `CreatureScript`                                                                                                                                                                                                                                                                                                                           | `CreatureScript(char const* name)` (`CreatureScript.h:27`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | DB-bound (`:30`); `GetAI` (`:57`), gossip/quest hooks (`:33-54`)                                               | `creature.ScriptName` overriding `creature_template.ScriptName`                                                                                                                          |
| `GameObjectScript`                                                                                                                                                                                                                                                                                                                         | `GameObjectScript(char const* name)` (`GameObjectScript.h:27`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DB-bound (`:30`); `GetAI` (`:66`)                                                                              | `gameobject.ScriptName` / `gameobject_template.ScriptName` (**UNVERIFIED** precedence, assumed same as creature)                                                                         |
| `ItemScript`                                                                                                                                                                                                                                                                                                                               | `ItemScript(char const* name)` (`ItemScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DB-bound (`:29`); `OnUse`, `OnQuestAccept`, `OnRemove`, `OnExpire`, `OnCastItemCombatSpell`, gossip (`:32-50`) | `item_template.ScriptName` (`AllItemScript.cpp:79`)                                                                                                                                      |
| `InstanceMapScript`                                                                                                                                                                                                                                                                                                                        | `InstanceMapScript(char const* name, uint32 mapId)` (`InstanceMapScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DB-bound (`:29`) **and** map-bound; `GetInstanceScript` (`:34`)                                                | `instance_template.script` picks the InstanceScript (`InstanceMapScript.cpp:20-26`); `mapId` must be a dungeon in Map.dbc (`InstanceMapScript.cpp:35-43`); map hooks dispatch by `mapId` |
| `WorldMapScript`                                                                                                                                                                                                                                                                                                                           | `WorldMapScript(char const* name, uint32 mapId)` (`WorldMapScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                       | map-bound (after-load, `:29`)                                                                                  | Map.dbc ID                                                                                                                                                                               |
| `BattlegroundMapScript`                                                                                                                                                                                                                                                                                                                    | `BattlegroundMapScript(char const* name, uint32 mapId)` (`BattlegroundMapScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                         | map-bound (`:29`)                                                                                              | Map.dbc ID                                                                                                                                                                               |
| `AreaTriggerScript`                                                                                                                                                                                                                                                                                                                        | `AreaTriggerScript(char const* name)` (`AreaTriggerScript.h:26`); `OnlyOnceAreaTriggerScript` (`:35`)                                                                                                                                                                                                                                                                                                                                                                                                                          | DB-bound (`:29`); `OnTrigger` (`:32`)                                                                          | `areatrigger_scripts.ScriptName` -> `entry` (`AreaTriggerScript.cpp:39`, `ObjectMgr.cpp:7103`)                                                                                           |
| `OutdoorPvPScript`                                                                                                                                                                                                                                                                                                                         | `OutdoorPvPScript(char const* name)` (`OutdoorPvPScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DB-bound (`:29`)                                                                                               | `outdoorpvp_template.ScriptName`                                                                                                                                                         |
| `BattlegroundScript`                                                                                                                                                                                                                                                                                                                       | `BattlegroundScript(char const* name)` (`BattlegroundScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DB-bound (`:29`)                                                                                               | `battleground_template.ScriptName`                                                                                                                                                       |
| `AchievementCriteriaScript`                                                                                                                                                                                                                                                                                                                | `AchievementCriteriaScript(char const* name)` (`AchievementCriteriaScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                               | DB-bound (`:29`); `OnCheck` (`:31`)                                                                            | `achievement_criteria_data.ScriptName` where `type = 11`                                                                                                                                 |
| `ConditionScript`                                                                                                                                                                                                                                                                                                                          | `ConditionScript(char const* name)` (`ConditionScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DB-bound (`:29`); `OnConditionCheck` (`:32`)                                                                   | `conditions.ScriptName`                                                                                                                                                                  |
| `TransportScript`                                                                                                                                                                                                                                                                                                                          | `TransportScript(char const* name)` (`TransportScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DB-bound (`:29`)                                                                                               | `transports.ScriptName`                                                                                                                                                                  |
| `WeatherScript`                                                                                                                                                                                                                                                                                                                            | `WeatherScript(char const* name)` (`WeatherScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DB-bound (`:29`)                                                                                               | `game_weather.ScriptName`                                                                                                                                                                |
| `VehicleScript`                                                                                                                                                                                                                                                                                                                            | `VehicleScript(char const* name)` (`VehicleScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | not DB-bound in this header; `OnInstall`... (`:30-45`)                                                         | how it is attached is **UNVERIFIED**                                                                                                                                                     |
| `DynamicObjectScript`                                                                                                                                                                                                                                                                                                                      | `DynamicObjectScript(char const* name)` (`DynamicObjectScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | global                                                                                                         | none                                                                                                                                                                                     |
| `CommandScript`                                                                                                                                                                                                                                                                                                                            | `CommandScript(char const* name)` (`CommandScript.h:27`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | global (chat commands)                                                                                         | command strings in code; `command` table permissions **UNVERIFIED**                                                                                                                      |
| `PlayerScript`                                                                                                                                                                                                                                                                                                                             | `PlayerScript(char const* name, std::vector<uint16> enabledHooks = std::vector<uint16>())` (`PlayerScript.h:225`)                                                                                                                                                                                                                                                                                                                                                                                                              | global                                                                                                         | none                                                                                                                                                                                     |
| `WorldScript`                                                                                                                                                                                                                                                                                                                              | `WorldScript(char const* name, std::vector<uint16> enabledHooks = ...)` (`WorldScript.h:46`)                                                                                                                                                                                                                                                                                                                                                                                                                                   | global                                                                                                         | none                                                                                                                                                                                     |
| `UnitScript`                                                                                                                                                                                                                                                                                                                               | `UnitScript(char const* name, bool addToScripts = true, std::vector<uint16> enabledHooks = ...)` (`UnitScript.h:57`)                                                                                                                                                                                                                                                                                                                                                                                                           | global                                                                                                         | none                                                                                                                                                                                     |
| `AllCreatureScript`                                                                                                                                                                                                                                                                                                                        | `AllCreatureScript(char const* name)` (`AllCreatureScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | global (every creature)                                                                                        | none                                                                                                                                                                                     |
| `AllGameObjectScript`                                                                                                                                                                                                                                                                                                                      | `AllGameObjectScript(char const* name)` (`AllGameObjectScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | global                                                                                                         | none                                                                                                                                                                                     |
| `AllItemScript`                                                                                                                                                                                                                                                                                                                            | `AllItemScript(char const* name)` (`AllItemScript.h:26`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | global                                                                                                         | none                                                                                                                                                                                     |
| `AllMapScript`                                                                                                                                                                                                                                                                                                                             | `AllMapScript(char const* name, std::vector<uint16> enabledHooks = ...)` (`AllMapScript.h:39`)                                                                                                                                                                                                                                                                                                                                                                                                                                 | global                                                                                                         | none                                                                                                                                                                                     |
| `AllSpellScript`                                                                                                                                                                                                                                                                                                                           | `AllSpellScript(char const* name, std::vector<uint16> enabledHooks = ...)` (`AllSpellScript.h:49`)                                                                                                                                                                                                                                                                                                                                                                                                                             | global (every spell)                                                                                           | spell IDs only via literals inside                                                                                                                                                       |
| `AllBattlegroundScript`, `AllCommandScript`                                                                                                                                                                                                                                                                                                | `(char const* name, std::vector<uint16> enabledHooks = ...)` (`AllBattlegroundScript.h:60`, `AllCommandScript.h:36`)                                                                                                                                                                                                                                                                                                                                                                                                           | global                                                                                                         | none                                                                                                                                                                                     |
| `GlobalScript`                                                                                                                                                                                                                                                                                                                             | `GlobalScript(char const* name, std::vector<uint16> enabledHooks = ...)` (`GlobalScript.h:57`)                                                                                                                                                                                                                                                                                                                                                                                                                                 | global; includes `OnLoadSpellCustomAttr` (see 1.5d)                                                            | none                                                                                                                                                                                     |
| `ServerScript`, `DatabaseScript`, `AccountScript`, `AchievementScript`, `ArenaScript`, `ArenaTeamScript`, `AuctionHouseScript`, `BattlefieldScript`, `FormulaScript`, `GameEventScript`, `GroupScript`, `GuildScript`, `LootScript`, `MailScript`, `MiscScript`, `MovementHandlerScript`, `PetScript`, `TicketScript`, `WorldObjectScript` | all `(char const* name, std::vector<uint16> enabledHooks = std::vector<uint16>())` (`ServerScript.h:40`, `DatabaseScript.h:35`, `AccountScript.h:41`, `AchievementScript.h:39`, `ArenaScript.h:42`, `ArenaTeamScript.h:38`, `AuctionHouseScript.h:43`, `BattlefieldScript.h:42`, `FormulaScript.h:43`, `GameEventScript.h:35`, `GroupScript.h:42`, `GuildScript.h:45`, `LootScript.h:33`, `MailScript.h:33`, `MiscScript.h:51`, `MovementHandlerScript.h:34`, `PetScript.h:38`, `TicketScript.h:38`, `WorldObjectScript.h:37`) | global                                                                                                         | none                                                                                                                                                                                     |
| `ModuleScript`                                                                                                                                                                                                                                                                                                                             | `ModuleScript(char const* name)` (`ModuleScript.h:28`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | global                                                                                                         | none                                                                                                                                                                                     |
| `ALEScript`                                                                                                                                                                                                                                                                                                                                | `ALEScript(char const* name)` (`ALEScript.h:26`); hooks for weather/areatrigger forwarding (`:36-39`)                                                                                                                                                                                                                                                                                                                                                                                                                          | global (used by mod-ale)                                                                                       | none                                                                                                                                                                                     |

There is no `ElunaScript`; the Lua bridge class is `ALEScript`. All headers are gathered by `src/server/game/Scripting/ScriptDefines/AllScriptsObjects.h`.

Example of a global script with explicit enabled hooks: `WS_Transmogrification() : WorldScript("WS_Transmogrification", { WORLDHOOK_ON_STARTUP ...` (`modules/mod-transmog/src/transmog_scripts.cpp:952-953`).

### 2.8 How scripts get compiled in

- Each `.cpp` ends in a `void AddSC_<name>()` that instantiates its scripts, e.g. `void AddSC_mage_spell_scripts()` with 43 `RegisterSpellScript(...)` calls (`src/server/scripts/Spells/spell_mage.cpp:1631-1675`).
- Each script folder has a **hand-written** `<folder>_script_loader.cpp` declaring the `AddSC_*` functions and calling them from `void Add<Folder>Scripts()`. Example `src/server/scripts/Spells/spells_script_loader.cpp:19-50`:

```cpp
// The name of this function should match:
// void Add${NameOfDirectory}Scripts()
void AddSpellsScripts()
{
    AddSC_deathknight_spell_scripts();
    ...
    AddSC_item_spell_scripts();
}
```

Loader files: `src/server/scripts/{Commands/cs,Custom/custom,EasternKingdoms/eastern_kingdoms,Events/events,Kalimdor/kalimdor,Northrend/northrend,OutdoorPvP/outdoorpvp,Outland/outland,Pet/pets,Spells/spells,World/world}_script_loader.cpp`.

- CMake: `GetScriptModuleList` globs every **subdirectory** of `src/server/scripts` (`src/cmake/macros/ConfigureScripts.cmake:47-59`); `ConfigureScriptLoader` generates `Add${MODULE}Scripts()` per folder with `-` replaced by `_` (`src/server/scripts/CMakeLists.txt:123-138`) into `gen_scriptloader/<name>/ScriptLoader.cpp` from `src/server/scripts/ScriptLoader.cpp.in.cmake:52-56` (`void AddScripts() { @ACORE_SCRIPTS_INVOKE@}`). Sources are collected recursively per folder (`CMakeLists.txt:163`, `:170`). The worldserver calls it with `sScriptMgr->SetScriptLoader(AddScripts);` (`src/server/apps/worldserver/Main.cpp:272`).
- Build options: `SCRIPTS` = `none static dynamic minimal-static minimal-dynamic` (`conf/dist/config.cmake:14`, default `static` at `:19`); `minimal` keeps only `Commands` and `Spells` (`src/server/scripts/CMakeLists.txt:35-39`). The local build cache has `SCRIPTS:STRING=static` (`build/CMakeCache.txt:361`). The generated loader in this build calls the 11 folders (`build/src/server/scripts/gen_scriptloader/static/ScriptLoader.cpp:64-77`).
- **Static enumeration recipe for Canvas**: (1) list subfolders of `src/server/scripts` and `modules/*/src`; (2) in each, find the function `Add<Folder>Scripts` / `Add<mod_name>Scripts`; (3) follow its calls transitively, resolving each called name to a function definition anywhere in that folder's sources (do **not** assume the `AddSC_` prefix: mod-autobalance calls `AddAutoBalanceScripts()`, `modules/mod-autobalance/src/AB_loader.cpp:1-6`); (4) inside reached functions, collect `new X(...)` and `Register*(...)` calls; (5) map `X` to its class and base class. Scripts defined but not reached from the loader are dead code. Exact build-time selection (per-folder `SCRIPTS_<NAME>` cache vars, `build/CMakeCache.txt:364-373`) can only be known from the build cache, so a static scan should assume all folders are on unless `CMakeCache.txt` says otherwise.

### 2.9 Module system

- Discovery: every directory under `modules/` is a module (`src/cmake/macros/ConfigureModules.cmake:32-46`). Sources must sit in **`modules/<name>/src`** (`GetPathToModuleSource`, `ConfigureModules.cmake` returns `${MODULE_BASE_PATH}/${module}/src`). Config: `modules/<name>/conf/*.conf.dist` (`modules/CMakeLists.txt:330-344`). Optional `modules/<name>/<name>.cmake` is included (`modules/CMakeLists.txt:302`).
- Entry point name: `Add${name with - replaced by _}Scripts()` (`modules/CMakeLists.txt:150-164`), generated into `ModulesLoader.cpp` from `modules/ModulesLoader.cpp.in.cmake:48-54`:

```cpp
AC_MODULES_API void AddModulesScripts()
{
    // Modules
@ACORE_SCRIPTS_INVOKE@
    // Deprecated api modules
@AC_SCRIPTS_LIST@}
```

Declared in `modules/ModulesScriptLoader.h:21` (`void AddModulesScripts();`). The local generated file shows `Addmod_aleScripts();`, `Addmod_autobalanceScripts();`, `Addmod_transmogScripts();` (`build/modules/gen_scriptloader/static/ModulesLoader.cpp:56`, `:57`, `:59`).

- Confirmed entry points: `void Addmod_transmogScripts()` calling `AddSC_Transmog(); AddSC_transmog_commandscript();` (`modules/mod-transmog/src/transmog_loader.cpp:11-15`); `void Addmod_autobalanceScripts()` (`modules/mod-autobalance/src/AB_loader.cpp:3-6`) -> `AddAutoBalanceScripts()` instantiating 8 global scripts (`modules/mod-autobalance/src/AutoBalance.cpp:75-85`); `void Addmod_aleScripts()` (`modules/mod-ale/src/ALE_loader.cpp:22`) -> `AddSC_ALE()` (`modules/mod-ale/src/ALE_SC.cpp:1344`).
- mod-transmog content: `AddSC_Transmog()` creates `global_transmog_script`, `unit_transmog_script`, `npc_transmogrifier`, `PS_Transmogrification`, `WS_Transmogrification` (`modules/mod-transmog/src/transmog_scripts.cpp:1030-1037`). `npc_transmogrifier` is DB-bound and its SQL sets `creature_template.ScriptName = 'npc_transmogrifier'` (`modules/mod-transmog/data/sql/db-world/trasm_world_NPC.sql:6-7`). Layout: `conf/transmog.conf.dist`, `data/sql/db-world/`, `data/sql/db-characters/`, `data/sql/db-auth/`.
- mod-autobalance: `conf/AutoBalance.conf.dist`, `src/`, no `data/sql` folder. Note `AutoBalance_GameObjectScript` is an `AllGameObjectScript` (global), not a DB-bound `GameObjectScript`, despite its name (`modules/mod-autobalance/src/ABGameObjectScript.h:12`). Canvas must classify by base class, not by class name.
- Module SQL: the DB updater looks in `modules/<name>/data/sql/` and takes every subfolder whose name **contains** the DB module name (`world`, `auth`/`characters` for the others), e.g. `db-world` (`src/server/database/Updater/UpdateFetcher.cpp:162-187`, `src/server/database/Updater/DBUpdater.cpp:143-147`), recursively (`UpdateFetcher.cpp:69`, `:74-84`).
- Modes: `MODULES` = `none static dynamic` (`conf/dist/config.cmake:15`, default static `:20`); mod-ale is configured specially and adds `-DAZEROTHCORE -DWOTLK` (`modules/CMakeLists.txt:53-63`, `:79-82`).
- `modules/how_to_make_a_module.md:1-22` and `modules/create_module.sh:7-36` only clone `azerothcore/skeleton-module`; they contain no layout rules beyond the above.

### 2.10 In-script spell references a scanner should extract

Patterns:

1. Enum constants: `enum MageSpells { SPELL_MAGE_ARCANE_MISSILES_R1 = 5143, ... }` (`src/server/scripts/Spells/spell_mage.cpp:31-75`). Also icon enums `MAGE_ICON_* = n` (`:77-83`), which are SpellIcon IDs, not spell IDs.
2. `ValidateSpellInfo({ ... })` inside `Validate()`: declares the spells a script depends on; high-confidence list.
3. `CastSpell(target, ID, ...)`, `HasAura(ID)`, `GetAura(ID)`, `RemoveAurasDueToSpell(ID)`, `DoCast(...)`, `DoCastSelf/Victim(...)` (creature AI), `sSpellMgr->GetSpellInfo(id)` / `sSpellMgr->AssertSpellInfo(id)`.
4. Raw integer literals are used too (no constant), so the scanner must accept both identifiers resolved through enums and literal integers.
5. Indirect IDs read from DBC at run time (`GetSpellInfo()->Effects[effIndex].TriggerSpell`) cannot be resolved statically; draw them as "uses trigger spell of self".

Real examples from `src/server/scripts/Spells/spell_mage.cpp`:

| Line          | Code                                                                                                                                                 | What it binds                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 33            | `SPELL_MAGE_ARCANE_MISSILES_R1 = 5143,`                                                                                                              | constant -> spell 5143                                   |
| 93, 99        | `_triggerSpellId = GetSpellInfo()->Effects[effIndex].TriggerSpell;` ... `GetCaster()->CastSpell(GetCaster(), _triggerSpellId, TRIGGERED_FULL_MASK);` | dynamic: Spell.dbc EffectTriggerSpell of the bound spell |
| 134, 137, 150 | `RemoveAurasDueToSpell(54748)`, `GetAura(54748)`, `CastSpell(GetUnitOwner(), 54748, true)`                                                           | literal spell 54748 (no constant)                        |
| 215           | `return ValidateSpellInfo({ SPELL_MAGE_BURNOUT_TRIGGER });`                                                                                          | spell 44450                                              |
| 440           | `return ValidateSpellInfo({ SPELL_MAGE_INCANTERS_ABSORBTION_TRIGGERED, SPELL_MAGE_INCANTERS_ABSORBTION_R1 });`                                       | spells 44413, 44394                                      |
| 474           | `if (GetCaster()->HasAura(SPELL_MAGE_GLYPH_OF_BLAST_WAVE))`                                                                                          | spell 62126                                              |
| 502           | `SpellInfo const* spellInfo = sSpellMgr->AssertSpellInfo(itr->first);`                                                                               | dynamic ID                                               |
| 564           | `dmgInfo.GetSpellInfo()->SpellIconID != 3178`                                                                                                        | SpellIcon 3178 (heuristic edge: "spells with icon 3178") |
| 614           | `GetTarget()->CastSpell(procTarget, SPELL_MAGE_FOCUS_MAGIC_PROC, true, nullptr, aurEff);`                                                            | spell 54648                                              |
| 746           | `sSpellMgr->AssertSpellInfo(SPELL_MAGE_IGNITE);`                                                                                                     | spell 12654                                              |

Shared headers: IDs of real spells appear in enums in `src/server/game/Battlegrounds/Battleground.h:84-89` (e.g. `SPELL_WS_QUEST_REWARD = 43483`), `src/server/game/Entities/Pet/PetDefines.h` (53 matches), `src/server/game/Battlefield/Zones/BattlefieldWG.h` (31), `Unit.h`, `Totem.h`. **Warning for the scanner:** most `SPELL_*` names in `src/server/shared/SharedDefines.h` and `src/server/game/Spells/Auras/SpellAuraDefines.h` are _type_ enums, not spell IDs: prefixes `SPELL_AURA_` (317), `SPELL_FAILED_` (188), `SPELL_EFFECT_` (164), `SPELL_CUSTOM_` (100), `SPELL_SCHOOL_`, `SPELL_MISS_`, `SPELL_HIT_`, `SPELL_CLICK_`, `SPELL_ATTR*`, `SPELL_VISUAL_KIT_` (`SharedDefines.h:337-338`). Exclude these prefixes. Across `src/server/scripts` there are 7146 lines matching `SPELL_X = <3+ digits>`.

### 2.11 DB table -> loader function

`WorldDatabase.Query("...")` with an inline string, or a prepared statement defined in `src/server/database/Database/Implementation/WorldDatabase.cpp`. Line = the query line.

**SpellMgr** (`src/server/game/Spells/SpellMgr.cpp`)

| Table                    | Loader                        | Line |
| ------------------------ | ----------------------------- | ---- |
| creature_immunities      | LoadCreatureImmunities        | 68   |
| spell_ranks              | LoadSpellRanks                | 1287 |
| spell_required           | LoadSpellRequired             | 1398 |
| spell_target_position    | LoadSpellTargetPositions      | 1515 |
| spell_cone               | LoadSpellCones                | 1620 |
| spell_group              | LoadSpellGroups               | 1708 |
| spell_group_stack_rules  | LoadSpellGroupStackRules      | 1791 |
| spell_proc               | LoadSpellProcs                | 2013 |
| spell_bonus_data         | LoadSpellBonuses              | 2302 |
| spell_threat             | LoadSpellThreats              | 2343 |
| spell_mixology           | LoadSpellMixology             | 2384 |
| spell_pet_auras          | LoadSpellPetAuras             | 2442 |
| spell_enchant_proc_data  | LoadSpellEnchantProcData      | 2546 |
| spell_linked_spell       | LoadSpellLinked               | 2591 |
| spell_area               | LoadSpellAreas                | 2821 |
| spell_cooldown_overrides | LoadSpellCooldownOverrides    | 3059 |
| spell_jump_distance      | LoadSpellJumpDistances        | 3134 |
| spell_custom_attr        | LoadSpellInfoCustomAttributes | 3172 |

(`spell_proc` confirmed: `SELECT SpellId, SchoolMask, SpellFamilyName, ... FROM spell_proc`, `SpellMgr.cpp:2013`.)

**ObjectMgr** (`src/server/game/Globals/ObjectMgr.cpp`), main world-content loaders:

| Table                                                                                                                             | Loader                                                                                                                             | Line                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| creature_template                                                                                                                 | LoadCreatureTemplates                                                                                                              | 541                                                               |
| creature_template_model / _resistance / _spell / _addon                                                                           | LoadCreatureTemplateModels / Resistances / Spells / Addons                                                                         | 717 / 769 / 815 / 861                                             |
| creature_template_locale                                                                                                          | LoadCreatureLocales                                                                                                                | 401                                                               |
| creature_addon                                                                                                                    | LoadCreatureAddons                                                                                                                 | 1267                                                              |
| gameobject_addon                                                                                                                  | LoadGameObjectAddons                                                                                                               | 1368                                                              |
| creature_equip_template                                                                                                           | LoadEquipmentTemplates                                                                                                             | 1485                                                              |
| creature_movement_override                                                                                                        | LoadCreatureMovementOverrides                                                                                                      | 1564                                                              |
| creature_model_info                                                                                                               | LoadCreatureModelInfo                                                                                                              | 1715                                                              |
| player_totem_model / player_shapeshift_model                                                                                      | LoadPlayerTotemModels / LoadPlayerShapeshiftModels                                                                                 | 1789 / 1848                                                       |
| linked_respawn                                                                                                                    | LoadLinkedRespawn                                                                                                                  | 1927                                                              |
| creature_summon_groups / gameobject_summon_groups                                                                                 | LoadTempSummons / LoadGameObjectSummons                                                                                            | 2158 / 2246                                                       |
| creature, creature_multispawn                                                                                                     | LoadCreatures                                                                                                                      | 2330, 2501                                                        |
| creature_sparring                                                                                                                 | LoadCreatureSparring                                                                                                               | 2751                                                              |
| gameobject                                                                                                                        | LoadGameobjects                                                                                                                    | 2930                                                              |
| item_template                                                                                                                     | LoadItemTemplates                                                                                                                  | 3350                                                              |
| item_template_locale                                                                                                              | LoadItemLocales                                                                                                                    | 3269                                                              |
| item_set_names (+_locale)                                                                                                         | LoadItemSetNames / LoadItemSetNameLocales                                                                                          | 3988 / 3945                                                       |
| vehicle_template_accessory / vehicle_accessory / vehicle_seat_addon                                                               | LoadVehicleTemplateAccessories / LoadVehicleAccessories / LoadVehicleSeatAddon                                                     | 4060 / 4116 / 4160                                                |
| pet_levelstats                                                                                                                    | LoadPetLevelInfo                                                                                                                   | 4212                                                              |
| playercreateinfo, _item, _skills, _spell_custom, _cast_spell, _action; player_race_stats, player_class_stats, player_xp_for_level | LoadPlayerInfo                                                                                                                     | 4360, 4447, 4518, 4593, 4651, 4710, 4765, 4791, 4928              |
| quest_template, quest_details, quest_request_items, quest_offer_reward, quest_template_addon                                      | LoadQuests                                                                                                                         | 5119, 5160, 5183, 5206, 5231                                      |
| quest_template_locale                                                                                                             | LoadQuestLocales                                                                                                                   | 5898                                                              |
| spell_scripts / event_scripts / waypoint_scripts                                                                                  | LoadScripts(type) via LoadSpellScripts / LoadEventScripts / LoadWaypointScripts (names from `GetScriptsTableNameByType`, `:64-80`) | 5948 (`SELECT id, delay, command, ... FROM {}`), 6243, 6271, 6315 |
| waypoint_data (actions)                                                                                                           | LoadWaypointScripts (stmt `WORLD_SEL_WAYPOINT_DATA_ACTION`)                                                                        | 6322                                                              |
| spell_script_names                                                                                                                | LoadSpellScriptNames                                                                                                               | 6346                                                              |
| page_text (+_locale)                                                                                                              | LoadPageTexts / LoadPageTextLocales                                                                                                | 6475 / 6527                                                       |
| instance_template                                                                                                                 | LoadInstanceTemplate                                                                                                               | 6558                                                              |
| instance_encounters                                                                                                               | LoadInstanceEncounters                                                                                                             | 6609                                                              |
| npc_text (+_locale)                                                                                                               | LoadGossipText / LoadNpcTextLocales                                                                                                | 6710 / 6782                                                       |
| areatrigger_involvedrelation                                                                                                      | LoadQuestAreaTriggers                                                                                                              | 6814                                                              |
| quest_greeting (+_locale)                                                                                                         | LoadQuestGreetings / LoadQuestGreetingsLocales                                                                                     | 6891 / 6943                                                       |
| areatrigger_tavern / areatrigger_scripts / areatrigger / areatrigger_teleport                                                     | LoadTavernAreaTriggers / LoadAreaTriggerScripts / LoadAreaTriggers / LoadAreaTriggerTeleports                                      | 7063 / 7103 / 7251 / 7302                                         |
| dungeon_access_template, dungeon_access_requirements                                                                              | LoadAccessRequirements                                                                                                             | 7389, 7416                                                        |
| gameobject_template (+_locale, _addon)                                                                                            | LoadGameObjectTemplate / LoadGameObjectLocales / LoadGameObjectTemplateAddons                                                      | 7774 / 7683 / 7958                                                |
| exploration_basexp                                                                                                                | LoadExplorationBaseXP                                                                                                              | 8036                                                              |
| pet_name_generation (+_locale)                                                                                                    | LoadPetNames / LoadPetNamesLocales                                                                                                 | 8076 / 459                                                        |
| reputation_reward_rate / creature_onkill_reputation / reputation_spillover_template                                               | LoadReputationRewardRate / LoadReputationOnKill / LoadReputationSpilloverTemplate                                                  | 8163 / 8257 / 8325                                                |
| points_of_interest (+_locale)                                                                                                     | LoadPointsOfInterest / LoadPointOfInterestLocales                                                                                  | 8444 / 501                                                        |
| quest_poi, quest_poi_points                                                                                                       | LoadQuestPOI                                                                                                                       | 8499, 8509                                                        |
| npc_spellclick_spells                                                                                                             | LoadNPCSpellClickSpells                                                                                                            | 8572                                                              |
| spawn_group_template / spawn_group                                                                                                | LoadSpawnGroupTemplates / LoadSpawnGroups                                                                                          | 8673 / 8737                                                       |
| creature_queststarter / creature_questender / gameobject_queststarter / gameobject_questender                                     | LoadQuestRelationsHelper (`SELECT id, quest, pool_entry FROM {} ...`, `:8841`)                                                     | 8908 / 8922 / 8880 / 8894                                         |
| module_string (+_locale)                                                                                                          | LoadModuleStrings / LoadModuleStringsLocale                                                                                        | 9465 / 9496                                                       |
| acore_string                                                                                                                      | LoadAcoreStrings                                                                                                                   | 9557                                                              |
| skill_fishing_base_level                                                                                                          | LoadFishingBaseSkillLevel                                                                                                          | 9607                                                              |
| game_tele                                                                                                                         | LoadGameTele                                                                                                                       | 9748                                                              |
| mail_level_reward                                                                                                                 | LoadMailLevelRewards                                                                                                               | 9888                                                              |
| trainer, trainer_spell, trainer_locale                                                                                            | LoadTrainers                                                                                                                       | 10006, 9950, 10047                                                |
| creature_default_trainer                                                                                                          | LoadCreatureDefaultTrainers                                                                                                        | 10076                                                             |
| npc_vendor                                                                                                                        | LoadVendors / LoadReferenceVendor (stmt `WORLD_SEL_NPC_VENDOR_REF`)                                                                | 10157 / 10110                                                     |
| gossip_menu / gossip_menu_option (+_locale)                                                                                       | LoadGossipMenu / LoadGossipMenuItems / LoadGossipMenuItemsLocales                                                                  | 10203 / 10243 / 430                                               |
| (14 ScriptName columns)                                                                                                           | LoadScriptNames                                                                                                                    | 10457-10484                                                       |
| broadcast_text (+_locale)                                                                                                         | LoadBroadcastTexts / LoadBroadcastTextLocales                                                                                      | 10532 / 10615                                                     |
| creature_classlevelstats                                                                                                          | LoadCreatureClassLevelStats                                                                                                        | 10686                                                             |
| player_factionchange_* (6 tables)                                                                                                 | LoadFactionChangeAchievements/Items/Quests/Reputations/Spells/Titles                                                               | 10781-10961                                                       |
| gameobject_questitem / creature_questitem                                                                                         | LoadGameObjectQuestItems / LoadCreatureQuestItems                                                                                  | 11055 / 11100                                                     |
| quest_money_reward                                                                                                                | LoadQuestMoneyRewards                                                                                                              | 11147                                                             |

**CreatureTextMgr** (`src/server/game/Texts/CreatureTextMgr.cpp`): `creature_text` via `WORLD_SEL_CREATURE_TEXT` = `"SELECT CreatureID, GroupID, ID, Text, Type, Language, Probability, Emote, Duration, Sound, BroadcastTextId, TextRange FROM creature_text"` (`WorldDatabase.cpp:29`) in `LoadCreatureTexts` (`CreatureTextMgr.cpp:90`); `creature_text_locale` in `LoadCreatureTextLocales` (`:176`); `creature_text_options` JOIN `creature_text_option_sets` via `WORLD_SEL_CREATURE_TEXT_OPTIONS` (`WorldDatabase.cpp:30`) in `LoadCreatureTextOptions` (`:207`).

**SmartAIMgr** (`src/server/game/AI/SmartScripts/SmartScriptMgr.cpp`): `smart_scripts` via `WORLD_SEL_SMART_SCRIPTS` (`WorldDatabase.cpp:31`, `SELECT entryorguid, source_type, id, link, event_type, ...`) in `SmartAIMgr::LoadSmartAIFromDB` (`:124`); `waypoints` via `WORLD_SEL_SMARTAI_WP` (`WorldDatabase.cpp:32`) in `SmartWaypointMgr::LoadFromDB` (`:53`). `source_type` values: `SMART_SCRIPT_TYPE_CREATURE = 0`, `GAMEOBJECT = 1`, `AREATRIGGER = 2`, `EVENT = 3`, `GOSSIP = 4`, `QUEST = 5`, `SPELL = 6`, `TRANSPORT = 7`, `INSTANCE = 8`, `TIMED_ACTIONLIST = 9` (`SmartScriptMgr.h:1803-1812`).

**ConditionMgr** (`src/server/game/Conditions/ConditionMgr.cpp`): `conditions` in `LoadConditions` (`:1155-1156`), selecting `SourceTypeOrReferenceId, SourceGroup, SourceEntry, SourceId, ElseGroup, ConditionTypeOrReference, ConditionTarget, ConditionValue1..3, NegativeCondition, ErrorType, ErrorTextId, ScriptName`.

**GameEventMgr** (`src/server/game/Events/GameEventMgr.cpp`), prepared statements at `WorldDatabase.cpp:89-105`:

| Table                                | Loader                               | Line |
| ------------------------------------ | ------------------------------------ | ---- |
| game_event                           | LoadEvents (`WORLD_SEL_GAME_EVENTS`) | 331  |
| game_event_prerequisite              | LoadEventPrerequisiteData            | 447  |
| game_event_creature                  | LoadEventCreatureData                | 500  |
| game_event_gameobject                | LoadEventGameObjectData              | 550  |
| creature JOIN game_event_model_equip | LoadEventModelEquipmentChangeData    | 600  |
| game_event_creature_quest            | LoadEventQuestData                   | 659  |
| game_event_gameobject_quest          | LoadEventGameObjectQuestData         | 701  |
| game_event_quest_condition           | LoadEventQuestConditionData          | 743  |
| game_event_condition                 | LoadEventConditionData               | 787  |
| game_event_npcflag                   | LoadEventNPCFlags                    | 879  |
| game_event_seasonal_questrelation    | LoadEventSeasonalQuestRelations      | 919  |
| game_event_battleground_holiday      | LoadEventBattlegroundData            | 967  |
| pool_template JOIN game_event_pool   | LoadEventPoolData                    | 1006 |
| game_event_npc_vendor                | LoadEventVendors                     | 244  |
| game_event (holiday dates)           | LoadHolidayDates                     | 1152 |

**PoolMgr** (`src/server/game/Pools/PoolMgr.cpp`, all in `PoolMgr::LoadFromDB`): `pool_template` (`:594`), `pool_creature` (`:629`), `pool_gameobject` (`:697`), `pool_pool` (`:776`), `pool_quest` via `WORLD_SEL_QUEST_POOLS` = `"SELECT entry, pool_entry FROM pool_quest"` (`WorldDatabase.cpp:26`, used at `:881`).

**LootMgr** (`src/server/game/Loot/LootMgr.cpp`): one generic loader `LootStore::LoadLootTable` (`:143`) runs `"SELECT Entry, Item, Reference, Chance, QuestRequired, LootMode, GroupId, MinCount, MaxCount FROM {}"` (`:151`) for each store (`:44-56`): `creature_loot_template` (key: creature entry), `disenchant_loot_template`, `fishing_loot_template` (area id), `gameobject_loot_template`, `item_loot_template`, `mail_loot_template`, `milling_loot_template`, `pickpocketing_loot_template`, `prospecting_loot_template`, `reference_loot_template`, `skinning_loot_template`, `spell_loot_template` (spell id), `player_loot_template`. Per-store wrappers start at `LoadLootTemplates_Creature` (`:1910`).

---

## Part 3: Lua (mod-ale)

### 3.12 mod-ale structure, script loading, Register functions

- README: ALE "has diverged from the original Eluna project and is no longer compatible with standard Eluna scripts" (`modules/mod-ale/README.md:13-14`). Lua 5.2 badge (`README.md:8`); LuaJIT is also bundled (`src/lualib/luajit`).
- Layout: `src/ALE_loader.cpp`, `src/ALE_SC.cpp` (C++ glue to ScriptMgr), `src/LuaEngine/` (`LuaEngine.cpp`, `LuaFunctions.cpp`, `Hooks.h`, `BindingMap.h`, `hooks/*.cpp` per object type, `methods/*Methods.h` per Lua class), `src/lualib/{lua,luajit}`, `conf/mod_ale.conf.dist`, `docs/*.md`.
- Script folder: `ALE.ScriptPath = "lua_scripts"` (`modules/mod-ale/conf/mod_ale.conf.dist:65`; documented at `:17-20`: "relative or absolute"; default set at `src/LuaEngine/ALEConfig.cpp:25`). Relative paths resolve against the worldserver's working directory per `docs/USAGE.md:34` ("located in your server folder"); exact resolution is **UNVERIFIED**.
- Discovery: `ALE::GetScripts` recurses all subfolders, skips hidden files/folders (`src/LuaEngine/LuaEngine.cpp:617-665`); accepted extensions `.lua .dll .so .ext .moon .out` (`LuaEngine.cpp:378`); `.ext` files load first, then the rest, each list sorted by full path (`LuaEngine.cpp:689-692`). **Two files with the same base name in different folders: only the first (by path) loads** (`LuaEngine.cpp:703-708`). Every scanned folder is added to `package.path` (`LuaEngine.cpp:626-633`), so `require "name"` resolves across folders.
- Lua-visible Register functions (name table `src/LuaEngine/LuaFunctions.cpp:69-87`), implementations in `src/LuaEngine/methods/GlobalMethods.h`:

| Lua function                  | Signature (`@proto`)                                | Helper / regtype                | GlobalMethods.h | First arg binds to                        |
| ----------------------------- | --------------------------------------------------- | ------------------------------- | --------------- | ----------------------------------------- |
| RegisterServerEvent           | `(event, function[, shots])`                        | EventHelper / SERVER            | 711             | nothing (global)                          |
| RegisterPlayerEvent           | `(event, function[, shots])`                        | EventHelper / PLAYER            | 809             | global                                    |
| RegisterGuildEvent            | `(event, function[, shots])`                        | EventHelper / GUILD             | 846             | global                                    |
| RegisterGroupEvent            | `(event, function[, shots])`                        | EventHelper / GROUP             | 878             | global                                    |
| RegisterBGEvent               | `(event, function[, shots])`                        | EventHelper / BG                | 906             | global                                    |
| RegisterPacketEvent           | `(entry, event, function[, shots])`                 | EntryHelper / PACKET            | 935             | opcode (`:928`)                           |
| RegisterCreatureGossipEvent   | `(entry, event, function[, shots])`                 | EntryHelper / CREATURE_GOSSIP   | 962             | `creature_template.entry`                 |
| RegisterGameObjectGossipEvent | `(entry, event, function[, shots])`                 | EntryHelper / GAMEOBJECT_GOSSIP | 989             | `gameobject_template.entry`               |
| RegisterItemEvent             | `(entry, event, function[, shots])`                 | EntryHelper / ITEM              | 1019            | `item_template.entry`                     |
| RegisterItemGossipEvent       | `(entry, event, function[, shots])`                 | EntryHelper / ITEM_GOSSIP       | 1046            | `item_template.entry`                     |
| RegisterMapEvent              | `(map_id, event, function[, shots])` (`:1068`)      | EntryHelper / MAP               | 1073            | Map.dbc ID                                |
| RegisterInstanceEvent         | `(instance_id, event, function[, shots])` (`:1095`) | EntryHelper / INSTANCE          | 1100            | runtime instance ID, not static content   |
| RegisterPlayerGossipEvent     | `(menu_id, event, function[, shots])`               | EntryHelper / PLAYER_GOSSIP     | 1129            | gossip menu ID chosen by script (`:1122`) |
| RegisterCreatureEvent         | `(entry, event, function[, shots])`                 | EntryHelper / CREATURE          | 1200            | `creature_template.entry`                 |
| RegisterUniqueCreatureEvent   | `(guid, instance_id, event, function[, shots])`     | UniqueHelper / CREATURE         | 1272            | runtime GUID                              |
| RegisterGameObjectEvent       | `(entry, event, function[, shots])`                 | EntryHelper / GAMEOBJECT        | 1311            | `gameobject_template.entry`               |
| RegisterTicketEvent           | `(event, function[, shots])`                        | EventHelper / TICKET            | 1335            | global                                    |
| RegisterSpellEvent            | `(entry, event, function[, shots])` (`:1353`)       | EntryHelper / SPELL             | 1358            | Spell ID                                  |
| RegisterAllCreatureEvent      | `(event, function[, shots])`                        | EventHelper / ALL_CREATURE      | 1390            | global                                    |

Helpers: `RegisterEntryHelper` reads `(uint32 id, uint32 ev, function, uint32 shots=0)` (`GlobalMethods.h:593-607`); `RegisterEventHelper` reads `(uint32 ev, function, shots)` (`:609-622`); `RegisterUniqueHelper` reads `(ObjectGuid, uint32 instanceId, uint32 ev, function, shots)` (`:624-639`). Each returns a cancel closure (`LuaEngine.cpp:1266-1275`).

- **No `RegisterVehicleEvent`**: `REGTYPE_VEHICLE` and `VehicleEvents` exist (`Hooks.h:79`, `:276`) and `ALE::Register` handles them (`LuaEngine.cpp:1324-1332`), but no Lua name is exported in `LuaFunctions.cpp:69-87`. Whether vehicle events are reachable some other way is **UNVERIFIED**.
- Per-object timers: `WorldObject:RegisterEvent(function, delay[, repeats])` (`LuaFunctions.cpp:294`; protos at `GlobalMethods.h:1699-1702` are for `CreateLuaEvent`, **UNVERIFIED** mapping). These are timers, not content bindings.
- **How the entry binds**: `ALE::Register` (`LuaEngine.cpp:1278`) stores `EntryKey<EventEnum>(event_id, entry)` in a per-type `BindingMap`. It validates the entry against loaded content at registration time: creature `eObjectMgr->GetCreatureTemplate(entry)` (`:1366-1369`), gameobject (`:1414-1417`), item (`:1448-1451`), spell `sSpellMgr->GetSpellInfo(entry)` (`:1522-1525`), packet opcode `< NUM_MSG_TYPES` (`:1347`). Map/instance entries are not validated (`:1489-1505`). `RegisterCreatureEvent` with entry 0 goes down the unique-GUID path (`:1364-1386`). At run time the hook looks up the same key, e.g. `START_HOOK(SPELL_EVENT_ON_CAST, spellInfo->Id)` (`src/LuaEngine/hooks/SpellHooks.cpp:44`).
- **Event IDs are plain integers** (`Hooks.h:71-432`). ALE does not export these names as Lua globals (no setter found in `src/LuaEngine/*.cpp`); scripts define their own locals (`docs/USAGE.md:38`). So the scanner must map numbers to names itself using `Hooks.h`. The `RegisterTypes` enum (`Hooks.h:71-93`) and event enums (values verbatim from `Hooks.h`):
  - PacketEvents (`:95`): ON_PACKET_RECEIVE=5, ON_PACKET_RECEIVE_UNKNOWN=6, ON_PACKET_SEND=7.
  - ServerEvents (`:104`): SERVER_EVENT_ON_NETWORK_START=1, ON_NETWORK_STOP=2, ON_SOCKET_OPEN=3, ON_SOCKET_CLOSE=4, ON_PACKET_RECEIVE=5, ON_PACKET_RECEIVE_UNKNOWN=6, ON_PACKET_SEND=7, WORLD_EVENT_ON_OPEN_STATE_CHANGE=8, WORLD_EVENT_ON_CONFIG_LOAD=9, WORLD_EVENT_ON_SHUTDOWN_INIT=11, ON_SHUTDOWN_CANCEL=12, WORLD_EVENT_ON_UPDATE=13, ON_STARTUP=14, ON_SHUTDOWN=15, ALE_EVENT_ON_LUA_STATE_CLOSE=16, MAP_EVENT_ON_CREATE=17, ON_DESTROY=18, ON_GRID_LOAD=19, ON_GRID_UNLOAD=20, ON_PLAYER_ENTER=21, ON_PLAYER_LEAVE=22, ON_UPDATE=23, TRIGGER_EVENT_ON_TRIGGER=24, WEATHER_EVENT_ON_CHANGE=25, AUCTION_EVENT_ON_ADD=26, ON_REMOVE=27, ON_SUCCESSFUL=28, ON_EXPIRE=29, ADDON_EVENT_ON_MESSAGE=30, WORLD_EVENT_ON_DELETE_CREATURE=31, ON_DELETE_GAMEOBJECT=32, ALE_EVENT_ON_LUA_STATE_OPEN=33, GAME_EVENT_START=34, GAME_EVENT_STOP=35.
  - PlayerEvents (`:164`): ON_CHARACTER_CREATE=1, ON_CHARACTER_DELETE=2, ON_LOGIN=3, ON_LOGOUT=4, ON_SPELL_CAST=5, ON_KILL_PLAYER=6, ON_KILL_CREATURE=7, ON_KILLED_BY_CREATURE=8, ON_DUEL_REQUEST=9, ON_DUEL_START=10, ON_DUEL_END=11, ON_GIVE_XP=12, ON_LEVEL_CHANGE=13, ON_MONEY_CHANGE=14, ON_REPUTATION_CHANGE=15, ON_TALENTS_CHANGE=16, ON_TALENTS_RESET=17, ON_CHAT=18, ON_WHISPER=19, ON_GROUP_CHAT=20, ON_GUILD_CHAT=21, ON_CHANNEL_CHAT=22, ON_EMOTE=23, ON_TEXT_EMOTE=24, ON_SAVE=25, ON_BIND_TO_INSTANCE=26, ON_UPDATE_ZONE=27, ON_MAP_CHANGE=28, ON_EQUIP=29, ON_FIRST_LOGIN=30, ON_CAN_USE_ITEM=31 (`:198`), ON_LOOT_ITEM=32, ON_ENTER_COMBAT=33, ON_LEAVE_COMBAT=34, ON_REPOP=35, ON_RESURRECT=36, ON_LOOT_MONEY=37, ON_QUEST_ABANDON=38, ON_LEARN_TALENTS=39, ON_COMMAND=42, ON_PET_ADDED_TO_WORLD=43, ON_LEARN_SPELL=44, ON_ACHIEVEMENT_COMPLETE=45, ON_FFAPVP_CHANGE=46, ON_UPDATE_AREA=47, ON_CAN_INIT_TRADE=48, ON_CAN_SEND_MAIL=49, ON_CAN_JOIN_LFG=50, ON_QUEST_REWARD_ITEM=51, ON_CREATE_ITEM=52, ON_STORE_NEW_ITEM=53, ON_COMPLETE_QUEST=54, ON_CAN_GROUP_INVITE=55, ON_GROUP_ROLL_REWARD_ITEM=56, ON_BG_DESERTION=57, ON_PET_KILL=58, ON_CAN_RESURRECT=59, ON_CAN_UPDATE_SKILL=60, ON_BEFORE_UPDATE_SKILL=61, ON_UPDATE_SKILL=62, ON_QUEST_ACCEPT=63, ON_AURA_APPLY=64, ON_HEAL=65, ON_DAMAGE=66, ON_AURA_REMOVE=67, ON_MODIFY_PERIODIC_DAMAGE_AURAS_TICK=68, ON_MODIFY_MELEE_DAMAGE=69, ON_MODIFY_SPELL_DAMAGE_TAKEN=70, ON_MODIFY_HEAL_RECEIVED=71, ON_DEAL_DAMAGE=72, ON_RELEASED_GHOST=73 (all prefixed `PLAYER_EVENT_`).
  - GuildEvents (`:245`): ON_ADD_MEMBER=1, ON_REMOVE_MEMBER=2, ON_MOTD_CHANGE=3, ON_INFO_CHANGE=4, ON_CREATE=5, ON_DISBAND=6, ON_MONEY_WITHDRAW=7, ON_MONEY_DEPOSIT=8, ON_ITEM_MOVE=9, ON_EVENT=10, ON_BANK_EVENT=11.
  - GroupEvents (`:263`): ON_MEMBER_ADD=1, ON_MEMBER_INVITE=2, ON_MEMBER_REMOVE=3, ON_LEADER_CHANGE=4, ON_DISBAND=5, ON_CREATE=6.
  - VehicleEvents (`:276`): ON_INSTALL=1, ON_UNINSTALL=2, ON_INSTALL_ACCESSORY=4, ON_ADD_PASSENGER=5, ON_REMOVE_PASSENGER=6.
  - CreatureEvents (`:288`): ON_ENTER_COMBAT=1, ON_LEAVE_COMBAT=2, ON_TARGET_DIED=3, ON_DIED=4, ON_SPAWN=5, ON_REACH_WP=6, ON_AIUPDATE=7, ON_RECEIVE_EMOTE=8, ON_DAMAGE_TAKEN=9, ON_PRE_COMBAT=10, ON_OWNER_ATTACKED=12, ON_OWNER_ATTACKED_AT=13, ON_HIT_BY_SPELL=14, ON_SPELL_HIT_TARGET=15, ON_JUST_SUMMONED_CREATURE=19, ON_SUMMONED_CREATURE_DESPAWN=20, ON_SUMMONED_CREATURE_DIED=21, ON_SUMMONED=22, ON_RESET=23, ON_REACH_HOME=24, ON_CORPSE_REMOVED=26, ON_MOVE_IN_LOS=27, ON_DUMMY_EFFECT=30, ON_QUEST_ACCEPT=31, ON_QUEST_REWARD=34, ON_DIALOG_STATUS=35, ON_ADD=36, ON_REMOVE=37, ON_AURA_APPLY=38, ON_HEAL=39, ON_DAMAGE=40, ON_AURA_REMOVE=41, ON_MODIFY_PERIODIC_DAMAGE_AURAS_TICK=42, ON_MODIFY_MELEE_DAMAGE=43, ON_MODIFY_SPELL_DAMAGE_TAKEN=44, ON_MODIFY_HEAL_RECEIVED=45, ON_DEAL_DAMAGE=46.
  - GameObjectEvents (`:339`): ON_AIUPDATE=1, ON_SPAWN=2, ON_DUMMY_EFFECT=3, ON_QUEST_ACCEPT=4, ON_QUEST_REWARD=5, ON_DIALOG_STATUS=6, ON_DESTROYED=7, ON_DAMAGED=8, ON_LOOT_STATE_CHANGE=9, ON_GO_STATE_CHANGED=10, ON_ADD=12, ON_REMOVE=13, ON_USE=14.
  - ItemEvents (`:358`): ON_DUMMY_EFFECT=1, ON_USE=2, ON_QUEST_ACCEPT=3, ON_EXPIRE=4, ON_REMOVE=5.
  - GossipEvents (`:368`): GOSSIP_EVENT_ON_HELLO=1, GOSSIP_EVENT_ON_SELECT=2.
  - BGEvents (`:375`): ON_START=1, ON_END=2, ON_CREATE=3, ON_PRE_DESTROY=4.
  - InstanceEvents (`:384`; also used by RegisterMapEvent, `LuaEngine.cpp:1492`): ON_INITIALIZE=1, ON_LOAD=2, ON_UPDATE=3, ON_PLAYER_ENTER=4, ON_CREATURE_CREATE=5, ON_GAMEOBJECT_CREATE=6, ON_CHECK_ENCOUNTER_IN_PROGRESS=7.
  - TicketEvents (`:396`): ON_CREATE=1, UPDATE_LAST_CHANGE=2, ON_CLOSE=3, ON_RESOLVE=4.
  - SpellEvents (`:405`): SPELL_EVENT_ON_PREPARE=1, ON_CAST=2, ON_CAST_CANCEL=3.
  - AllCreatureEvents (`:413`): ON_ADD=1, ON_REMOVE=2, ON_SELECT_LEVEL=3, ON_BEFORE_SELECT_LEVEL=4, ON_AURA_APPLY=5, ON_HEAL=6, ON_DAMAGE=7, ON_AURA_REMOVE=8, ON_MODIFY_PERIODIC_DAMAGE_AURAS_TICK=9, ON_MODIFY_MELEE_DAMAGE=10, ON_MODIFY_SPELL_DAMAGE_TAKEN=11, ON_MODIFY_HEAL_RECEIVED=12, ON_DEAL_DAMAGE=13.
- Gaps in numbering (e.g. CreatureEvents 11, 16-18) are intentional; a number outside the enum is rejected at registration (`event_id < *_COUNT` checks, e.g. `LuaEngine.cpp:1285`), but a number inside a gap is accepted silently (**UNVERIFIED** whether it ever fires; probably not).
- **AIO**: `modules/AIO` is not present. No `AIO` identifier appears in `modules/mod-ale/src` (outside bundled Lua libraries), `conf` or `README.md`. The only hook such an addon-messaging layer would use is `ADDON_EVENT_ON_MESSAGE = 30` (server event), documented as `(event, sender, type, prefix, msg, target)` (`GlobalMethods.h:690`), implemented in `ALE::OnAddonMessage` (`src/LuaEngine/hooks/ServerHooks.cpp:33-45`). How AIO itself registers is **UNVERIFIED** (not in this checkout).

### 3.13 Lua samples (from mod-ale only)

Lua samples below come from mod-ale's own docs and bundled extension:

| File:line                                                              | Code                                                                                                           | Note                                                                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `modules/mod-ale/docs/USAGE.md:38`, `:44`                              | `local PLAYER_EVENT_ON_LOGIN = 3` ... `RegisterPlayerEvent(PLAYER_EVENT_ON_LOGIN, OnLogin)`                    | constant defined locally; scanner must resolve local constants                                                 |
| `modules/mod-ale/docs/USAGE.md:175-176`, `:188`                        | `local entry = 6` / `local on_combat = 1` ... `RegisterCreatureEvent(entry, on_combat, OnCombat)`              | entry via local variable -> creature_template.entry 6                                                          |
| `modules/mod-ale/src/LuaEngine/extensions/ObjectVariables.ext:111-115` | `RegisterPlayerEvent(4, DestroyObjData) -- logout` ... `RegisterServerEvent(17, DestroyMapData) -- map create` | numeric literals with trailing comments                                                                        |
| `modules/mod-ale/docs/CONTRIBUTING.md:173`                             | `RegisterPlayerEvent(8, OnQuestComplete)  -- PLAYER_EVENT_ON_QUEST_COMPLETE`                                   | **the comment is wrong**: 8 is `PLAYER_EVENT_ON_KILLED_BY_CREATURE`; quest complete is 54 (`Hooks.h`)          |
| `modules/mod-ale/docs/IMPL_DETAILS.md:256`                             | `RegisterServerEvent(33, LoadCreatureNames)  -- SERVER_EVENT_ON_CONFIG_LOAD`                                   | **the comment is wrong**: 33 is `ALE_EVENT_ON_LUA_STATE_OPEN`; config load is 9. Same at `docs/INSTALL.md:288` |

Lesson for the scanner: never trust trailing comments; resolve the number through `Hooks.h`.

---

## Binding catalogue

Confidence: **exact** = a literal ID or exact string match the server itself uses; **by-name** = string name matched between code and a DB column; **heuristic** = pattern match that can miss or over-match.

| #   | Binding                          | Code side                                                                                                                                                     | Data side                                                                                                                                       | Static detection                                                                                                         | Confidence                                 |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 1   | Spell script                     | `RegisterSpellScript(C)`, `RegisterSpellAndAuraScriptPair(C1,C2)` (name = `#C`/`#C1`), `...WithArgs(C, "name", ...)`, or `SpellScriptLoader("name")` subclass | `spell_script_names.ScriptName` -> `spell_id` (negative = all ranks)                                                                            | parse macro args; join to DB rows; expand ranks via `spell_ranks`                                                        | by-name (exact string)                     |
| 2   | Spell script hook -> effect      | `OnEffectHitTarget += SpellEffectFn(C::F, EFFECT_n, SPELL_EFFECT_X)` etc.                                                                                     | Spell.dbc `Effect[n]` / `EffectApplyAuraName[n]` of the bound spell                                                                             | regex on `+= \w+Fn(`; compare with DBC                                                                                   | exact (mismatch = dead hook)               |
| 3   | Creature script                  | `RegisterCreatureAI(C)`, `RegisterCreatureAIWithFactory`, per-dungeon `Register<X>CreatureAI`, or `CreatureScript("name")` subclass                           | `creature.ScriptName` (per spawn, wins) or `creature_template.ScriptName`                                                                       | macro/ctor string; join to DB                                                                                            | by-name                                    |
| 4   | GameObject script                | `RegisterGameObjectAI(C)`, `...WithFactory`, `GameObjectScript("name")`                                                                                       | `gameobject.ScriptName` / `gameobject_template.ScriptName`                                                                                      | same                                                                                                                     | by-name                                    |
| 5   | Item script                      | `ItemScript("name")` subclass                                                                                                                                 | `item_template.ScriptName`                                                                                                                      | ctor string                                                                                                              | by-name                                    |
| 6   | Instance script                  | `RegisterInstanceScript(C, mapId)` / `InstanceMapScript("name", mapId)`                                                                                       | `instance_template.script` (name) + Map.dbc ID (literal)                                                                                        | macro args                                                                                                               | by-name + exact (map)                      |
| 7   | World/BG map script              | `WorldMapScript("n", mapId)`, `BattlegroundMapScript("n", mapId)`                                                                                             | Map.dbc ID                                                                                                                                      | ctor 2nd arg                                                                                                             | exact                                      |
| 8   | AreaTrigger script               | `AreaTriggerScript("name")`                                                                                                                                   | `areatrigger_scripts.ScriptName` -> `entry` (AreaTrigger.dbc / `areatrigger`)                                                                   | ctor string                                                                                                              | by-name                                    |
| 9   | Other DB-bound scripts           | `OutdoorPvPScript`, `BattlegroundScript`, `AchievementCriteriaScript`, `ConditionScript`, `TransportScript`, `WeatherScript` ctor name                        | `outdoorpvp_template`, `battleground_template`, `achievement_criteria_data` (type 11), `conditions`, `transports`, `game_weather` `.ScriptName` | ctor string                                                                                                              | by-name                                    |
| 10  | Global hook script               | `PlayerScript`, `WorldScript`, `UnitScript`, `All*Script`, `GlobalScript`, etc., with `enabledHooks` list                                                     | none (fires for everything); internal ID literals give secondary edges                                                                          | base class + enabled-hook constants                                                                                      | exact for the hook, heuristic for content  |
| 11  | Script compiled in               | `Add<Folder>Scripts` / `Add<mod_name>Scripts` -> `AddSC_*` -> `new`/`Register*`                                                                               | file tree + `CMakeCache.txt`                                                                                                                    | call-graph walk from loader functions                                                                                    | exact (modulo build options)               |
| 12  | Unassigned/duplicate script name | name in code but not in any ScriptName column, or two scripts with one name                                                                                   | `LoadScriptNames` UNION (14 columns)                                                                                                            | set difference / duplicate detection                                                                                     | exact                                      |
| 13  | AI by name                       | `creature_template.AIName` / `gameobject_template.AIName` (e.g. `SmartAI`)                                                                                    | AI registry names in C++                                                                                                                        | string match; ScriptName overrides AIName                                                                                | by-name                                    |
| 14  | SmartAI                          | (data only) `smart_scripts` rows                                                                                                                              | `entryorguid` + `source_type` (0 creature, 1 GO, 2 areatrigger, 9 action list...), action params include spell IDs                              | SQL parse; action-type table needed                                                                                      | exact (IDs), heuristic (param meaning)     |
| 15  | Spell ID constant                | `enum { SPELL_X = 123 }`, `#define`, literal ints                                                                                                             | Spell.dbc `Id`                                                                                                                                  | enum/literal extraction; exclude type-enum prefixes (`SPELL_AURA_`, `SPELL_EFFECT_`, `SPELL_FAILED_`, `SPELL_ATTR`, ...) | heuristic                                  |
| 16  | Spell use in code                | `CastSpell(t, ID)`, `DoCast*(ID)`, `HasAura(ID)`, `GetAura(ID)`, `RemoveAurasDueToSpell(ID)`, `AddAura(ID)`                                                   | Spell.dbc `Id`                                                                                                                                  | call-site regex + constant resolution                                                                                    | exact when ID resolves, else unresolved    |
| 17  | Declared dependency              | `ValidateSpellInfo({ ... })`, `sSpellMgr->GetSpellInfo(ID)` / `AssertSpellInfo(ID)`                                                                           | Spell.dbc `Id`                                                                                                                                  | parse list                                                                                                               | exact                                      |
| 18  | Dynamic DBC read                 | `GetSpellInfo()->Effects[i].TriggerSpell`, `MiscValue`, ...                                                                                                   | Spell.dbc field of the bound spell                                                                                                              | pattern on `->Effects[...]`.member                                                                                       | heuristic (draw as self-field edge)        |
| 19  | Icon/family match                | `SpellIconID == N`, `SpellFamilyName == SPELLFAMILY_X`, `SpellFamilyFlags[i] & mask`                                                                          | Spell.dbc 133, 208, 209-211                                                                                                                     | comparison regex                                                                                                         | heuristic (matches a set of spells)        |
| 20  | Hardcoded spell correction       | `ApplySpellFix({ ids }, lambda)` in `SpellInfoCorrections.cpp`                                                                                                | Spell.dbc rows; assigned fields                                                                                                                 | parse ID list + assigned members in lambda                                                                               | exact                                      |
| 21  | Hardcoded non-spell DBC patch    | `const_cast<XEntry*>(sXStore.LookupEntry(N))->field = v`                                                                                                      | X.dbc row N                                                                                                                                     | regex                                                                                                                    | exact                                      |
| 22  | Custom attributes                | `spell_custom_attr` + hardcoded `case <id>:` in `LoadSpellInfoCustomAttributes` + `GlobalScript::OnLoadSpellCustomAttr`                                       | `SpellInfo::AttributesCu`                                                                                                                       | SQL + `case` literals; module override is heuristic                                                                      | exact / heuristic                          |
| 23  | DBC DB override                  | (data only) `<name>_dbc` table rows                                                                                                                           | same-ID row in `<Name>.dbc` replaced or added                                                                                                   | SQL parse, positional column mapping                                                                                     | exact                                      |
| 24  | DBC -> DBC references            | Spell.dbc index fields (28 CastTime, 40 Duration, 46 Range, 92-94 Radius, 131-132 Visual, 133 Icon, 1 Category, 224 AreaGroup, 226 RuneCost)                  | target DBC ID                                                                                                                                   | read file                                                                                                                | exact                                      |
| 25  | Spell -> spell (DBC)             | Spell.dbc 116-118 EffectTriggerSpell, 24-27 aura-spell requirements; Talent.dbc RankID; SkillLineAbility.Spell / SupercededBySpell                            | Spell.dbc `Id`                                                                                                                                  | read file                                                                                                                | exact                                      |
| 26  | Spell -> spell (family mask)     | `EffectSpellClassMask[eff]` (122-130) vs other spells' `SpellFamilyName`+`SpellFamilyFlags`                                                                   | Spell.dbc                                                                                                                                       | bitmask AND within same family                                                                                           | exact rule, many-to-many                   |
| 27  | Spell -> item / creature / GO    | Spell.dbc 52-59 Reagent, 50-51 Totem, 107-109 EffectItemType; `EffectMiscValue` for summon/GO effects                                                         | `item_template.entry`, `creature_template.entry`, `gameobject_template.entry`                                                                   | read file; MiscValue meaning keyed by Effect type                                                                        | exact (items), heuristic (MiscValue)       |
| 28  | Spell <- DB tables               | `spell_proc`, `spell_bonus_data`, `spell_linked_spell`, `spell_area`, `spell_target_position`, `spell_ranks`, `spell_required`, `spell_group`, ...            | Spell.dbc `Id`                                                                                                                                  | SQL parse                                                                                                                | exact                                      |
| 29  | Table loaded by function         | `WorldDatabase.Query("... FROM t")` or prepared stmt                                                                                                          | world-DB table                                                                                                                                  | regex on query strings + `WorldDatabase.cpp` statements                                                                  | exact (inline), exact via stmt map         |
| 30  | Lua entry-bound handler          | `RegisterCreatureEvent/CreatureGossipEvent/GameObjectEvent/GameObjectGossipEvent/ItemEvent/ItemGossipEvent(entry, ev, fn)`                                    | `creature_template` / `gameobject_template` / `item_template` `.entry`                                                                          | Lua AST: first arg literal or resolvable local                                                                           | exact if literal, heuristic if computed    |
| 31  | Lua spell handler                | `RegisterSpellEvent(spellId, ev, fn)`                                                                                                                         | Spell.dbc `Id`                                                                                                                                  | same                                                                                                                     | exact if literal                           |
| 32  | Lua map handler                  | `RegisterMapEvent(mapId, ev, fn)`; `RegisterInstanceEvent(instanceId, ...)` is runtime-only                                                                   | Map.dbc ID                                                                                                                                      | same                                                                                                                     | exact (map); not static (instance)         |
| 33  | Lua packet handler               | `RegisterPacketEvent(opcode, ev, fn)`                                                                                                                         | opcode number                                                                                                                                   | same                                                                                                                     | exact                                      |
| 34  | Lua gossip menu                  | `RegisterPlayerGossipEvent(menu_id, ev, fn)`                                                                                                                  | script-chosen menu ID (not `gossip_menu`)                                                                                                       | same                                                                                                                     | heuristic                                  |
| 35  | Lua global handler               | `RegisterServerEvent/PlayerEvent/GuildEvent/GroupEvent/BGEvent/TicketEvent/AllCreatureEvent(ev, fn)`                                                          | none; event number -> name via `Hooks.h`                                                                                                        | Lua AST                                                                                                                  | exact (event), content via literals inside |
| 36  | Lua addon channel                | `RegisterServerEvent(30, fn)` (ADDON_EVENT_ON_MESSAGE); AIO-style prefixes                                                                                    | client addon messages                                                                                                                           | Lua AST + prefix string literals                                                                                         | heuristic                                  |
| 37  | Lua script loaded                | file under `ALE.ScriptPath` (recursive, `.lua/.ext/.moon/.out`)                                                                                               | n/a                                                                                                                                             | file walk; flag duplicate base names (only first loads)                                                                  | exact                                      |
| 38  | Module SQL ships data            | `modules/<m>/data/sql/*world*/**.sql`                                                                                                                         | any world table (including `*_dbc`, ScriptName columns)                                                                                         | SQL parse                                                                                                                | exact                                      |
