# AzerothCore 3.3.5a world schema: the links between game content

Feasibility research for Canvas. Source: the clean AzerothCore checkout (path in `CLAUDE.local.md`), commit `9d9b6049a` ("chore(DB): import pending files"). Only local files were read; nothing in the checkout was changed. Written 2026-10-06.

## Conventions

- All paths are relative to the checkout root. `file:line` points at the exact line.
- Shorthands used throughout:
  - `W/x.sql` = `data/sql/base/db_world/x.sql` (base schema dump, one file per table)
  - `C/x.sql` = `data/sql/base/db_characters/x.sql`
  - `OM` = `src/server/game/Globals/ObjectMgr.cpp`
  - `SM` = `src/server/game/Spells/SpellMgr.cpp`
  - `CM` = `src/server/game/Conditions/ConditionMgr.cpp`, `CMh` = `.../ConditionMgr.h`
  - `SAI` = `src/server/game/AI/SmartScripts/SmartScriptMgr.cpp`, `SAIh` = `.../SmartScriptMgr.h`
  - `LM` = `src/server/game/Loot/LootMgr.cpp`
  - `GOD` = `src/server/game/Entities/GameObject/GameObjectData.h`
- "DBC" means a client data file (for example Spell.dbc) that the server reads from its `dbc/` folder. It is not in MySQL unless noted.
- **UNVERIFIED** means the files did not confirm the claim.

## 0. Findings that change how Canvas must work

1. **The base dump is not the live schema.** The base files include an `updates` table that lists 2,671 applied files. The newest is `2026_06_01_01.sql` (`W/updates.sql`). After that, 329 more files in `data/sql/updates/db_world/` (up to `2026_09_06_04.sql`) still run on a fresh install, and some of them change the schema. Example: `data/sql/updates/db_world/2026_06_16_00.sql:20` renames `creature.id1` to `creature.id`, drops `id2`/`id3` (line 23) and moves them into a new `creature_multispawn` table (line 3). The C++ already reads `creature.id` (`OM:2325`) and `creature_multispawn` (`OM:2502`). **Canvas must read the schema from the live database (`information_schema`), not from the base `.sql` files.**
2. **The schema declares no foreign keys.** In the world DB only `W/creature_sparring.sql` has a `FOREIGN KEY`. Every link below exists only in C++ code, so Canvas has to model each link type explicitly.
3. **Spells and talents live in DBC files, not in MySQL.** `Spell.dbc` is loaded with an optional SQL override table, `spell_dbc` (`src/server/game/DataStores/DBCStores.cpp:355`). Each override row replaces the whole DBC row with the same ID, or adds a new ID (`src/server/shared/DataStores/DBCDatabaseLoader.cpp:42`, `:127-131`). The base `spell_dbc` has 4,491 rows (server-side spells), and all of them have `Name_Lang_enUS` filled (`W/spell_dbc.sql:160`). Every other spell has **no name in the DB**. Canvas needs a DBC reader for labels.
4. **Many columns overload the sign or the value.** Negative IDs mean "all ranks", "remove", "game object instead of creature", or "reference". These are listed per table below and in the Edge catalogue.
5. **Some tables are still in the dump but nothing reads them.** C++ never reads `npc_trainer` (4,934 rows) or `spell_proc_event` (840 rows). Trainers moved to `trainer` / `trainer_spell` / `creature_default_trainer` (`data/sql/archive/db_world/2025_12_29_12.sql:4`). `spell_proc_event` is dropped by `data/sql/updates/db_world/2026_02_18_01.sql:1813`. That file is already marked applied in the base, so a fresh DB still contains the table. Canvas should flag such tables as "dead".

---

## 1. Starting spells, skills, items and action bars per class/race

### Encoding
- Class ID: `enum Classes` in `src/server/shared/SharedDefines.h:124-137`. **Mage = 8** (`:133`). The value is also the ChrClasses.dbc index (comment at `:122`). `MAX_CLASSES` = 12 (`:140`).
- Race ID: `enum Races` in `SharedDefines.h:68-92` (Human=1 … Draenei=11, 9 unused).
- Class mask = `1 << (classId - 1)`, so **Mage mask = 128** (`OM:4567`, and `CLASSMASK_*` at `SharedDefines.h:142-151`). The data agrees: `W/playercreateinfo_skills.sql:79` is `(0,128,6,0,'Mage - Frost')`.
- Race mask = `1 << (raceId - 1)` (`OM:4563`). Which races are playable comes from ChrRaces.dbc (`src/server/game/Entities/Player/RaceMgr.cpp:54-70`).
- A mask of 0 means "all" (`OM:4563`, `:4567`). An ID of 0 in `playercreateinfo_item` also means "all" (`OM:4492-4500`).

| Table | Key columns (type) | IDs | Loader |
|---|---|---|---|
| `playercreateinfo` | `race` tinyint u, `class` tinyint u (IDs), PK (race,class); `map`, `zone`, position (`W/playercreateinfo.sql:24-32`) | Map.dbc, AreaTable.dbc | `ObjectMgr::LoadPlayerInfo` `OM:4346`, SELECT `OM:4360` |
| `playercreateinfo_item` | `race`, `class` tinyint u (IDs, 0 = all), `itemid` int u, `amount` int (`W/playercreateinfo_item.sql:24-27`) | `item_template.entry`. `amount` -1 **removes** that item from the CharStartOutfit.dbc outfit (`OM:4317-4343`) | SELECT `OM:4447`; used at `src/server/game/Entities/Player/Player.cpp:666` |
| `playercreateinfo_skills` | `raceMask`, `classMask` int u (masks), `skill` smallint u, `rank` smallint u (`W/playercreateinfo_skills.sql:24-27`) | SkillLine.dbc ID | SELECT `OM:4518`; applied by `Player::LearnDefaultSkills` `Player.cpp:12099` |
| `playercreateinfo_spell_custom` | `racemask`, `classmask` int u (masks), `Spell` int u (`W/playercreateinfo_spell_custom.sql:24-26`) | Spell ID | SELECT `OM:4593`; used by `Player::LearnCustomSpells` `Player.cpp:12073`, **only when** `PlayerStart.CustomSpells = 1` (default 0: `src/server/game/World/WorldConfig.cpp:559`, `src/server/apps/worldserver/worldserver.conf.dist:1691`). Empty in the base data. |
| `playercreateinfo_cast_spell` | `raceMask`, `classMask` int u, `spell` int u, no PK (`W/playercreateinfo_cast_spell.sql:24-26`) | Spell ID cast on the first login | SELECT `OM:4651`; `src/server/game/Handlers/CharacterHandler.cpp:1016` |
| `playercreateinfo_action` | `race`, `class` tinyint u (IDs), `button` smallint u, `action` int u, `type` smallint u (`W/playercreateinfo_action.sql:24-28`) | `type` 0 = spell ID, 0x40 = macro, 0x80 = item entry (`src/server/game/Entities/Player/Player.h:222-227`) | SELECT `OM:4710`; `Player.cpp:626` |

**Where class spells actually come from.** Most starting spells are not listed in any table. `playercreateinfo_skills` grants skills. Granting a skill auto-learns every spell in SkillLineAbility.dbc for that skill whose `AcquireMethod` is "learned on skill learn" or "learned on skill value". The DBC row's own `RaceMask`/`ClassMask` filter which characters get it (`Player::learnSkillRewardedSpells` `Player.cpp:12231-12287`; `SKILL_LINE_ABILITY_LEARNED_ON_SKILL_VALUE` at `src/server/shared/DataStores/DBCEnums.h:360`). Canvas therefore needs SkillLineAbility.dbc to answer "what does a new mage know". `skilllineability_dbc` exists as an override table but is empty (`DBCStores.cpp:351`).

## 2. Learn chains and requirements

- **`spell_learn_spell` does not exist** in this checkout. There is no file in `W/`, no loader, and the only mention is a comment at `Player.cpp:3405`. The equivalents:
  - Spell.dbc effect `SPELL_EFFECT_LEARN_SPELL`: a "teaching" spell's trigger spell is the spell that gets learned. Trainers use this (`src/server/game/Entities/Creature/Trainer.cpp:27-29`, `:56`).
  - `SpellMgr::LoadSpellLearnSkills` (`SM:1455-1506`) builds spell→skill links from the Spell.dbc effects `SPELL_EFFECT_SKILL` and `DUAL_WIELD`. Nothing is read from the DB.
  - SkillLineAbility.dbc `SupercededBySpell` / `AcquireMethod` (`Player.cpp:12279-12285`).

