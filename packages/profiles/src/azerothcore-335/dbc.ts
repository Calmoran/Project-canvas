import type { DbcLayout } from "@canvas/core";

/**
 * The layout of every DBC file the server loads: one entry per active
 * `LOAD_DBC` call in `src/server/game/DataStores/DBCStores.cpp:272-383`
 * (code research 1.3; the two commented-out calls are not loaded and have no
 * entry). `format` is the server's own format string, copied verbatim from
 * `src/server/shared/DataStores/DBCfmt.h`; `overrideTable` is the
 * world-DB table the loader applies afterwards. Every citation points at
 * commit 9d9b6049 (the profile's `core` source). Field names are absent
 * here: PROF-3 names them.
 */
export const dbc: DbcLayout[] = [
  {
    file: "AreaTable.dbc",
    format: "niiiixxxxxissssssssssssssssxiiiiixxx",
    overrideTable: "areatable_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:272",
      "core:src/server/shared/DataStores/DBCfmt.h:24",
    ],
  },
  {
    file: "Achievement.dbc",
    format: "niixssssssssssssssssxxxxxxxxxxxxxxxxxxiixixxxxxxxxxxxxxxxxxxii",
    overrideTable: "achievement_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:273",
      "core:src/server/shared/DataStores/DBCfmt.h:21",
    ],
  },
  {
    file: "Achievement_Category.dbc",
    format: "nixxxxxxxxxxxxxxxxxx",
    overrideTable: "achievement_category_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:274",
      "core:src/server/shared/DataStores/DBCfmt.h:22",
    ],
  },
  {
    file: "Achievement_Criteria.dbc",
    format: "niiiiiiiixxxxxxxxxxxxxxxxxiiiix",
    overrideTable: "achievement_criteria_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:275",
      "core:src/server/shared/DataStores/DBCfmt.h:23",
    ],
  },
  {
    file: "AreaGroup.dbc",
    format: "niiiiiii",
    overrideTable: "areagroup_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:276",
      "core:src/server/shared/DataStores/DBCfmt.h:25",
    ],
  },
  {
    file: "AreaPOI.dbc",
    format: "niiiiiiiiiiifffixixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxix",
    overrideTable: "areapoi_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:277",
      "core:src/server/shared/DataStores/DBCfmt.h:26",
    ],
  },
  {
    file: "AuctionHouse.dbc",
    format: "niiixxxxxxxxxxxxxxxxx",
    overrideTable: "auctionhouse_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:278",
      "core:src/server/shared/DataStores/DBCfmt.h:27",
    ],
  },
  {
    file: "BankBagSlotPrices.dbc",
    format: "ni",
    overrideTable: "bankbagslotprices_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:279",
      "core:src/server/shared/DataStores/DBCfmt.h:28",
    ],
  },
  {
    file: "BattlemasterList.dbc",
    format: "niiiiiiiiixssssssssssssssssxiixx",
    overrideTable: "battlemasterlist_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:280",
      "core:src/server/shared/DataStores/DBCfmt.h:30",
    ],
  },
  {
    file: "BarberShopStyle.dbc",
    format: "nixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxiii",
    overrideTable: "barbershopstyle_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:281",
      "core:src/server/shared/DataStores/DBCfmt.h:29",
    ],
  },
  {
    file: "CharStartOutfit.dbc",
    format:
      "dbbbXiiiiiiiiiiiiiiiiiiiiiiiixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    overrideTable: "charstartoutfit_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:282",
      "core:src/server/shared/DataStores/DBCfmt.h:31",
    ],
  },
  {
    file: "CharTitles.dbc",
    format: "nxssssssssssssssssxssssssssssssssssxi",
    overrideTable: "chartitles_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:283",
      "core:src/server/shared/DataStores/DBCfmt.h:32",
    ],
  },
  {
    file: "ChatChannels.dbc",
    format: "nixssssssssssssssssxxxxxxxxxxxxxxxxxx",
    overrideTable: "chatchannels_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:284",
      "core:src/server/shared/DataStores/DBCfmt.h:33",
    ],
  },
  {
    file: "ChrClasses.dbc",
    format: "nxixssssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxixii",
    overrideTable: "chrclasses_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:285",
      "core:src/server/shared/DataStores/DBCfmt.h:34",
    ],
  },
  {
    file: "ChrRaces.dbc",
    format:
      "niixiixixxxxiissssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxi",
    overrideTable: "chrraces_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:286",
      "core:src/server/shared/DataStores/DBCfmt.h:35",
    ],
  },
  {
    file: "CinematicCamera.dbc",
    format: "nsiffff",
    overrideTable: "cinematiccamera_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:287",
      "core:src/server/shared/DataStores/DBCfmt.h:36",
    ],
  },
  {
    file: "CinematicSequences.dbc",
    format: "nxixxxxxxx",
    overrideTable: "cinematicsequences_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:288",
      "core:src/server/shared/DataStores/DBCfmt.h:37",
    ],
  },
  {
    file: "CreatureDisplayInfo.dbc",
    format: "nixifxxxxxxxxxxx",
    overrideTable: "creaturedisplayinfo_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:289",
      "core:src/server/shared/DataStores/DBCfmt.h:38",
    ],
  },
  {
    file: "CreatureDisplayInfoExtra.dbc",
    format: "dixxxxxxxxxxxxxxxxxxx",
    overrideTable: "creaturedisplayinfoextra_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:290",
      "core:src/server/shared/DataStores/DBCfmt.h:39",
    ],
  },
  {
    file: "CreatureFamily.dbc",
    format: "nfifiiiiixssssssssssssssssxx",
    overrideTable: "creaturefamily_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:291",
      "core:src/server/shared/DataStores/DBCfmt.h:40",
    ],
  },
  {
    file: "CreatureModelData.dbc",
    format: "nixxfxxxxxxxxxfffxxxxxxxxxxx",
    overrideTable: "creaturemodeldata_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:292",
      "core:src/server/shared/DataStores/DBCfmt.h:41",
    ],
  },
  {
    file: "CreatureSpellData.dbc",
    format: "niiiixxxx",
    overrideTable: "creaturespelldata_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:293",
      "core:src/server/shared/DataStores/DBCfmt.h:42",
    ],
  },
  {
    file: "CreatureType.dbc",
    format: "nxxxxxxxxxxxxxxxxxx",
    overrideTable: "creaturetype_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:294",
      "core:src/server/shared/DataStores/DBCfmt.h:43",
    ],
  },
  {
    file: "CurrencyTypes.dbc",
    format: "xnxi",
    overrideTable: "currencytypes_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:295",
      "core:src/server/shared/DataStores/DBCfmt.h:44",
    ],
  },
  {
    file: "DestructibleModelData.dbc",
    format: "nxxixxxixxxixxxixxx",
    overrideTable: "destructiblemodeldata_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:296",
      "core:src/server/shared/DataStores/DBCfmt.h:45",
    ],
  },
  {
    file: "DungeonEncounter.dbc",
    format: "niixissssssssssssssssxx",
    overrideTable: "dungeonencounter_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:297",
      "core:src/server/shared/DataStores/DBCfmt.h:46",
    ],
  },
  {
    file: "DurabilityCosts.dbc",
    format: "niiiiiiiiiiiiiiiiiiiiiiiiiiiii",
    overrideTable: "durabilitycosts_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:298",
      "core:src/server/shared/DataStores/DBCfmt.h:47",
    ],
  },
  {
    file: "DurabilityQuality.dbc",
    format: "nf",
    overrideTable: "durabilityquality_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:299",
      "core:src/server/shared/DataStores/DBCfmt.h:48",
    ],
  },
  {
    file: "Emotes.dbc",
    format: "nxxiiix",
    overrideTable: "emotes_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:300",
      "core:src/server/shared/DataStores/DBCfmt.h:49",
    ],
  },
  {
    file: "EmotesText.dbc",
    format: "nxixxxxxxxxxxxxxxxx",
    overrideTable: "emotestext_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:301",
      "core:src/server/shared/DataStores/DBCfmt.h:50",
    ],
  },
  {
    file: "Faction.dbc",
    format: "niiiiiiiiiiiiiiiiiiffixssssssssssssssssxxxxxxxxxxxxxxxxxx",
    overrideTable: "faction_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:302",
      "core:src/server/shared/DataStores/DBCfmt.h:51",
    ],
  },
  {
    file: "FactionTemplate.dbc",
    format: "niiiiiiiiiiiii",
    overrideTable: "factiontemplate_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:303",
      "core:src/server/shared/DataStores/DBCfmt.h:52",
    ],
  },
  {
    file: "GameObjectArtKit.dbc",
    format: "nxxxxxxx",
    overrideTable: "gameobjectartkit_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:304",
      "core:src/server/shared/DataStores/DBCfmt.h:53",
    ],
  },
  {
    file: "GameObjectDisplayInfo.dbc",
    format: "nsxxxxxxxxxxffffffx",
    overrideTable: "gameobjectdisplayinfo_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:305",
      "core:src/server/shared/DataStores/DBCfmt.h:54",
    ],
  },
  {
    file: "GemProperties.dbc",
    format: "nixxi",
    overrideTable: "gemproperties_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:306",
      "core:src/server/shared/DataStores/DBCfmt.h:55",
    ],
  },
  {
    file: "GlyphProperties.dbc",
    format: "niix",
    overrideTable: "glyphproperties_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:307",
      "core:src/server/shared/DataStores/DBCfmt.h:56",
    ],
  },
  {
    file: "GlyphSlot.dbc",
    format: "nii",
    overrideTable: "glyphslot_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:308",
      "core:src/server/shared/DataStores/DBCfmt.h:57",
    ],
  },
  {
    file: "gtBarberShopCostBase.dbc",
    format: "df",
    overrideTable: "gtbarbershopcostbase_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:309",
      "core:src/server/shared/DataStores/DBCfmt.h:58",
    ],
  },
  {
    file: "gtCombatRatings.dbc",
    format: "df",
    overrideTable: "gtcombatratings_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:310",
      "core:src/server/shared/DataStores/DBCfmt.h:59",
    ],
  },
  {
    file: "gtChanceToMeleeCritBase.dbc",
    format: "df",
    overrideTable: "gtchancetomeleecritbase_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:311",
      "core:src/server/shared/DataStores/DBCfmt.h:60",
    ],
  },
  {
    file: "gtChanceToMeleeCrit.dbc",
    format: "df",
    overrideTable: "gtchancetomeleecrit_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:312",
      "core:src/server/shared/DataStores/DBCfmt.h:61",
    ],
  },
  {
    file: "gtChanceToSpellCritBase.dbc",
    format: "df",
    overrideTable: "gtchancetospellcritbase_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:313",
      "core:src/server/shared/DataStores/DBCfmt.h:62",
    ],
  },
  {
    file: "gtChanceToSpellCrit.dbc",
    format: "df",
    overrideTable: "gtchancetospellcrit_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:314",
      "core:src/server/shared/DataStores/DBCfmt.h:63",
    ],
  },
  {
    file: "gtNPCManaCostScaler.dbc",
    format: "df",
    overrideTable: "gtnpcmanacostscaler_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:315",
      "core:src/server/shared/DataStores/DBCfmt.h:64",
    ],
  },
  {
    file: "gtOCTClassCombatRatingScalar.dbc",
    format: "df",
    overrideTable: "gtoctclasscombatratingscalar_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:316",
      "core:src/server/shared/DataStores/DBCfmt.h:65",
    ],
  },
  {
    file: "gtOCTRegenHP.dbc",
    format: "df",
    overrideTable: "gtoctregenhp_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:317",
      "core:src/server/shared/DataStores/DBCfmt.h:66",
    ],
  },
  {
    file: "gtRegenHPPerSpt.dbc",
    format: "df",
    overrideTable: "gtregenhpperspt_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:319",
      "core:src/server/shared/DataStores/DBCfmt.h:68",
    ],
  },
  {
    file: "gtRegenMPPerSpt.dbc",
    format: "df",
    overrideTable: "gtregenmpperspt_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:320",
      "core:src/server/shared/DataStores/DBCfmt.h:69",
    ],
  },
  {
    file: "Holidays.dbc",
    format: "niiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiixxsiix",
    overrideTable: "holidays_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:321",
      "core:src/server/shared/DataStores/DBCfmt.h:70",
    ],
  },
  {
    file: "Item.dbc",
    format: "niiiiiii",
    overrideTable: "item_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:322",
      "core:src/server/shared/DataStores/DBCfmt.h:71",
    ],
  },
  {
    file: "ItemBagFamily.dbc",
    format: "nxxxxxxxxxxxxxxxxx",
    overrideTable: "itembagfamily_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:323",
      "core:src/server/shared/DataStores/DBCfmt.h:72",
    ],
  },
  {
    file: "ItemDisplayInfo.dbc",
    format: "nxxxxsxxxxxxxxxxxxxxxxxxx",
    overrideTable: "itemdisplayinfo_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:324",
      "core:src/server/shared/DataStores/DBCfmt.h:73",
    ],
  },
  {
    file: "ItemExtendedCost.dbc",
    format: "niiiiiiiiiiiiiix",
    overrideTable: "itemextendedcost_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:326",
      "core:src/server/shared/DataStores/DBCfmt.h:75",
    ],
  },
  {
    file: "ItemLimitCategory.dbc",
    format: "nxxxxxxxxxxxxxxxxxii",
    overrideTable: "itemlimitcategory_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:327",
      "core:src/server/shared/DataStores/DBCfmt.h:76",
    ],
  },
  {
    file: "ItemRandomProperties.dbc",
    format: "nxiiiiissssssssssssssssx",
    overrideTable: "itemrandomproperties_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:328",
      "core:src/server/shared/DataStores/DBCfmt.h:77",
    ],
  },
  {
    file: "ItemRandomSuffix.dbc",
    format: "nssssssssssssssssxxiiiiiiiiii",
    overrideTable: "itemrandomsuffix_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:329",
      "core:src/server/shared/DataStores/DBCfmt.h:78",
    ],
  },
  {
    file: "ItemSet.dbc",
    format: "dssssssssssssssssxiiiiiiiiiixxxxxxxiiiiiiiiiiiiiiiiii",
    overrideTable: "itemset_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:330",
      "core:src/server/shared/DataStores/DBCfmt.h:79",
    ],
  },
  {
    file: "LFGDungeons.dbc",
    format: "nssssssssssssssssxiiiiiiiiixxixixxxxxxxxxxxxxxxxx",
    overrideTable: "lfgdungeons_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:331",
      "core:src/server/shared/DataStores/DBCfmt.h:80",
    ],
  },
  {
    file: "Light.dbc",
    format: "nifffxxxxxxxxxx",
    overrideTable: "light_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:332",
      "core:src/server/shared/DataStores/DBCfmt.h:81",
    ],
  },
  {
    file: "LiquidType.dbc",
    format: "nxxixixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    overrideTable: "liquidtype_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:333",
      "core:src/server/shared/DataStores/DBCfmt.h:82",
    ],
  },
  {
    file: "Lock.dbc",
    format: "niiiiiiiiiiiiiiiiiiiiiiiixxxxxxxx",
    overrideTable: "lock_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:334",
      "core:src/server/shared/DataStores/DBCfmt.h:83",
    ],
  },
  {
    file: "MailTemplate.dbc",
    format: "nxxxxxxxxxxxxxxxxxssssssssssssssssx",
    overrideTable: "mailtemplate_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:335",
      "core:src/server/shared/DataStores/DBCfmt.h:84",
    ],
  },
  {
    file: "Map.dbc",
    format:
      "nxiixssssssssssssssssxixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxixiffxixi",
    overrideTable: "map_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:336",
      "core:src/server/shared/DataStores/DBCfmt.h:85",
    ],
  },
  {
    file: "MapDifficulty.dbc",
    format: "diisxxxxxxxxxxxxxxxxiix",
    overrideTable: "mapdifficulty_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:337",
      "core:src/server/shared/DataStores/DBCfmt.h:86",
    ],
  },
  {
    file: "Movie.dbc",
    format: "nxx",
    overrideTable: "movie_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:338",
      "core:src/server/shared/DataStores/DBCfmt.h:87",
    ],
  },
  {
    file: "NamesReserved.dbc",
    format: "xsx",
    overrideTable: "namesreserved_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:339",
      "core:src/server/shared/DataStores/DBCfmt.h:88",
    ],
  },
  {
    file: "NamesProfanity.dbc",
    format: "xsx",
    overrideTable: "namesprofanity_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:340",
      "core:src/server/shared/DataStores/DBCfmt.h:89",
    ],
  },
  {
    file: "OverrideSpellData.dbc",
    format: "niiiiiiiiiix",
    overrideTable: "overridespelldata_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:341",
      "core:src/server/shared/DataStores/DBCfmt.h:90",
    ],
  },
  {
    file: "PowerDisplay.dbc",
    format: "nixxxx",
    overrideTable: "powerdisplay_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:342",
      "core:src/server/shared/DataStores/DBCfmt.h:91",
    ],
  },
  {
    file: "PvpDifficulty.dbc",
    format: "diiiii",
    overrideTable: "pvpdifficulty_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:343",
      "core:src/server/shared/DataStores/DBCfmt.h:95",
    ],
  },
  {
    file: "QuestXP.dbc",
    format: "niiiiiiiiii",
    overrideTable: "questxp_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:344",
      "core:src/server/shared/DataStores/DBCfmt.h:93",
    ],
  },
  {
    file: "QuestFactionReward.dbc",
    format: "niiiiiiiiii",
    overrideTable: "questfactionreward_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:345",
      "core:src/server/shared/DataStores/DBCfmt.h:94",
    ],
  },
  {
    file: "QuestSort.dbc",
    format: "nxxxxxxxxxxxxxxxxx",
    overrideTable: "questsort_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:346",
      "core:src/server/shared/DataStores/DBCfmt.h:92",
    ],
  },
  {
    file: "RandPropPoints.dbc",
    format: "niiiiiiiiiiiiiii",
    overrideTable: "randproppoints_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:347",
      "core:src/server/shared/DataStores/DBCfmt.h:96",
    ],
  },
  {
    file: "ScalingStatDistribution.dbc",
    format: "niiiiiiiiiiiiiiiiiiiii",
    overrideTable: "scalingstatdistribution_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:348",
      "core:src/server/shared/DataStores/DBCfmt.h:97",
    ],
  },
  {
    file: "ScalingStatValues.dbc",
    format: "iniiiiiiiiiiiiiiiiiiiiii",
    overrideTable: "scalingstatvalues_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:349",
      "core:src/server/shared/DataStores/DBCfmt.h:98",
    ],
  },
  {
    file: "SkillLine.dbc",
    format: "nixssssssssssssssssxxxxxxxxxxxxxxxxxxixxxxxxxxxxxxxxxxxi",
    overrideTable: "skillline_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:350",
      "core:src/server/shared/DataStores/DBCfmt.h:99",
    ],
  },
  {
    file: "SkillLineAbility.dbc",
    format: "niiiixxiiiiixx",
    overrideTable: "skilllineability_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:351",
      "core:src/server/shared/DataStores/DBCfmt.h:100",
    ],
  },
  {
    file: "SkillRaceClassInfo.dbc",
    format: "diiiixix",
    overrideTable: "skillraceclassinfo_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:352",
      "core:src/server/shared/DataStores/DBCfmt.h:101",
    ],
  },
  {
    file: "SkillTiers.dbc",
    format: "nxxxxxxxxxxxxxxxxiiiiiiiiiiiiiiii",
    overrideTable: "skilltiers_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:353",
      "core:src/server/shared/DataStores/DBCfmt.h:102",
    ],
  },
  {
    file: "SoundEntries.dbc",
    format: "nxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    overrideTable: "soundentries_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:354",
      "core:src/server/shared/DataStores/DBCfmt.h:103",
    ],
  },
  {
    file: "Spell.dbc",
    format:
      "niiiiiiiiiiiixixiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiifxiiiiiiiiiiiiiiiiiiiiiiiiiiiifffiiiiiiiiiiiiiiiiiiiiifffiiiiiiiiiiiiiiifffiiiiiiiiiiiiiissssssssssssssssxssssssssssssssssxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxiiiiiiiiiiixfffxxxiiiiixxfffxx",
    overrideTable: "spell_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:355",
      "core:src/server/shared/DataStores/DBCfmt.h:108",
    ],
  },
  {
    file: "SpellCastTimes.dbc",
    format: "nixx",
    overrideTable: "spellcasttimes_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:356",
      "core:src/server/shared/DataStores/DBCfmt.h:104",
    ],
  },
  {
    file: "SpellCategory.dbc",
    format: "ni",
    overrideTable: "spellcategory_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:357",
      "core:src/server/shared/DataStores/DBCfmt.h:105",
    ],
  },
  {
    file: "SpellDifficulty.dbc",
    format: "niiii",
    overrideTable: "spelldifficulty_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:358",
      "core:src/server/shared/DataStores/DBCfmt.h:106",
    ],
  },
  {
    file: "SpellDuration.dbc",
    format: "niii",
    overrideTable: "spellduration_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:359",
      "core:src/server/shared/DataStores/DBCfmt.h:107",
    ],
  },
  {
    file: "SpellFocusObject.dbc",
    format: "nxxxxxxxxxxxxxxxxx",
    overrideTable: "spellfocusobject_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:360",
      "core:src/server/shared/DataStores/DBCfmt.h:109",
    ],
  },
  {
    file: "SpellItemEnchantment.dbc",
    format: "niiiiiiixxxiiissssssssssssssssxiiiiiii",
    overrideTable: "spellitemenchantment_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:361",
      "core:src/server/shared/DataStores/DBCfmt.h:110",
    ],
  },
  {
    file: "SpellItemEnchantmentCondition.dbc",
    format: "nbbbbbxxxxxbbbbbbbbbbiiiiiXXXXX",
    overrideTable: "spellitemenchantmentcondition_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:362",
      "core:src/server/shared/DataStores/DBCfmt.h:111",
    ],
  },
  {
    file: "SpellRadius.dbc",
    format: "nfff",
    overrideTable: "spellradius_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:363",
      "core:src/server/shared/DataStores/DBCfmt.h:112",
    ],
  },
  {
    file: "SpellRange.dbc",
    format: "nffffixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    overrideTable: "spellrange_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:364",
      "core:src/server/shared/DataStores/DBCfmt.h:113",
    ],
  },
  {
    file: "SpellRuneCost.dbc",
    format: "niiii",
    overrideTable: "spellrunecost_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:365",
      "core:src/server/shared/DataStores/DBCfmt.h:114",
    ],
  },
  {
    file: "SpellShapeshiftForm.dbc",
    format: "nxxxxxxxxxxxxxxxxxxiixiiixxiiiiiiii",
    overrideTable: "spellshapeshiftform_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:366",
      "core:src/server/shared/DataStores/DBCfmt.h:115",
    ],
  },
  {
    file: "SpellVisual.dbc",
    format: "dxxxxxxiixxxxxxxxxxxxxxxxxxxxxxx",
    overrideTable: "spellvisual_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:367",
      "core:src/server/shared/DataStores/DBCfmt.h:116",
    ],
  },
  {
    file: "StableSlotPrices.dbc",
    format: "ni",
    overrideTable: "stableslotprices_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:368",
      "core:src/server/shared/DataStores/DBCfmt.h:117",
    ],
  },
  {
    file: "SummonProperties.dbc",
    format: "niiiii",
    overrideTable: "summonproperties_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:369",
      "core:src/server/shared/DataStores/DBCfmt.h:118",
    ],
  },
  {
    file: "Talent.dbc",
    format: "niiiiiiiixxxxixxixxixxx",
    overrideTable: "talent_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:370",
      "core:src/server/shared/DataStores/DBCfmt.h:119",
    ],
  },
  {
    file: "TalentTab.dbc",
    format: "nxxxxxxxxxxxxxxxxxxxiiix",
    overrideTable: "talenttab_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:371",
      "core:src/server/shared/DataStores/DBCfmt.h:120",
    ],
  },
  {
    file: "TaxiNodes.dbc",
    format: "nifffssssssssssssssssxii",
    overrideTable: "taxinodes_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:372",
      "core:src/server/shared/DataStores/DBCfmt.h:121",
    ],
  },
  {
    file: "TaxiPath.dbc",
    format: "niii",
    overrideTable: "taxipath_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:373",
      "core:src/server/shared/DataStores/DBCfmt.h:122",
    ],
  },
  {
    file: "TaxiPathNode.dbc",
    format: "diiifffiiii",
    overrideTable: "taxipathnode_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:374",
      "core:src/server/shared/DataStores/DBCfmt.h:123",
    ],
  },
  {
    file: "TeamContributionPoints.dbc",
    format: "df",
    overrideTable: "teamcontributionpoints_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:375",
      "core:src/server/shared/DataStores/DBCfmt.h:124",
    ],
  },
  {
    file: "TotemCategory.dbc",
    format: "nxxxxxxxxxxxxxxxxxii",
    overrideTable: "totemcategory_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:376",
      "core:src/server/shared/DataStores/DBCfmt.h:125",
    ],
  },
  {
    file: "TransportAnimation.dbc",
    format: "diifffx",
    overrideTable: "transportanimation_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:377",
      "core:src/server/shared/DataStores/DBCfmt.h:126",
    ],
  },
  {
    file: "TransportRotation.dbc",
    format: "diiffff",
    overrideTable: "transportrotation_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:378",
      "core:src/server/shared/DataStores/DBCfmt.h:127",
    ],
  },
  {
    file: "Vehicle.dbc",
    format: "niffffiiiiiiiifffffffffffffffssssfifiixx",
    overrideTable: "vehicle_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:379",
      "core:src/server/shared/DataStores/DBCfmt.h:128",
    ],
  },
  {
    file: "VehicleSeat.dbc",
    format: "niiffffffffffiiiiiifffffffiiifffiiiiiiiffiiiiixxxxxxxxxxxx",
    overrideTable: "vehicleseat_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:380",
      "core:src/server/shared/DataStores/DBCfmt.h:129",
    ],
  },
  {
    file: "WMOAreaTable.dbc",
    format: "niiixxxxxiixxxxxxxxxxxxxxxxx",
    overrideTable: "wmoareatable_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:381",
      "core:src/server/shared/DataStores/DBCfmt.h:130",
    ],
  },
  {
    file: "WorldMapArea.dbc",
    format: "xinxffffixx",
    overrideTable: "worldmaparea_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:382",
      "core:src/server/shared/DataStores/DBCfmt.h:131",
    ],
  },
  {
    file: "WorldMapOverlay.dbc",
    format: "nxiiiixxxxxxxxxxx",
    overrideTable: "worldmapoverlay_dbc",
    verified: true,
    source: [
      "core:src/server/game/DataStores/DBCStores.cpp:383",
      "core:src/server/shared/DataStores/DBCfmt.h:132",
    ],
  },
];