| Table | Columns (type) | Meaning | Loader |
|---|---|---|---|
| `spell_required` | `spell_id` int, `req_spell` int, PK both (`W/spell_required.sql:24-26`) | You must know `req_spell` (Spell ID) before you can learn `spell_id` (Spell ID). Rows whose two spells are ranks of the same chain are rejected (`SM:1434`). | `SpellMgr::LoadSpellRequired` `SM:1390`, SELECT `SM:1398` |
| `spell_ranks` | `first_spell_id` int u, `spell_id` int u (UNIQUE), `rank` tinyint u; PK (first_spell_id, rank) (`W/spell_ranks.sql:24-28`) | Rank chain: every rank points at rank 1. Talent rank chains come from Talent.dbc, not from this table (`SpellMgr::LoadSpellTalentRanks` `SM:1218`). | `SpellMgr::LoadSpellRanks` `SM:1279`, SELECT `SM:1287` |
| `skill_discovery_template` | `spellId` int u, `reqSpell` int u, `reqSkillValue` smallint u, `chance` float; PK (spellId, reqSpell) (`W/skill_discovery_template.sql:24-28`) | `reqSpell` > 0: casting that craft spell can discover `spellId` (`src/server/game/Skills/SkillDiscovery.cpp:83`). `reqSpell` = 0: discovery is tied to the skill line of `spellId` in SkillLineAbility.dbc (`SkillDiscovery.cpp:114-124`). The loader reads it as int32 (`:72`), but the column is unsigned. | `LoadSkillDiscoveryTable` `SkillDiscovery.cpp:46`, SELECT `:53` |
| `skill_extra_item_template` | `spellId` int u PK, `requiredSpecialization` int u, `additionalCreateChance` float, `additionalMaxNum` tinyint (`W/skill_extra_item_template.sql:24-28`) | Craft spell → specialization spell (both Spell IDs) | `LoadSkillExtraItemTable` `src/server/game/Skills/SkillExtraItems.cpp:138`, SELECT `:145` |
| `skill_perfect_item_template` | `spellId` int u PK, `requiredSpecialization` int u, `perfectCreateChance` float, `perfectItemType` int u (`W/skill_perfect_item_template.sql:24-28`) | Craft spell → specialization spell; `perfectItemType` = `item_template.entry` | `LoadSkillPerfectItemTable` `SkillExtraItems.cpp:52`, SELECT `:59` |

## 3. Trainers

This checkout has `trainer`, `trainer_spell`, `trainer_locale` and `creature_default_trainer`. It also has a **dead** `npc_trainer` (see 0.5). The migration that created the new tables is `data/sql/archive/db_world/2025_12_29_12.sql`.

| Table | Columns (type) | Loader |
|---|---|---|
| `trainer` | `Id` int u PK, `Type` tinyint u, `Requirement` mediumint u, `Greeting` mediumtext (`W/trainer.sql:24-29`) | `ObjectMgr::LoadTrainers` `OM:9941`, SELECT `OM:10006` |
| `trainer_spell` | `TrainerId` int u, `SpellId` int u, `MoneyCost` int u, `ReqSkillLine` int u, `ReqSkillRank` int u, `ReqAbility1..3` int u, `ReqLevel` tinyint u; PK (TrainerId, SpellId) (`W/trainer_spell.sql:24-34`) | SELECT `OM:9950`, fields `OM:9957-9965` |
| `creature_default_trainer` | `CreatureId` int u PK, `TrainerId` int u (`W/creature_default_trainer.sql:24-26`) | `LoadCreatureDefaultTrainers` `OM:10070`, SELECT `OM:10076` |
| `trainer_locale` | `Id`, `locale`, `Greeting_lang` | SELECT `OM:10047` |

- Link path: `creature_template.entry` → `creature_default_trainer.CreatureId` → `TrainerId` → `trainer.Id` → `trainer_spell.TrainerId` → `SpellId`. The lookup is `ObjectMgr::GetTrainer(creatureId)` (`OM:10098-10105`). Callers are in `src/server/game/Handlers/NPCHandler.cpp:99,132` and `src/server/game/Entities/Player/PlayerGossip.cpp:121`. The creature must also have the trainer bit in `npcflag` (`UNIT_NPC_FLAG_TRAINER` = 0x10, `src/server/game/Entities/Unit/UnitDefines.h:326-328`).
- `trainer.Type` (`src/server/game/Entities/Creature/Trainer.h:31-37`) decides what `Requirement` means (`Trainer.cpp:209-228`):
  - 0 Class or 3 Pet: `Requirement` = **class ID**, which must equal the player's class. Class trainers are also indexed by class ID (`OM:10026-10033`).
  - 1 Mount: `Requirement` = **race ID**.
  - 2 Tradeskill: `Requirement` = **Spell ID** the player must know.
- Per-spell requirements: `ReqSkillLine` (SkillLine.dbc) with `ReqSkillRank` (`Trainer.cpp:164`); `ReqAbility1..3` = Spell IDs the player must already know (`Trainer.cpp:167`); `ReqLevel` (`Trainer.cpp:172`). Talent spells are rejected (`OM:9974`).
- `trainer_spell.SpellId` may be the "teaching" spell. In that case the spell actually learned is that spell's `SPELL_EFFECT_LEARN_SPELL` trigger (`Trainer.cpp:27-29`, `:112`, `:143`). To show the real learned spell, Canvas has to resolve this through Spell.dbc.
- No per-spell class or race columns exist. The class/race filter is per trainer only. The mage class trainers include `trainer` rows 16 and 17 (`W/trainer.sql:55-56`).
- `npc_trainer` (`W/npc_trainer.sql:24-31`: `ID`, `SpellID` int signed, `MoneyCost`, `ReqSkillLine`, `ReqSkillRank`, `ReqLevel`, `ReqSpell`) is not referenced anywhere in `src/` or `modules/`. Its negative `SpellID` values (for example `(198,-200007,…)`, `W/npc_trainer.sql:42`) look like the old "reference another trainer list" convention: **UNVERIFIED** (no loader left to confirm it).

## 4. Script bindings (DB string → C++ script)

Every `ScriptName` string becomes an ID through `ObjectMgr::GetScriptId` (`OM:10511`). `ObjectMgr::LoadScriptNames` (`OM:10449`, query `OM:10457-10484`) gathers the distinct names from exactly these sources:
- `achievement_criteria_data` (type 11 only)
- `battleground_template`
- `creature`, `creature_template`
- `gameobject`, `gameobject_template`
- `item_template`
- `areatrigger_scripts`
- `spell_script_names`
- `transports`
- `game_weather`
- `conditions`
- `outdoorpvp_template`
- `instance_template.script`

**No `scripted_areas` table exists** (no file in `W/`).

| Binding | Columns | Bound ID | Loader |
|---|---|---|---|
| `spell_script_names` | `spell_id` int (signed), `ScriptName` char(64); UNIQUE (spell_id, ScriptName) (`W/spell_script_names.sql:24-26`) | Spell ID. **`spell_id` ≤ 0 means "all ranks"**: the absolute value must be rank 1, and the script is attached to every rank in the chain (`OM:6365-6390`). One spell can have several scripts. | `ObjectMgr::LoadSpellScriptNames` `OM:6340`, SELECT `OM:6346` |
| `creature_template.ScriptName` | char(64) (`W/creature_template.sql:77`) | creature entry | `LoadCreatureTemplate` `OM:695` |
| `creature.ScriptName` (per spawn) | char(64) (`W/creature.sql:47`) | spawn guid; overrides the template, falls back to it when empty (`OM:2389-2393`) | `LoadCreatures` `OM:2325` |
| `creature_template.AIName` | char(64) (`W/creature_template.sql:65`) | Selects a built-in AI, for example `SmartAI`, which then uses `smart_scripts`. An unregistered name is cleared (`OM:1080-1083`). | `OM:658` |
| `gameobject_template.ScriptName` / `.AIName` | varchar(64) / char(64) (`W/gameobject_template.sql:56-57`) | GO entry | `LoadGameObjectTemplate` `OM:7805-7806` |
| `gameobject.ScriptName` (per spawn) | `W/gameobject.sql:42` | spawn guid, falls back to the template (`OM:2999-3002`) | `OM:2925` |
| `item_template.ScriptName` | varchar(64) (`W/item_template.sql:155`) | item entry | `LoadItemTemplates` `OM:3480` |
| `areatrigger_scripts` | `entry` int PK, `ScriptName` char(64) (`W/areatrigger_scripts.sql:24-26`) | AreaTrigger ID (AreaTrigger.dbc / `areatrigger` table) | `LoadAreaTriggerScripts` `OM:7098`, SELECT `OM:7103` |
| `instance_template` | `map` smallint u PK, `parent` smallint u, `script` varchar(128), `allowMount` (`W/instance_template.sql:24-28`) | Map.dbc ID | `LoadInstanceTemplate` `OM:6553`, SELECT `OM:6558`, script `OM:6584` |
| `outdoorpvp_template` | `TypeId` tinyint u PK, `ScriptName` (`W/outdoorpvp_template.sql:24-25`) | `OutdoorPvPTypes` enum (1 = HP … 7 = GH, `src/server/game/OutdoorPvP/OutdoorPvP.h:30-36`) | `OutdoorPvPMgr::InitOutdoorPvP` `src/server/game/OutdoorPvP/OutdoorPvPMgr.cpp:42`, SELECT `:47` |
| `battleground_template` | `ID` int u PK … `ScriptName` (`W/battleground_template.sql:24-35`) | BattlemasterList.dbc ID (`src/server/game/Battlegrounds/BattlegroundMgr.cpp:482-488`) | `BattlegroundMgr::LoadBattlegroundTemplates` `BattlegroundMgr.cpp:462`, SELECT `:470` |
| `achievement_criteria_data` | `criteria_id` int, `type` tinyint u, `value1`, `value2` int u, `ScriptName`; PK (criteria_id, type) (`W/achievement_criteria_data.sql:24-29`) | Achievement_Criteria.dbc ID. The meaning of `value1`/`value2` depends on `type` (`src/server/game/Achievements/AchievementMgr.h:59-84`): 1 = creature entry, 2/21 = class ID + race ID, 5/7 = Spell ID + effect index, 6 = area, 11 = SCRIPT, 16 = holiday, 20 = map, 23 = title. | `LoadAchievementCriteriaData` `src/server/game/Achievements/AchievementMgr.cpp:2817`, SELECT `:2823` |
| `conditions.ScriptName` | char(64) (`W/conditions.sql:37`) | the condition row | `CM:1184` |
| `spell_scripts` (legacy DB script) | `id` int u, `effIndex`, `delay`, `command`, `datalong`, `datalong2`, `dataint`, x/y/z/o (`W/spell_scripts.sql:24-34`) | Spell ID; the effect must be SCRIPT_EFFECT or DUMMY (`OM:6264-6265`) | `LoadSpellScripts` `OM:6241`, SELECT `OM:5948` |
| `event_scripts` | same shape, no `effIndex` (`W/event_scripts.sql:24-33`) | Event ID, referenced from GO `eventId` data fields, Spell.dbc `SEND_EVENT` MiscValue, and taxi node events (`OM:6277-6298`) | `LoadEventScripts` `OM:6269` |

What `command` means in `spell_scripts` / `event_scripts`: `ScriptCommands` in `src/server/game/Globals/ObjectMgr.h:95-125`. The values that reference entities:
- 7 QUEST_EXPLORED: `datalong` = quest
- 8 KILL_CREDIT: creature entry
- 9 RESPAWN_GAMEOBJECT, 11 OPEN_DOOR, 12 CLOSE_DOOR: GO **guid**
- 10 TEMP_SUMMON_CREATURE: creature entry
- 14 REMOVE_AURA, 15 CAST_SPELL: Spell ID
- 17 CREATE_ITEM: item entry
- 31 EQUIP: equip template
- 32 MODEL: model ID

**Lua scripts:** `modules/mod-ale` is a Lua engine (inferred from the name, UNVERIFIED). Lua scripts bind to entries at runtime and leave no trace in these tables, so Canvas cannot see them through the DB.

## 5. Spell-to-spell and spell-modifier tables

All Spell IDs here refer to Spell.dbc, possibly overridden by `spell_dbc`.

| Table | Columns (type) | Semantics | Loader |
|---|---|---|---|
| `spell_linked_spell` | `spell_trigger` int, `spell_effect` int, `type` tinyint u; UNIQUE (all 3) (`W/spell_linked_spell.sql:24-28`) | `type` 0 CAST, 1 HIT, 2 AURA (`src/server/game/Spells/SpellMgr.h:95-102`). Sign rules (`src/server/game/Spells/Spell.cpp:4064-4072`, `:3303-3313`; `src/server/game/Spells/Auras/SpellAuras.cpp:1245-1290`): **trigger > 0** fires when that spell is cast / hits / its aura is applied; **trigger < 0** fires when the aura is removed (type 0). **effect > 0** casts that spell or adds that aura; **effect < 0** removes that aura, or with type 2 grants immunity to it. | `LoadSpellLinked` `SM:2584`, SELECT `SM:2591`, encoding `SM:2603-2626` |
| `spell_proc` | `SpellId` int PK, `SchoolMask`, `SpellFamilyName`, `SpellFamilyMask0..2`, `ProcFlags`, `SpellTypeMask`, `SpellPhaseMask`, `HitMask`, `AttributesMask`, `DisableEffectsMask`, `ProcsPerMinute`, `Chance`, `Cooldown`, `Charges` (`W/spell_proc.sql:24-40`) | **`SpellId` < 0 means all ranks** (the absolute value must be rank 1) (`SM:2027-2047`). `SpellFamilyName`+`SpellFamilyMask` select a family of spells (a mask, not an ID). | `LoadSpellProcs` `SM:2006`, SELECT `SM:2013` |
| `spell_group` | `id` int u, `spell_id` int (signed); PK both (`W/spell_group.sql:24-26`) | `spell_id` > 0: a Spell ID, which must be rank 1 (`SM:1749-1757`). **`spell_id` < 0: a nested group ID** (`SM:1737-1741`). | `LoadSpellGroups` `SM:1700`, SELECT `SM:1708` |
| `spell_group_stack_rules` | `group_id` int u PK, `stack_rule` tinyint (`W/spell_group_stack_rules.sql:24-27`) | rule per `spell_group.id` | `LoadSpellGroupStackRules` `SM:1781`, SELECT `SM:1791` |
| `spell_custom_attr` | `spell_id` int u PK, `attributes` int u (`W/spell_custom_attr.sql:24-26`) | bitmask `SpellCustomAttributes` (`src/server/game/Spells/SpellInfo.h:175`) | `LoadSpellInfoCustomAttributes` `SM:3166`, SELECT `SM:3172` |
| `spell_area` | `spell` int u, `area` int u, `quest_start` int u, `quest_end` int u, `aura_spell` int, `racemask` int u, `gender` tinyint u, `autocast`, `quest_start_status`, `quest_end_status` (`W/spell_area.sql:24-34`) | Spell is active in an area (AreaTable.dbc) depending on quest state (quest IDs) and race mask. **`aura_spell` > 0: requires that aura; < 0: requires its absence** (`SM:1084-1085`). | `LoadSpellAreas` `SM:2811`, SELECT `SM:2821` |
| `spell_bonus_data` | `entry` int u PK, `direct_bonus`, `dot_bonus`, `ap_bonus`, `ap_dot_bonus` float (`W/spell_bonus_data.sql:24-30`) | Spell ID; numbers only | `LoadSpellBonuses` `SM:2295`, SELECT `SM:2302` |
| `spell_threat` | `entry` int u PK, `flatMod` int, `pctMod`, `apPctMod` float (`W/spell_threat.sql:24-28`) | Spell ID | `LoadSpellThreats` `SM:2336`, SELECT `SM:2343` |
| `spell_target_position` | `ID` int u, `EffectIndex` tinyint u, `MapID`, position; PK (ID, EffectIndex) (`W/spell_target_position.sql:24-32`) | Spell ID → Map.dbc ID | `LoadSpellTargetPositions` `SM:1508`, SELECT `SM:1515` |
| `spell_enchant_proc_data` | `entry` int u PK, `customChance`, `PPMChance`, `procEx`, `attributeMask` (`W/spell_enchant_proc_data.sql:24-29`) | **`entry` = SpellItemEnchantment.dbc ID, not a Spell ID** (`SM:2559-2561`) | `LoadSpellEnchantProcData` `SM:2539`, SELECT `SM:2546` |
| `spell_pet_auras` | `spell` int u, `effectId` tinyint u, `pet` int u (0 = all), `aura` int u; PK (spell, effectId, pet) (`W/spell_pet_auras.sql:24-28`) | Owner's dummy spell (Spell ID) → `aura` (Spell ID) applied to the pet; `pet` = creature entry. The effect must be DUMMY or APPLY_AURA+DUMMY (`SM:2471-2473`). | `LoadSpellPetAuras` `SM:2435`, SELECT `SM:2442` |
| `spell_mixology` | `entry` int u PK, `pctMod` float (`W/spell_mixology.sql:24-26`) | elixir/flask Spell ID | `LoadSpellMixology` `SM:2377`, SELECT `SM:2384` |
| `spell_cooldown_overrides` | `Id` int u PK, `RecoveryTime`, `CategoryRecoveryTime`, `StartRecoveryTime`, `StartRecoveryCategory` (`W/spell_cooldown_overrides.sql:24-30`) | Spell ID | `LoadSpellCooldownOverrides` `SM:3053`, SELECT `SM:3059` |
| `spell_cone`, `spell_jump_distance` | `ID`, `ConeDegrees` / `JumpDistance` | Spell ID; numbers only | `SM:1620`, `SM:3134` |
| `spell_loot_template` | loot shape (see 6) (`W/spell_loot_template.sql:24-34`) | `Entry` = Spell ID of a "create random item" spell (`LM:55`, `LM:2238-2257`) | `LoadLootTemplates_Spell` `LM:2228` |
| `spell_dbc` (override) | full Spell.dbc layout, 234 columns, `ID` PK (`W/spell_dbc.sql:23-259`) | Replaces or adds whole Spell.dbc rows. Holds names (`Name_Lang_enUS` `:160`). | `LOAD_DBC(sSpellStore,"Spell.dbc","spell_dbc")` `DBCStores.cpp:355`; generic `SELECT * … ORDER BY ID DESC` `DBCDatabaseLoader.cpp:42` |
| `spell_proc_event` | dead, see 0.5 | | none |

Every other `*_dbc` table follows the same override pattern (`DBCStores.cpp:272-370`). In the base data only these have rows: `spell_dbc`, `spelldifficulty_dbc` (604), `factiontemplate_dbc` (841), `achievement_dbc` (3), and the `gt*` tables.

## 6. Items

`item_template` (`W/item_template.sql`), loaded by `ObjectMgr::LoadItemTemplates` `OM:3315`, SELECT `OM:3320-3350`.

| Column (type) | Refers to | Ref |
|---|---|---|
| `entry` int u PK | item ID | `:24` |
| `name` varchar(255) | label | `:28` |
| `spellid_1..5` **int (signed)** | Spell ID | `:89,96,103,110,117`; read `OM:3439` |
| `spelltrigger_1..5` tinyint u | 0 ON_USE, 1 ON_EQUIP, 2 CHANCE_ON_HIT, 4 SOULSTONE, 5 ON_NO_DELAY_USE, 6 LEARN_SPELL_ID (`src/server/game/Entities/Item/ItemTemplate.h:77-88`) | `:90…`; `OM:3440` |
| `spellcharges_N` smallint, `spellppmRate_N` float, `spellcooldown_N` int (-1 = default), `spellcategory_N` smallint u, `spellcategorycooldown_N` int | numbers / SpellCategory.dbc | `:91-95…`; `OM:3441-3445` |
| `AllowableClass` int (-1 = all), `AllowableRace` int (-1 = all) | class mask / race mask | `:37-38`; `OM:3385-3386` |
| `RequiredSkill` smallint u + `RequiredSkillRank`, `requiredspell` int u | SkillLine.dbc ID; Spell ID | `:41-43` |
| `startquest` int u | `quest_template.ID` | `:129`; `OM:3453` |
| `lockid` int u | Lock.dbc ID | `:130`; `OM:3454` |
| `RandomProperty` int, `RandomSuffix` int u | `item_enchantment_template.entry` | `:133-134`; `OM:3457` |
| `itemset` int u | ItemSet.dbc ID (named by `item_set_names`) | `:136` |
| `PageText` int u | `page_text.ID` | `:126` |
| `socketBonus`, `GemProperties` | SpellItemEnchantment.dbc / GemProperties.dbc | `:148-149` |
| `DisenchantID` int u | `disenchant_loot_template.Entry` | `:156`; `LM:1958` |
| `area`, `Map`, `HolidayId`, `TotemCategory`, `ItemLimitCategory` | DBC IDs | `:138-154` |
| `ScriptName` | C++ script | `:155`; `OM:3480` |

Related tables:
- `item_enchantment_template`: `entry` int u, `ench` int u, `chance` float; PK (entry, ench) (`W/item_enchantment_template.sql:24-27`). `entry` matches `item_template.RandomProperty` or `RandomSuffix`. `ench` is an **ItemRandomProperties.dbc ID** when reached through RandomProperty, and an **ItemRandomSuffix.dbc ID** when reached through RandomSuffix (`src/server/game/Entities/Item/Item.cpp:641-664`). Loader: `LoadRandomEnchantmentsTable` `src/server/game/Entities/Item/ItemEnchantmentMgr.cpp:47`, SELECT `:54`.
- `item_set_names`: `entry` int u PK (ItemSet.dbc ID), `name`, `InventoryType` (`W/item_set_names.sql:24-28`). Loader `LoadItemSetNames` `OM:3967`, SELECT `OM:3988`, DBC check `OM:4004-4007`.
- **Loot tables.** They all share one shape: `Entry` int u, `Item` int u, `Reference` int, `Chance` float, `QuestRequired` tinyint, `LootMode` smallint u, `GroupId` tinyint u, `MinCount`/`MaxCount` tinyint u (`W/creature_loot_template.sql:24-32`; the PK differs: creature (Entry, Item, Reference, GroupId) `:34`, reference (Entry, Item) `W/reference_loot_template.sql:34`).
  - Generic loader: `LootStore::LoadLootTable` SELECT `LM:151`, fields `LM:162-170`.
  - `Item` = item entry.
  - **`Reference` ≠ 0 means "roll the `reference_loot_template` whose Entry = abs(Reference)"** (`LM:1415-1417`).
  - What `Entry` is keyed by, per table (`LM:44-56`):
    - `creature_loot_template.Entry` ← `creature_template.lootid` (`LM:1923`)
    - `pickpocketing_loot_template` ← `creature_template.pickpocketloot` (`LM:2112`)
    - `skinning_loot_template` ← `creature_template.skinloot` (`LM:2205`)
    - `gameobject_loot_template` ← GO `Data1` for chest (type 3) or fishing hole (type 25) (`GOD:540-549`, `LM:2019`)
    - `item_loot_template` ← `item_template.entry` (containers with the HAS_LOOT flag, `LM:2054-2055`)
    - `disenchant_loot_template` ← `item_template.DisenchantID` (`LM:1958`)
    - `milling_loot_template` and `prospecting_loot_template` ← herb/ore item entry
    - `fishing_loot_template` ← area ID
    - `mail_loot_template` ← MailTemplate.dbc ID
    - `spell_loot_template` ← Spell ID
    - `player_loot_template` ← team ID
  - So **`lootid` is not always equal to `creature_template.entry`.** Canvas must join through the column.
- `npc_vendor`: `entry` int u (creature entry), `item` int (**< 0 = include the vendor list of creature abs(item)**, `OM:10171-10176`), `ExtendedCost` (ItemExtendedCost.dbc) (`W/npc_vendor.sql:24-31`). Loader `LoadVendors` `OM:10146`.
- `creature_questitem` / `gameobject_questitem` (`OM:11100`, `OM:11055`): creature/GO entry → item entry (quest drop list).

## 7. Creatures

`creature_template` (`W/creature_template.sql:23-81`), loader `LoadCreatureTemplates` `OM:523` / `LoadCreatureTemplate` `OM:585`, SELECT `OM:528-540`.
- **There are no `spell1..spell8` columns and no `trainer_*` columns.** Creature spells moved to `creature_template_spell`.
- Link columns:
  - `difficulty_entry_1..3` (`:25-27`) → creature entry (heroic / 25-player versions)
  - `KillCredit1..2` (`:28-29`) → creature entry
  - `gossip_menu_id` (`:33`) → `gossip_menu.MenuID`
  - `faction` (`:37`) → FactionTemplate.dbc
  - `npcflag` (`:38`) → bitmask (trainer, vendor, …)
  - `unit_class` (`:51`) → class ID
  - `family` (`:55`) → CreatureFamily.dbc
  - `lootid` / `pickpocketloot` / `skinloot` (`:58-60`) → loot tables
  - `PetSpellDataId` (`:61`) → CreatureSpellData.dbc
  - `VehicleId` (`:62`) → Vehicle.dbc
  - `AIName` (`:65`), `ScriptName` (`:77`)
  - `CreatureImmunitiesId` (`:75`) → `creature_immunities.ID` (`SM:68`)

| Table | Columns (type) | Semantics | Loader |
|---|---|---|---|
| `creature_template_spell` | `CreatureID` int u, `Index` tinyint u (0..7, CHECK), `Spell` int u; PK (CreatureID, Index) (`W/creature_template_spell.sql:24-29`) | creature entry → Spell ID in action slot Index (`MAX_CREATURE_SPELLS` = 8, `src/server/game/Entities/Unit/Unit.h:46`). Used for vehicle and charmed action bars (`src/server/game/Entities/Creature/Creature.cpp:574`). | `LoadCreatureTemplateSpells` `OM:810`, SELECT `OM:815` |
| `creature_template_addon` | `entry` int u PK, `path_id`, `mount`, `bytes1`, `bytes2`, `emote`, `visibilityDistanceType`, `auras` text (`W/creature_template_addon.sql:24-31`) | `auras` = **space-separated Spell IDs** (`OM:892-919`); `mount` = display ID; `path_id` = `waypoint_data.id` | `LoadCreatureTemplateAddons` `OM:856`, SELECT `OM:861` |
| `creature_addon` | same columns but keyed by `guid` (spawn) (`W/creature_addon.sql:24-32`) | per-spawn auras | `LoadCreatureAddons` `OM:1262`, SELECT `OM:1267` |
| `npc_spellclick_spells` | `npc_entry` int u, `spell_id` int u, `cast_flags` tinyint u, `user_type` smallint u; PK (npc_entry, spell_id) (`W/npc_spellclick_spells.sql:24-28`) | creature entry → Spell ID cast on click. `cast_flags` bit0 = caster is player, bit1 = target is player. | `LoadNPCSpellClickSpells` `OM:8566`, SELECT `OM:8572` |
| `creature_summon_groups` | `summonerId` int u, `summonerType` tinyint u, `groupId` tinyint u, `entry` int u, position, `summonType`, `summonTime`; no PK (`W/creature_summon_groups.sql:24-34`) | `summonerType` 0 = creature entry, 1 = GO entry, 2 = map ID (`src/server/game/Entities/Creature/TemporarySummon.h:26-28`) → summoned creature `entry` | `LoadTempSummons` `OM:2153`, SELECT `OM:2158`, switch `OM:2177-2191` |
| `gameobject_summon_groups` | same idea; it summons GOs (schema re-created by `data/sql/updates/db_world/2026_02_15_04.sql:5`) | | SELECT `OM:2246` |
| `vehicle_template_accessory` | `entry` int u, `accessory_entry` int u, `seat_id` tinyint, `minion`, `summontype`, `summontimer`; PK (entry, seat_id) (`W/vehicle_template_accessory.sql:24-31`) | vehicle creature entry → passenger creature entry | `LoadVehicleTemplateAccessories` `OM:4051`, SELECT `OM:4060` |
| `vehicle_accessory` | same, keyed by `guid` (`W/vehicle_accessory.sql:24-31`) | spawn → passenger entry | SELECT `OM:4116` |
| `creature_equip_template` | `CreatureID`, `ID`, `ItemID1..3` | creature entry → item entries (weapons shown) | SELECT `OM:1485` |
| `creature_text` | `CreatureID`, `GroupID`, `ID`, `Text`, … `BroadcastTextId` | creature entry → text lines (SmartAI TALK uses `GroupID`) | `src/server/database/Database/Implementation/WorldDatabase.cpp:29` |
| `creature` (spawns) | `guid` PK, `id` (after update 2026_06_16_00; `id1` in base `W/creature.sql:25`), `map`, …, `ScriptName` | spawn → creature entry; extra entries are in `creature_multispawn` (`spawnId`, `entry`) | `LoadCreatures` `OM:2320` |

**`smart_scripts` (SmartAI)** (`W/smart_scripts.sql:24-55`). Loader: `SmartAIMgr::LoadSmartAIFromDB` `SAI:117`, prepared statement `src/server/database/Database/Implementation/WorldDatabase.cpp:31`.
- Key: PK (`entryorguid` int **signed**, `source_type` tinyint u, `id` smallint u, `link` smallint u).
- `source_type` (`SAIh:1801-1814`):
  - 0 creature, 1 gameobject, 2 areatrigger
  - 3 event, 4 gossip, 5 quest, 6 spell, 7 transport, 8 instance: in the enum, but the C++ comments mark only 0, 1, 2 and 9 as "done"
  - 9 timed action list
- `entryorguid` ≥ 0 (`SAI:155`): source 0 = `creature_template.entry` (`SAI:161`), 1 = `gameobject_template.entry` (`SAI:170`), 2 = AreaTrigger ID (`SAI:179`), 9 = action-list ID (by convention entry×100+n, called from action 80; convention UNVERIFIED).
- **`entryorguid` < 0 = spawn guid**: `creature.guid` for source 0 (`SAI:199`), `gameobject.guid` for source 1 (`SAI:208`).
- `link` = the `id` of the row this row chains to (event type 61 LINK). Columns: `event_type` + `event_param1..6`, `action_type` + `action_param1..6`, `target_type` + `target_param1..4` + x/y/z/o.
- **Which params hold IDs depends on the type**, so Canvas must decode per enum:
  - Events (`SAIh:97+`) whose param1 is an ID:
    - Spell ID: 8 SPELLHIT, 16 FRIENDLY_MISSING_BUFF, 23 HAS_AURA, 24 TARGET_BUFFED, 31 SPELLHIT_TARGET (13 VICTIM_CASTING has the spell in param3)
    - creature entry: 17 SUMMONED_UNIT, 35 SUMMON_DESPAWNED, 82 SUMMONED_UNIT_DIES (5 KILL has it in param4)
    - quest ID: 19 ACCEPTED_QUEST, 20 REWARD_QUEST
    - AreaTrigger ID: 46 AREATRIGGER_ONTRIGGER
    - gossip menu: 62 GOSSIP_SELECT
    - game_event: 68 / 69 GAME_EVENT_START / END
    - event ID: 71 GO_EVENT_INFORM
    - guid + entry: 75 / 76 DISTANCE_CREATURE / DISTANCE_GAMEOBJECT
    - creature_text group: 52 TEXT_OVER
  - Actions (`SAIh:540+`):
    - Spell ID in param1: 11 CAST, 28 REMOVEAURASFROMSPELL, 75 ADD_AURA, 85 SELF_CAST, 86 CROSS_CAST, 134 INVOKER_CAST, 218 CUSTOM_CAST
    - creature entry: 3 MORPH_TO_ENTRY_OR_MODEL, 12 SUMMON_CREATURE, 33 CALL_KILLEDMONSTER, 36 UPDATE_TEMPLATE, 43 MOUNT_TO_ENTRY_OR_MODEL
    - summon group: 107 SUMMON_CREATURE_GROUP
    - GO entry: 50 SUMMON_GO; GO summon group: 241 SUMMON_GAMEOBJECT_GROUP
    - quest ID: 6, 7, 15, 26
    - item entry: 56 ADD_ITEM, 57 REMOVE_ITEM
    - creature_text group: 1 TALK, 84 SIMPLE_TALK
    - action list: 80 / 87 / 88 CALL_TIMED_ACTIONLIST (and variants)
    - gossip menu: 98 SEND_GOSSIP_MENU, 240 SET_GOSSIP_MENU
    - equipment: 71 EQUIP, 124 LOAD_EQUIPMENT
  - Targets (`SAIh:1548+`): creature entry in 9, 11, 19 (and 10 = guid + entry); GO entry in 13, 15, 20 (and 14 = guid + entry); summoned-creature entry in 204.
- Conditions can be attached per event (section 10, source type 22).

## 8. Quests

`quest_template` (`W/quest_template.sql:23-130`), `LoadQuests` `OM:5081`, SELECT `OM:5092-5120`.

| Column (type) | Refers to | Ref |
|---|---|---|
| `ID` int u PK | quest | `:24` |
| `LogTitle` text | label | `:98` |
| `RewardSpell` **int** | Spell ID **cast** on the player when the quest is rewarded (C++ field `RewardSpell`, accessor `GetRewSpellCast`) | `:40`; `src/server/game/Quests/QuestDef.h:274`; `src/server/game/Entities/Player/PlayerQuest.cpp:855-864` |
| `RewardDisplaySpell` int u | Spell ID shown as the reward; it is cast only if `RewardSpell` is 0 (accessor `GetRewSpell`) | `:39`; `QuestDef.h:273`; `PlayerQuest.cpp:866-875` |
| `StartItem` int u | item entry given when the quest starts (count = `quest_template_addon.ProvidedItemCount`) | `:43`; `OM:5469` |
| `RewardItem1..4` int u | item entry | `:46,48,50,52` |
| `RewardChoiceItemID1..6` int u | item entry | `:62-72` |
| `ItemDrop1..4` int u | item entry (source item for objectives) | `:54-60` |
| `RequiredItemId1..6` int u | item entry to collect | `:111-116` |
| `RequiredNpcOrGo1..4` **int** | **> 0 creature entry, < 0 = −(GO entry)** | `:103-106`; `OM:5561-5575` |
| `RewardNextQuest` int u | quest ID | `:35` |
| `AllowableRaces` int u | race mask | `:97` |
| `RequiredFactionId1..2`, `RewardFactionID1..5` | Faction.dbc | `:31-32`, `:81-93` |
| `RewardTitle` | CharTitles.dbc | `:78` |
| `QuestSortID` | > 0 zone (AreaTable), < 0 QuestSort | `:28` (sign convention UNVERIFIED here) |

**`RequiredSpellCast` does not exist** in this schema. Spell-cast objectives go through `RequiredNpcOrGo` plus the special flag CAST (`OM:5581`).

`quest_template_addon` (`W/quest_template_addon.sql:23-43`), SELECT `OM:5229` (LEFT JOIN `quest_mail_sender`):
- `AllowableClasses` int u: **class mask** (`:26`)
- `SourceSpellID` int u: Spell ID cast on accept (`:27`; `OM:5491`)
- `PrevQuestID` int (sign = must be done vs active, UNVERIFIED), `NextQuestID` int u, `ExclusiveGroup` int, `BreadcrumbForQuestId`: quest-to-quest links (`:28-31`)
- `RewardMailTemplateID` (`:32`)
- `RequiredSkillID` + `RequiredSkillPoints`: SkillLine (`:34-35`)
- `RequiredMin/MaxRepFaction` (`:36-37`)
- `ProvidedItemCount` (`:40`)

Quest givers and enders: `creature_queststarter`, `creature_questender`, `gameobject_queststarter`, `gameobject_questender`, each `id` int u + `quest` int u, PK (id, quest) (`W/creature_queststarter.sql:24-26` etc.). `id` = creature entry or GO entry. Loaded by `LoadQuestRelationsHelper` `OM:8833` (SELECT `OM:8841`, LEFT JOIN `pool_quest`), called at `OM:8880, 8894, 8908, 8922`. Also `areatrigger_involvedrelation` (`id` = AreaTrigger, `quest`) at `OM:6814`.

## 9. Game objects

`gameobject_template` (`W/gameobject_template.sql:23-61`): `entry` int u PK, `type` tinyint u, `displayId`, `name` varchar(100) (`:27`), `Data0..Data23` (all int u except **`Data1` and `Data6`, which are signed int**, `:33`), `AIName`, `ScriptName`. Loader: `LoadGameObjectTemplate` `OM:7764`, SELECT `OM:7769-7773`. Meaning of the Data fields per type (`GOD`, union starting at `:40`; type enum `src/server/shared/SharedDefines.h:1564-1599`):

| type | Data field → meaning | Ref |
|---|---|---|
| 2 QUESTGIVER | Data0 lockId (Lock.dbc), Data1 questList, Data3 gossipID | `GOD:67-79` |
| 3 CHEST | Data0 lockId, **Data1 lootId → `gameobject_loot_template.Entry`**, Data6 eventId → `event_scripts`, Data7 linkedTrapId → GO entry, Data8 questId | `GOD:81-100` |
| 6 TRAP | Data0 lockId, Data2 diameter, **Data3 spellId**, Data4 trap type, Data5 cooldown | `GOD:113-130` |
| 8 SPELL_FOCUS | **Data0 focusId → SpellFocusObject.dbc** (a spell's `RequiresSpellFocus` points to the same ID, `src/server/shared/DataStores/DBCStructure.h:1659`), Data1 dist, Data2 linkedTrapId, Data4 questID | `GOD:140-149` |
| 10 GOOBER | Data0 lockId, Data1 questId (signed), Data2 eventId, Data7 pageId, **Data10 spellId**, Data12 linkedTrapId, Data19 gossipID | `GOD:159-181` |
| 18 SUMMONING_RITUAL | Data1 spellId, Data2 animSpell, Data4 casterTargetSpell | `GOD:229-239` |
| 22 SPELLCASTER | Data0 spellId, Data1 charges | `GOD:249-256` |
| 25 FISHINGHOLE | Data1 lootId | `GOD:277-284` |

The helpers that collect these per type are `GetLockId` `GOD:428`, `GetLinkedGameObjectEntry` `GOD:494`, `GetLootId` `GOD:540`, `GetEventScriptId` `GOD:566`. `gameobject_loot_template` uses the shared loot shape (section 6); loader `LoadLootTemplates_Gameobject` `LM:2006`.

## 10. Conditions

`conditions` (`W/conditions.sql:23-40`):
- Columns: `SourceTypeOrReferenceId` int, `SourceGroup` int u, `SourceEntry` int, `SourceId` int, `ElseGroup` int u, `ConditionTypeOrReference` int, `ConditionTarget` tinyint u, `ConditionValue1..3` int u, `NegativeCondition`, `ErrorType`, `ErrorTextId`, `ScriptName`, `Comment`.
- PK is the first 10 columns.
- Loader: `ConditionMgr::LoadConditions` `CM:1123`, SELECT `CM:1155`, fields `CM:1171-1184`.
- **Negative `SourceTypeOrReferenceId`** = this row defines a reusable reference template with that (negated) ID. **Negative `ConditionTypeOrReference`** = "check reference template abs(value)" (`CM:1186-1200`, `CM:1233-1235`).
- Rows with the same source and the same `ElseGroup` are combined with AND; different `ElseGroup` values are combined with OR (TC/AC convention, UNVERIFIED in the code read).

Source types (`CMh:124-157`) and what SourceGroup / SourceEntry / SourceId are:

| # | Source | SourceGroup | SourceEntry | SourceId | Ref |
|---|---|---|---|---|---|
| 1-12, 28 | `*_loot_template` (creature, disenchant, fishing, gameobject, item, mail, milling, pickpocketing, prospecting, reference, skinning, spell, player) | loot `Entry` | item entry (or reference) | – | `CM:1565-1767`, `CM:1907-1917` |
| 13 | SPELL_IMPLICIT_TARGET | effect mask (1..7) | Spell ID | – | `CM:1769-1835` |
| 14 | GOSSIP_MENU | `gossip_menu.MenuID` | `TextID` | – | `CM:1423-1431` |
| 15 | GOSSIP_MENU_OPTION | MenuID | OptionID | – | `CM:1443-1450` |
| 16 | CREATURE_TEMPLATE_VEHICLE | – | creature entry | – | `CM:1839-1841` |
| 17 | SPELL | – | Spell ID | – | `CM:1848-1851` |
| 18 | SPELL_CLICK_EVENT | creature entry | Spell ID | – | `CM:1876-1883`, `CM:1324` |
| 19 | QUEST_AVAILABLE | – | quest ID | – | `CM:1859-1860` |
| 20 | GOSSIP_HELLO | – | creature entry | – | `CM:1866-1868` |
| 21 | VEHICLE_SPELL | creature entry | Spell ID | – | `CM:1875-1883`, `CM:1334` |
| 22 | SMART_EVENT | `smart_scripts.id` + 1 | `entryorguid` | `source_type` | `CM:1339-1343`, `CM:1047-1053` |
| 23 | NPC_VENDOR | vendor creature entry | item entry | – | `CM:1889-1898` |
| 24 | SPELL_PROC | – | Spell ID | – | `CM:1849` |
| 29 | CREATURE_RESPAWN | UNVERIFIED | UNVERIFIED | | `CMh:155` |
| 30 | OBJECT_VISIBILITY | 0 creature / 1 GO | entry | spawn guid | `CM:1924-1976`, `CM:1357` |

Condition types (`CMh:31-94`) whose values reference an entity, with Value1 / Value2 / Value3:
- 1 AURA: Spell ID / effIndex
- 2 ITEM: item entry / count / bank
- 3 ITEM_EQUIPPED: item entry
- 4 ZONEID, 23 AREAID, 22 MAPID: DBC IDs
- 5 REPUTATION_RANK: faction
- 7 SKILL: skill ID / value
- 8 QUESTREWARDED, 9 QUESTTAKEN, 14 QUEST_NONE, 28 QUEST_COMPLETE, 43 DAILY_QUEST_DONE, 47 QUESTSTATE, 48 QUEST_OBJECTIVE_PROGRESS, 101 QUEST_SATISFY_EXCLUSIVE: quest ID
- 12 ACTIVE_EVENT: game_event
- **15 CLASS: class value** (column comment says "class"; whether it is a class ID or a class mask is UNVERIFIED in the code read; check `Condition::Meets` before relying on it)
- 16 RACE: race (same caveat)
- 17 ACHIEVEMENT, 39 REALM_ACHIEVEMENT
- 18 TITLE
- **25 SPELL: Spell ID the player has learned**
- 29 NEAR_CREATURE: creature entry
- 30 NEAR_GAMEOBJECT: GO entry
- 31 OBJECT_ENTRY_GUID: TypeID / entry / guid
- 102 HAS_AURA_TYPE: aura type (an enum, not an ID)

`disables` (`W/disables.sql:23-31`: `sourceType` int u, `entry` int u, `flags`, `params_0/1`; loader `src/server/game/Conditions/DisableMgr.cpp:41`, SELECT `:49`) can switch off any of these (`DisableMgr.h:28-38`): 0 spell, 1 quest, 2 map, 3 battleground, 4 achievement criteria, 5 outdoor PvP, 9 game event, 10 loot. Canvas could show this as a "disabled" flag on the target node.

## 11. Talents

- **Talents are not in the world DB as data.** They come from `Talent.dbc` / `TalentTab.dbc` (`DBCStores.cpp:370`, store declared `:167-170`). Each Talent row lists rank Spell IDs (`SpellRank_1..9`), prerequisite talents, and `RequiredSpellID` (layout visible in the empty override table `W/talent_dbc.sql:23-48`; 0 rows; `talenttab_dbc` is also empty).
- Talent rank chains are built from Talent.dbc (`SM:1218-1277`).
- The characters DB stores learned talents as Spell IDs (section 15).

## 12. Human-readable labels

| Entity | Label column | Locale table (loader) |
|---|---|---|
| creature | `creature_template.name` char(100), `subname` (`W/creature_template.sql:30-31`) | `creature_template_locale` (`entry`, `locale`, `Name`, `Title`; `W/creature_template_locale.sql:24-29`), `OM:401` |
| item | `item_template.name` varchar(255) (`W/item_template.sql:28`) | `item_template_locale` `OM:3269` |
| game object | `gameobject_template.name` varchar(100) (`W/gameobject_template.sql:27`) | `gameobject_template_locale` `OM:7683` |
| quest | `quest_template.LogTitle` text (`W/quest_template.sql:98`) | `quest_template_locale` (`Title`) `OM:5898` |
| item set | `item_set_names.name` (`W/item_set_names.sql:25`) | `item_set_names_locale` `OM:3945` |
| trainer | `trainer.Greeting` (no name) | `trainer_locale` `OM:10047` |
| gossip option | `gossip_menu_option.OptionText` (`W/gossip_menu_option.sql:27`) | `gossip_menu_option_locale` `OM:430` |
| comments | `smart_scripts.comment`, `conditions.Comment`, `spell_linked_spell.comment`, `playercreateinfo_*.Note`, `spell_group_stack_rules.description` | – |
| **spell** | **none in the DB** except `spell_dbc.Name_Lang_enUS` for override rows (`W/spell_dbc.sql:160`) | none; names come from `Spell.dbc` plus the client locale DBCs (`DBCStores.cpp:221-236`) |
| talent, skill, class, race, area, map, faction | none; DBC only (`chrclasses_dbc`, `skillline_dbc` etc. are empty override tables) | – |

Other locale tables in the base: `achievement_reward_locale`, `broadcast_text_locale`, `creature_text_locale`, `module_string_locale`, `npc_text_locale`, `page_text_locale`, `pet_name_generation_locale`, `points_of_interest_locale`, `quest_greeting_locale`, `quest_offer_reward_locale`, `quest_request_items_locale` (list from `W/`).

## 13. The updater: applied vs unapplied SQL

- `updates`: `name` varchar(200) PK (file name), `hash` char(40) (SHA1 of the file), `state` enum RELEASED / CUSTOM / MODULE / ARCHIVED / PENDING, `timestamp`, `speed` (`W/updates.sql:23-30`). The same table exists in each of the three DBs.
- `updates_include`: `path` varchar(200) PK (`$` = source dir), `state` (`W/updates_include.sql:2745-2749`; rows `:37-40`):
  - `$/data/sql/archive/db_world` ARCHIVED
  - `$/data/sql/custom/db_world` CUSTOM
  - `$/data/sql/updates/db_world` RELEASED
  - `$/data/sql/updates/pending_db_world` PENDING
  - The characters DB has the same four with `db_characters` (`C/updates_include.sql:37-40`).
- Algorithm (`src/server/database/Updater/UpdateFetcher.cpp`, `DBUpdater.cpp`):
  1. On an empty DB, import every file in `data/sql/base/db_<x>/` (`DBUpdater.cpp:387-389`, base dir `:132`).
  2. Read `updates_include` and expand `$` (`UpdateFetcher.cpp:129-140`).
  3. **Modules:** for each module compiled in, add `modules/<mod>/data/sql/<dir>` when `<dir>`'s name *contains* `world` / `characters` / `auth` (`UpdateFetcher.cpp:163-183`; the DB keyword is from `DBUpdater.cpp:150-154`). These get state MODULE. The module list is the CMake `AC_MODULES_LIST` (`modules/CMakeLists.txt:340`, `:357-359`), passed in at `src/server/apps/worldserver/Main.cpp:440`.
  4. Walk each directory recursively, up to depth 10, `.sql` files only. **Duplicate file names across all directories are fatal** (`UpdateFetcher.cpp:74-100`).
  5. Compare with the `updates` rows (SELECT `UpdateFetcher.cpp:197`): SHA1 per file (`:297`); a renamed file with the same hash is detected (`:304-329`); a changed hash means the file is **re-applied** when `Updates.Redundancy` is on (`:351`); ARCHIVED files are skipped unless `Updates.ArchivedRedundancy` is on (`:289`).
  6. Apply RELEASED/ARCHIVED files first, then PENDING/CUSTOM/MODULE files (`:395-406`). Record each with `REPLACE INTO updates` (`:464`). Rows for files that no longer exist are deleted when there are ≤ `CleanDeadRefMaxCount` of them (`:409-430`).
  7. Config: `Updates.EnableDatabases = 7`, `AutoSetup`, `Redundancy`, `ArchivedRedundancy`, `AllowRehash`, `CleanDeadRefMaxCount` (`src/server/apps/worldserver/worldserver.conf.dist:289-353`).
- `data/sql/custom/` is for user SQL and must be re-runnable: `CREATE IF NOT EXISTS`, `REPLACE`, `DELETE`+`INSERT` (`data/sql/custom/README.md`). Its `db_world` folder is empty in this checkout.
- **Telling applied from unapplied SQL:** a file is applied when `updates.name` = its file name **and** `updates.hash` = SHA1 of its current content. A file with no row, or with a different hash, is pending. Canvas can reproduce this without running the server: list the included directories (plus module dirs) and SHA1 each file. Exactly how the file is normalized before hashing (`ReadSQLUpdate`, `:297`) is UNVERIFIED; it must be matched byte for byte.
- Local module notes:
  - A module SQL folder whose path does not contain "world" or "characters" is ignored by the updater (by the rule in step 3). Worth surfacing in Canvas: SQL that exists in a repo but can never be applied.
  - In `mod-transmog`, `data/sql/updates/char` is likewise not picked up (its parent folder name `updates` contains no DB keyword). Same rule; UNVERIFIED whether this is intended.

## 14. Database names, defaults, MySQL version

- Defaults: `acore_auth`, `acore_world`, `acore_characters`, user/password `acore`/`acore` on `127.0.0.1:3306` (`src/server/apps/worldserver/worldserver.conf.dist:123-125`; `src/server/apps/authserver/authserver.conf.dist:232`). The create script uses charset utf8mb4 / `utf8mb4_unicode_ci` (`data/sql/create/create_mysql.sql:5-9`).
- MySQL minimum: **8.0**, enforced at build time (`src/cmake/macros/FindMySQL.cmake:54`, check `:56-66`; `CMakeLists.txt:109`). The base dumps were produced with MySQL 8.4.3 (dump header, `W/npc_trainer.sql:1-5`). MariaDB support is UNVERIFIED.
- Some tables use `utf8mb4_general_ci` instead of `unicode_ci`: `trainer`, `trainer_spell`, `creature_default_trainer` (`W/trainer.sql:30`). This matters for string joins only.

## 15. Characters DB: what a character actually has

All `guid` columns = `characters.guid` (`C/characters.sql:24`; `race` `:27`, `class` `:28` are IDs).

| Table | Key columns | Refers to | Loader (prepared stmt, `src/server/database/Database/Implementation/CharacterDatabase.cpp`) |
|---|---|---|---|
| `character_spell` | `guid`, `spell` int u, `specMask` tinyint u; PK (guid, spell) (`C/character_spell.sql:24-27`) | Spell ID | `CHAR_SEL_CHARACTER_SPELL` `:78` |
| `character_talent` | `guid`, `spell` int u, `specMask`; PK (guid, spell) (`C/character_talent.sql:24-27`) | Spell ID of the talent rank (Talent.dbc `SpellRank_N`) | `CHAR_SEL_CHARACTER_TALENTS` `:107` |
| `character_inventory` | `guid`, `bag` int u, `slot` tinyint u, `item` int u PK; UNIQUE (guid, bag, slot) (`C/character_inventory.sql:24-30`) | `item` = `item_instance.guid` (not the item entry); `bag` = the bag's item_instance guid, 0 = backpack/equipment | `CHAR_SEL_CHARACTER_INVENTORY` `:90` |
| `item_instance` | `guid` PK, `itemEntry` int u, `owner_guid`, `enchantments` text, `randomPropertyId` smallint, `charges`, … (`C/item_instance.sql:23-40`) | `itemEntry` = `item_template.entry`; `enchantments` = space-separated SpellItemEnchantment IDs per slot (format UNVERIFIED) | (joined in the stmt above) |
| `character_action` | `guid`, `spec`, `button`, `action` int u, `type` tinyint u; PK (guid, spec, button) (`C/character_action.sql:24-29`) | the same `type` encoding as `playercreateinfo_action` | `CHAR_SEL_CHARACTER_ACTIONS` `:92` |
| `character_skills` | `guid`, `skill`, `value`, `max` (`C/character_skills.sql:24-28`) | SkillLine.dbc | `:108` |
| `character_aura` | `guid`, `casterGuid`, `itemGuid`, `spell`, … (`C/character_aura.sql:24-40`) | Spell ID | `:76` |
| `character_glyphs` | `guid`, `talentGroup`, `glyph1..6` | GlyphProperties.dbc | `:106` |
| `character_queststatus` / `_rewarded` | `guid`, `quest` | quest ID | – |
| `character_achievement` | `guid`, `achievement` | Achievement.dbc | – |

No characters-DB update after the base touches these tables (checked `data/sql/updates/db_characters/*.sql`).

---

## Edge catalogue

Cardinality is written as from:to. "N:M" means many rows per source and per target. "via DBC" means the target or label needs a DBC reader. Sign tricks are in Notes.

| Edge | From | To | Source table.column | Card. | Notes |
|---|---|---|---|---|---|
| start_location | race+class | map/zone | playercreateinfo.map/zone | 1:1 | IDs, not masks |
| start_item | race+class | item | playercreateinfo_item.itemid | N:M | race/class 0 = all; amount -1 = remove from the CharStartOutfit.dbc outfit |
| start_skill | race mask + class mask | skill (DBC) | playercreateinfo_skills.skill | N:M | masks, 0 = all; spells follow via SkillLineAbility.dbc |
| skill_grants_spell | skill (DBC) | spell | SkillLineAbility.dbc (no DB) | N:M | filtered by the DBC's RaceMask/ClassMask; the real source of most class spells |
| start_spell_custom | race mask + class mask | spell | playercreateinfo_spell_custom.Spell | N:M | only if PlayerStart.CustomSpells = 1; empty in base |
| start_cast_spell | race mask + class mask | spell | playercreateinfo_cast_spell.spell | N:M | cast on first login |
| start_action | race+class | spell / item / macro | playercreateinfo_action.action | N:M | `type` 0 spell, 0x80 item, 0x40 macro |
| spell_requires_spell | spell | spell | spell_required.req_spell | N:M | |
| spell_rank_of | spell | spell (rank 1) | spell_ranks.first_spell_id | N:1 | talent chains come from Talent.dbc |
| teaches_spell | spell (teacher) | spell | Spell.dbc LEARN_SPELL effect | 1:N | via DBC |
| spell_grants_skill | spell | skill | Spell.dbc SKILL effect | 1:1 | via DBC (`SM:1455`) |
| discovery | craft spell (or skill line) | spell | skill_discovery_template.spellId/reqSpell | N:M | reqSpell 0 = via the skill line of spellId |
| craft_extra_requires | craft spell | specialization spell | skill_extra_item_template.requiredSpecialization | N:1 | |
| craft_perfect | craft spell | spec spell; item | skill_perfect_item_template.requiredSpecialization / perfectItemType | N:1 | |
| creature_trainer | creature | trainer | creature_default_trainer.TrainerId | N:1 | npcflag must include TRAINER |
| trainer_teaches | trainer | spell | trainer_spell.SpellId | 1:N | may be a "teaching" spell → resolve the LEARN_SPELL effect |
| trainer_requires_spell | trainer_spell row | spell | trainer_spell.ReqAbility1..3 | N:M | |
| trainer_requires_skill | trainer_spell row | skill | trainer_spell.ReqSkillLine (+Rank) | N:1 | |
| trainer_for_class | trainer | class ID / race ID / spell | trainer.Requirement (by Type) | N:1 | Type 0/3 class, 1 race, 2 spell |
| spell_script | spell | C++ script | spell_script_names.ScriptName | N:M | spell_id ≤ 0 = all ranks of abs(id) |
| creature_script | creature | C++ script | creature_template.ScriptName | N:1 | also per spawn: creature.ScriptName |
| creature_ai | creature | AI type | creature_template.AIName | N:1 | SmartAI → smart_scripts |
| go_script | GO | C++ script | gameobject_template.ScriptName | N:1 | also gameobject.ScriptName, AIName |
| item_script | item | C++ script | item_template.ScriptName | N:1 | |
| areatrigger_script | areatrigger | C++ script | areatrigger_scripts.ScriptName | 1:1 | |
| instance_script | map | C++ script | instance_template.script | 1:1 | |
| outdoorpvp_script | OutdoorPvP type | C++ script | outdoorpvp_template.ScriptName | 1:1 | |
| bg_script | battleground | C++ script | battleground_template.ScriptName | 1:1 | ID = BattlemasterList.dbc |
| achievement_criteria_script | criteria | C++ script / creature / spell / class | achievement_criteria_data.ScriptName / value1 | N:M | value meaning depends on `type` |
| condition_script | condition row | C++ script | conditions.ScriptName | N:1 | |
| spell_db_script | spell | script commands | spell_scripts.id | 1:N | commands reference creature/spell/item/GO guid |
| event_db_script | event ID | script commands | event_scripts.id | 1:N | event raised by GO Data / Spell.dbc SEND_EVENT |
| spell_linked | spell | spell | spell_linked_spell.spell_effect | N:M | type 0/1/2; trigger < 0 = on aura removal; effect < 0 = remove aura / immunity |
| spell_proc_rule | spell | proc rule (attrs) | spell_proc.SpellId | 1:1 | < 0 = all ranks; SpellFamilyMask selects target spells (mask match, not an ID) |
| spell_in_group | spell | spell group | spell_group.spell_id | N:M | spell_id < 0 = nested group |
| group_stack_rule | spell group | rule | spell_group_stack_rules.stack_rule | 1:1 | |
| spell_custom_attr | spell | attr flags | spell_custom_attr.attributes | 1:1 | node property, not an edge |
| spell_area | spell | area; quest; aura spell | spell_area.area / quest_start / quest_end / aura_spell | N:M | aura_spell < 0 = must not have it; racemask |
| spell_teleport_target | spell | map | spell_target_position.MapID | 1:N (per effect) | |
| enchant_proc | enchantment (DBC) | proc rule | spell_enchant_proc_data.entry | 1:1 | entry is SpellItemEnchantment, not a spell |
| pet_aura | spell | spell (aura); creature | spell_pet_auras.aura / pet | N:M | pet 0 = all |
| spell_bonus / threat / mixology / cooldown_override | spell | numbers | spell_bonus_data / spell_threat / spell_mixology / spell_cooldown_overrides | 1:1 | node properties |
| spell_override_row | spell | spell_dbc row | spell_dbc.ID | 1:1 | replaces the DBC row; source of server-side spell names |
| spell_creates_random_item | spell | loot | spell_loot_template.Entry | 1:N | |
| item_spell | item | spell | item_template.spellid_1..5 | 1:N (≤5) | spelltrigger_N gives the edge subtype (use/equip/proc/learn) |
| item_requires_spell | item | spell | item_template.requiredspell | N:1 | |
| item_requires_skill | item | skill | item_template.RequiredSkill | N:1 | |
| item_class_restrict | item | class mask / race mask | item_template.AllowableClass / AllowableRace | N:M | -1 = all |
| item_starts_quest | item | quest | item_template.startquest | N:1 | |
| item_set | item | item set | item_template.itemset | N:1 | name in item_set_names, members in ItemSet.dbc |
| item_random_ench | item | enchant pool | item_template.RandomProperty / RandomSuffix | N:1 | → item_enchantment_template.entry |
| ench_pool_member | enchant pool | ItemRandomProperties / Suffix (DBC) | item_enchantment_template.ench | 1:N | target DBC depends on which column led here |
| item_disenchant | item | loot | item_template.DisenchantID | N:1 | → disenchant_loot_template |
| item_contains | item | loot | item_loot_template.Entry = item entry | 1:N | needs ITEM_FLAG_HAS_LOOT |
| item_lock | item | lock (DBC) | item_template.lockid | N:1 | |
| loot_item | loot entry | item | *_loot_template.Item | N:M | Chance, GroupId, QuestRequired as edge attrs |
| loot_reference | loot entry | reference loot | *_loot_template.Reference | N:M | abs(Reference) → reference_loot_template.Entry |
| creature_loot | creature | loot | creature_template.lootid | N:1 | lootid ≠ entry in general |
| creature_pickpocket | creature | loot | creature_template.pickpocketloot | N:1 | |
| creature_skin | creature | loot | creature_template.skinloot | N:1 | |
| creature_spell | creature | spell | creature_template_spell.Spell | 1:N (≤8) | Index = action slot |
| creature_aura | creature | spell | creature_template_addon.auras | 1:N | space-separated list in one text column |
| spawn_aura | creature spawn | spell | creature_addon.auras | 1:N | |
| spellclick | creature | spell | npc_spellclick_spells.spell_id | 1:N | cast_flags, user_type |
| summon_group | creature / GO / map | creature | creature_summon_groups.entry | N:M | summonerType 0/1/2 |
| vehicle_passenger | creature | creature | vehicle_template_accessory.accessory_entry | 1:N | per seat; also per spawn (vehicle_accessory) |
| creature_difficulty | creature | creature | creature_template.difficulty_entry_1..3 | 1:3 | |
| creature_kill_credit | creature | creature | creature_template.KillCredit1..2 | N:M | |
| creature_gossip | creature | gossip menu | creature_template.gossip_menu_id | N:1 | |
| creature_vendor_item | creature | item | npc_vendor.item | N:M | item < 0 = include the vendor list of creature abs(item) |
| creature_equip | creature | item | creature_equip_template.ItemID1..3 | 1:N | |
| creature_immunities | creature | immunity profile | creature_template.CreatureImmunitiesId | N:1 | |
| creature_spawn | creature | spawn | creature.id (+ creature_multispawn.entry) | 1:N | column was `id1` before update 2026_06_16_00 |
| smart_owner | creature / GO / areatrigger / spawn / actionlist | smart rule | smart_scripts.entryorguid + source_type | 1:N | entryorguid < 0 = spawn guid |
| smart_link | smart rule | smart rule | smart_scripts.link | 1:1 | same (entryorguid, source_type) |
| smart_event_ref | smart rule | spell / creature / quest / gossip / areatrigger | smart_scripts.event_param1..4 | N:M | decode by event_type |
| smart_action_ref | smart rule | spell / creature / GO / item / quest / actionlist / text | smart_scripts.action_param1 | N:M | decode by action_type |
| smart_target_ref | smart rule | creature / GO (entry or guid) | smart_scripts.target_param1..2 | N:M | decode by target_type |
| quest_reward_spell | quest | spell | quest_template.RewardSpell (cast) / RewardDisplaySpell | N:1 | RewardSpell wins if > 0 |
| quest_source_spell | quest | spell | quest_template_addon.SourceSpellID | N:1 | cast on accept |
| quest_reward_item | quest | item | quest_template.RewardItem1..4, RewardChoiceItemID1..6 | 1:N | |
| quest_start_item | quest | item | quest_template.StartItem | N:1 | |
| quest_required_item | quest | item | quest_template.RequiredItemId1..6, ItemDrop1..4 | 1:N | |
| quest_objective | quest | creature / GO | quest_template.RequiredNpcOrGo1..4 | 1:N | > 0 creature, < 0 GO |
| quest_chain | quest | quest | RewardNextQuest; addon PrevQuestID / NextQuestID / ExclusiveGroup / BreadcrumbForQuestId | N:M | PrevQuestID sign UNVERIFIED |
| quest_class_restrict | quest | class mask / race mask | addon.AllowableClasses / quest_template.AllowableRaces | N:M | masks |
| quest_requires_skill | quest | skill | addon.RequiredSkillID | N:1 | |
| quest_starter | creature / GO | quest | creature_queststarter / gameobject_queststarter.quest | N:M | |
| quest_ender | creature / GO | quest | creature_questender / gameobject_questender.quest | N:M | |
| areatrigger_quest | areatrigger | quest | areatrigger_involvedrelation.quest | N:M | |
| quest_drop_item | creature / GO | item | creature_questitem / gameobject_questitem.ItemId | 1:N | |
| go_loot | GO (chest / fishing hole) | loot | gameobject_template.Data1 | N:1 | only types 3, 25 |
| go_spell | GO (trap / goober / ritual / spellcaster) | spell | Data3 / Data10 / Data1 / Data0 | N:1 | field depends on type |
| go_spellfocus | GO (spell focus) | SpellFocusObject (DBC) | Data0 | N:1 | spells reach it via Spell.dbc RequiresSpellFocus |
| go_linked_trap | GO | GO | chest Data7 / goober Data12 / focus Data2 | N:1 | |
| go_event | GO | event_scripts | chest Data6 / goober Data2 | N:1 | |
| go_quest | GO | quest | chest Data8 / goober Data1 | N:1 | |
| go_lock | GO | lock (DBC) | Data0 (most types) | N:1 | |
| condition_on | condition | source object (loot item, spell, gossip, quest, vendor item, smart event, …) | conditions.SourceTypeOrReferenceId + SourceGroup / SourceEntry / SourceId | N:1 | see the table in section 10 |
| condition_tests | condition | spell / item / quest / creature / GO / class / race / skill | conditions.ConditionTypeOrReference + ConditionValue1..3 | N:1 | negative ConditionTypeOrReference = reference template |
| condition_ref | condition | condition reference template | conditions.ConditionTypeOrReference < 0 | N:1 | |
| disabled | disables row | spell / quest / map / BG / … | disables.sourceType + entry | 1:1 | node flag |
| char_knows_spell | character | spell | character_spell.spell | N:M | specMask |
| char_talent | character | spell (talent rank) | character_talent.spell | N:M | |
| char_owns_item | character | item_instance → item | character_inventory.item → item_instance.itemEntry | 1:N | two hops |
| char_action | character | spell / item / macro | character_action.action | 1:N | per spec |
| char_skill / aura / quest / achievement | character | skill / spell / quest / achievement | character_skills / character_aura / character_queststatus* / character_achievement | 1:N | |
| sql_file_applied | SQL file | DB | updates.name + hash | 1:1 | applied = row exists and hash matches the SHA1 of the file |
