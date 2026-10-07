import type { TableDef } from "@canvas/core";

/**
 * Every table the schema research names (docs/research/azerothcore-schema.md),
 * transcribed at commit 9d9b6049. Each citation is the table's column block in
 * its base SQL file, from the first column line to the line before the closing
 * parenthesis (keys included); the two tables the base does not ship are cited
 * from the update file that creates them. Tables the research names with no
 * PRIMARY KEY carry the identifying columns it lists instead. Locale tables
 * link to their base table through `TableDef.localeOf`, which lands in core
 * #47; the links are added once that merges.
 */
export const worldTables: TableDef[] = [
  {
    name: "updates",
    primaryKey: ["name"],
    source: ["core:data/sql/base/db_world/updates.sql:24-29"],
  },
  {
    name: "creature_sparring",
    primaryKey: ["GUID"],
    source: ["core:data/sql/base/db_world/creature_sparring.sql:24-28"],
  },
  {
    name: "spell_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spell_dbc.sql:24-258"],
  },
  {
    name: "playercreateinfo_skills",
    primaryKey: ["raceMask", "classMask", "skill"],
    source: ["core:data/sql/base/db_world/playercreateinfo_skills.sql:24-29"],
  },
  {
    name: "playercreateinfo",
    primaryKey: ["race", "class"],
    source: ["core:data/sql/base/db_world/playercreateinfo.sql:24-32"],
  },
  {
    name: "playercreateinfo_item",
    primaryKey: ["race", "class", "itemid"],
    source: ["core:data/sql/base/db_world/playercreateinfo_item.sql:24-30"],
  },
  {
    name: "playercreateinfo_spell_custom",
    primaryKey: ["racemask", "classmask", "Spell"],
    source: [
      "core:data/sql/base/db_world/playercreateinfo_spell_custom.sql:24-28",
    ],
  },
  {
    name: "playercreateinfo_cast_spell",
    primaryKey: ["raceMask", "classMask", "spell"],
    source: [
      "core:data/sql/base/db_world/playercreateinfo_cast_spell.sql:24-27",
    ],
  },
  {
    name: "playercreateinfo_action",
    primaryKey: ["race", "class", "button"],
    source: ["core:data/sql/base/db_world/playercreateinfo_action.sql:24-30"],
  },
  {
    name: "spell_required",
    primaryKey: ["spell_id", "req_spell"],
    source: ["core:data/sql/base/db_world/spell_required.sql:24-26"],
  },
  {
    name: "spell_ranks",
    primaryKey: ["first_spell_id", "rank"],
    source: ["core:data/sql/base/db_world/spell_ranks.sql:24-28"],
  },
  {
    name: "skill_discovery_template",
    primaryKey: ["spellId", "reqSpell"],
    source: ["core:data/sql/base/db_world/skill_discovery_template.sql:24-28"],
  },
  {
    name: "skill_extra_item_template",
    primaryKey: ["spellId"],
    source: ["core:data/sql/base/db_world/skill_extra_item_template.sql:24-28"],
  },
  {
    name: "skill_perfect_item_template",
    primaryKey: ["spellId"],
    source: [
      "core:data/sql/base/db_world/skill_perfect_item_template.sql:24-28",
    ],
  },
  {
    name: "trainer",
    primaryKey: ["Id"],
    source: ["core:data/sql/base/db_world/trainer.sql:24-29"],
  },
  {
    name: "trainer_spell",
    primaryKey: ["TrainerId", "SpellId"],
    source: ["core:data/sql/base/db_world/trainer_spell.sql:24-34"],
  },
  {
    name: "creature_default_trainer",
    primaryKey: ["CreatureId"],
    source: ["core:data/sql/base/db_world/creature_default_trainer.sql:24-26"],
  },
  {
    name: "npc_trainer",
    primaryKey: ["ID", "SpellID"],
    source: ["core:data/sql/base/db_world/npc_trainer.sql:24-31"],
  },
  {
    name: "spell_script_names",
    primaryKey: ["spell_id", "ScriptName"],
    source: ["core:data/sql/base/db_world/spell_script_names.sql:24-26"],
  },
  {
    name: "creature_template",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/creature_template.sql:24-80"],
  },
  {
    name: "creature",
    primaryKey: ["guid"],
    source: ["core:data/sql/base/db_world/creature.sql:24-53"],
  },
  {
    name: "gameobject_template",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/gameobject_template.sql:24-60"],
  },
  {
    name: "gameobject",
    primaryKey: ["guid"],
    source: ["core:data/sql/base/db_world/gameobject.sql:24-45"],
  },
  {
    name: "item_template",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/item_template.sql:24-164"],
  },
  {
    name: "areatrigger_scripts",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/areatrigger_scripts.sql:24-26"],
  },
  {
    name: "instance_template",
    primaryKey: ["map"],
    source: ["core:data/sql/base/db_world/instance_template.sql:24-28"],
  },
  {
    name: "outdoorpvp_template",
    primaryKey: ["TypeId"],
    source: ["core:data/sql/base/db_world/outdoorpvp_template.sql:24-27"],
  },
  {
    name: "battleground_template",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/battleground_template.sql:24-37"],
  },
  {
    name: "achievement_criteria_data",
    primaryKey: ["criteria_id", "type"],
    source: ["core:data/sql/base/db_world/achievement_criteria_data.sql:24-29"],
  },
  {
    name: "conditions",
    primaryKey: [
      "SourceTypeOrReferenceId",
      "SourceGroup",
      "SourceEntry",
      "SourceId",
      "ElseGroup",
      "ConditionTypeOrReference",
      "ConditionTarget",
      "ConditionValue1",
      "ConditionValue2",
      "ConditionValue3",
    ],
    source: ["core:data/sql/base/db_world/conditions.sql:24-39"],
  },
  {
    name: "spell_scripts",
    primaryKey: ["id"],
    source: ["core:data/sql/base/db_world/spell_scripts.sql:24-34"],
  },
  {
    name: "event_scripts",
    primaryKey: ["id"],
    source: ["core:data/sql/base/db_world/event_scripts.sql:24-33"],
  },
  {
    name: "spell_linked_spell",
    primaryKey: ["spell_trigger", "spell_effect", "type"],
    source: ["core:data/sql/base/db_world/spell_linked_spell.sql:24-28"],
  },
  {
    name: "spell_proc",
    primaryKey: ["SpellId"],
    source: ["core:data/sql/base/db_world/spell_proc.sql:24-40"],
  },
  {
    name: "spell_group",
    primaryKey: ["id", "spell_id"],
    source: ["core:data/sql/base/db_world/spell_group.sql:24-26"],
  },
  {
    name: "spell_group_stack_rules",
    primaryKey: ["group_id"],
    source: ["core:data/sql/base/db_world/spell_group_stack_rules.sql:24-27"],
  },
  {
    name: "spell_custom_attr",
    primaryKey: ["spell_id"],
    source: ["core:data/sql/base/db_world/spell_custom_attr.sql:24-26"],
  },
  {
    name: "spell_area",
    primaryKey: [
      "spell",
      "area",
      "quest_start",
      "aura_spell",
      "racemask",
      "gender",
    ],
    source: ["core:data/sql/base/db_world/spell_area.sql:24-34"],
  },
  {
    name: "spell_bonus_data",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/spell_bonus_data.sql:24-30"],
  },
  {
    name: "spell_threat",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/spell_threat.sql:24-28"],
  },
  {
    name: "spell_target_position",
    primaryKey: ["ID", "EffectIndex"],
    source: ["core:data/sql/base/db_world/spell_target_position.sql:24-32"],
  },
  {
    name: "spell_enchant_proc_data",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/spell_enchant_proc_data.sql:24-30"],
  },
  {
    name: "spell_pet_auras",
    primaryKey: ["spell", "effectId", "pet"],
    source: ["core:data/sql/base/db_world/spell_pet_auras.sql:24-28"],
  },
  {
    name: "spell_mixology",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/spell_mixology.sql:24-26"],
  },
  {
    name: "spell_cooldown_overrides",
    primaryKey: ["Id"],
    source: ["core:data/sql/base/db_world/spell_cooldown_overrides.sql:24-30"],
  },
  {
    name: "spell_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/spell_loot_template.sql:24-34"],
  },
  {
    name: "item_enchantment_template",
    primaryKey: ["entry", "ench"],
    source: ["core:data/sql/base/db_world/item_enchantment_template.sql:24-28"],
  },
  {
    name: "item_set_names",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/item_set_names.sql:24-28"],
  },
  {
    name: "creature_loot_template",
    primaryKey: ["Entry", "Item", "Reference", "GroupId"],
    source: ["core:data/sql/base/db_world/creature_loot_template.sql:24-34"],
  },
  {
    name: "reference_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/reference_loot_template.sql:24-34"],
  },
  {
    name: "npc_vendor",
    primaryKey: ["entry", "item", "ExtendedCost"],
    source: ["core:data/sql/base/db_world/npc_vendor.sql:24-32"],
  },
  {
    name: "creature_template_spell",
    primaryKey: ["CreatureID", "Index"],
    source: ["core:data/sql/base/db_world/creature_template_spell.sql:24-29"],
  },
  {
    name: "creature_template_addon",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/creature_template_addon.sql:24-32"],
  },
  {
    name: "creature_addon",
    primaryKey: ["guid"],
    source: ["core:data/sql/base/db_world/creature_addon.sql:24-32"],
  },
  {
    name: "npc_spellclick_spells",
    primaryKey: ["npc_entry", "spell_id"],
    source: ["core:data/sql/base/db_world/npc_spellclick_spells.sql:24-28"],
  },
  {
    name: "creature_summon_groups",
    primaryKey: ["summonerId", "summonerType", "groupId", "entry"],
    source: ["core:data/sql/base/db_world/creature_summon_groups.sql:24-34"],
  },
  {
    name: "vehicle_template_accessory",
    primaryKey: ["entry", "seat_id"],
    source: [
      "core:data/sql/base/db_world/vehicle_template_accessory.sql:24-31",
    ],
  },
  {
    name: "vehicle_accessory",
    primaryKey: ["guid", "seat_id"],
    source: ["core:data/sql/base/db_world/vehicle_accessory.sql:24-31"],
  },
  {
    name: "smart_scripts",
    primaryKey: ["entryorguid", "source_type", "id", "link"],
    source: ["core:data/sql/base/db_world/smart_scripts.sql:24-55"],
  },
  {
    name: "quest_template",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/quest_template.sql:24-129"],
  },
  {
    name: "quest_template_addon",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/quest_template_addon.sql:24-42"],
  },
  {
    name: "creature_queststarter",
    primaryKey: ["id", "quest"],
    source: ["core:data/sql/base/db_world/creature_queststarter.sql:24-26"],
  },
  {
    name: "disables",
    primaryKey: ["sourceType", "entry"],
    source: ["core:data/sql/base/db_world/disables.sql:24-30"],
  },
  {
    name: "talent_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/talent_dbc.sql:24-47"],
  },
  {
    name: "creature_template_locale",
    primaryKey: ["entry", "locale"],
    source: ["core:data/sql/base/db_world/creature_template_locale.sql:24-29"],
  },
  {
    name: "gossip_menu_option",
    primaryKey: ["MenuID", "OptionID"],
    source: ["core:data/sql/base/db_world/gossip_menu_option.sql:24-38"],
  },
  {
    name: "updates_include",
    primaryKey: ["path"],
    source: ["core:data/sql/base/db_world/updates_include.sql:24-26"],
  },
  {
    name: "spell_proc_event",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/spell_proc_event.sql:24-36"],
  },
  {
    name: "skilllineability_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/skilllineability_dbc.sql:24-38"],
  },
  {
    name: "trainer_locale",
    primaryKey: ["Id", "locale"],
    source: ["core:data/sql/base/db_world/trainer_locale.sql:24-28"],
  },
  {
    name: "transports",
    primaryKey: ["guid"],
    source: ["core:data/sql/base/db_world/transports.sql:24-29"],
  },
  {
    name: "game_weather",
    primaryKey: ["zone"],
    source: ["core:data/sql/base/db_world/game_weather.sql:24-38"],
  },
  {
    name: "areatrigger",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/areatrigger.sql:24-34"],
  },
  {
    name: "command",
    primaryKey: ["name"],
    source: ["core:data/sql/base/db_world/command.sql:24-27"],
  },
  {
    name: "spell_cone",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spell_cone.sql:24-26"],
  },
  {
    name: "spell_jump_distance",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spell_jump_distance.sql:24-26"],
  },
  {
    name: "spelldifficulty_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spelldifficulty_dbc.sql:24-29"],
  },
  {
    name: "factiontemplate_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/factiontemplate_dbc.sql:24-38"],
  },
  {
    name: "achievement_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/achievement_dbc.sql:24-86"],
  },
  {
    name: "pickpocketing_loot_template",
    primaryKey: ["Entry", "Item"],
    source: [
      "core:data/sql/base/db_world/pickpocketing_loot_template.sql:24-34",
    ],
  },
  {
    name: "skinning_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/skinning_loot_template.sql:24-34"],
  },
  {
    name: "gameobject_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/gameobject_loot_template.sql:24-34"],
  },
  {
    name: "item_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/item_loot_template.sql:24-34"],
  },
  {
    name: "disenchant_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/disenchant_loot_template.sql:24-34"],
  },
  {
    name: "milling_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/milling_loot_template.sql:24-34"],
  },
  {
    name: "prospecting_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/prospecting_loot_template.sql:24-34"],
  },
  {
    name: "fishing_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/fishing_loot_template.sql:24-34"],
  },
  {
    name: "mail_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/mail_loot_template.sql:24-34"],
  },
  {
    name: "player_loot_template",
    primaryKey: ["Entry", "Item"],
    source: ["core:data/sql/base/db_world/player_loot_template.sql:24-34"],
  },
  {
    name: "creature_questitem",
    primaryKey: ["CreatureEntry", "Idx"],
    source: ["core:data/sql/base/db_world/creature_questitem.sql:24-28"],
  },
  {
    name: "gameobject_questitem",
    primaryKey: ["GameObjectEntry", "Idx"],
    source: ["core:data/sql/base/db_world/gameobject_questitem.sql:24-28"],
  },
  {
    name: "gameobject_summon_groups",
    primaryKey: ["summonerId", "summonerType", "groupId", "entry"],
    source: ["core:data/sql/updates/db_world/2026_02_15_04.sql:6-19"],
  },
  {
    name: "creature_equip_template",
    primaryKey: ["CreatureID", "ID"],
    source: ["core:data/sql/base/db_world/creature_equip_template.sql:24-30"],
  },
  {
    name: "creature_text",
    primaryKey: ["CreatureID", "GroupID", "ID"],
    source: ["core:data/sql/base/db_world/creature_text.sql:24-38"],
  },
  {
    name: "quest_mail_sender",
    primaryKey: ["QuestId"],
    source: ["core:data/sql/base/db_world/quest_mail_sender.sql:24-26"],
  },
  {
    name: "creature_questender",
    primaryKey: ["id", "quest"],
    source: ["core:data/sql/base/db_world/creature_questender.sql:24-26"],
  },
  {
    name: "gameobject_queststarter",
    primaryKey: ["id", "quest"],
    source: ["core:data/sql/base/db_world/gameobject_queststarter.sql:24-26"],
  },
  {
    name: "gameobject_questender",
    primaryKey: ["id", "quest"],
    source: ["core:data/sql/base/db_world/gameobject_questender.sql:24-26"],
  },
  {
    name: "pool_quest",
    primaryKey: ["entry"],
    source: ["core:data/sql/base/db_world/pool_quest.sql:24-28"],
  },
  {
    name: "areatrigger_involvedrelation",
    primaryKey: ["id"],
    source: [
      "core:data/sql/base/db_world/areatrigger_involvedrelation.sql:24-26",
    ],
  },
  {
    name: "talenttab_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/talenttab_dbc.sql:24-48"],
  },
  {
    name: "item_template_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/item_template_locale.sql:24-29"],
  },
  {
    name: "gameobject_template_locale",
    primaryKey: ["entry", "locale"],
    source: [
      "core:data/sql/base/db_world/gameobject_template_locale.sql:24-29",
    ],
  },
  {
    name: "quest_template_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/quest_template_locale.sql:24-36"],
  },
  {
    name: "item_set_names_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/item_set_names_locale.sql:24-28"],
  },
  {
    name: "gossip_menu_option_locale",
    primaryKey: ["MenuID", "OptionID", "Locale"],
    source: ["core:data/sql/base/db_world/gossip_menu_option_locale.sql:24-29"],
  },
  {
    name: "chrclasses_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/chrclasses_dbc.sql:24-84"],
  },
  {
    name: "skillline_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/skillline_dbc.sql:24-80"],
  },
  {
    name: "achievement_reward_locale",
    primaryKey: ["ID", "Locale"],
    source: ["core:data/sql/base/db_world/achievement_reward_locale.sql:24-28"],
  },
  {
    name: "broadcast_text_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/broadcast_text_locale.sql:24-29"],
  },
  {
    name: "creature_text_locale",
    primaryKey: ["CreatureID", "GroupID", "ID", "Locale"],
    source: ["core:data/sql/base/db_world/creature_text_locale.sql:24-29"],
  },
  {
    name: "module_string_locale",
    primaryKey: ["module", "id", "locale"],
    source: ["core:data/sql/base/db_world/module_string_locale.sql:24-28"],
  },
  {
    name: "npc_text_locale",
    primaryKey: ["ID", "Locale"],
    source: ["core:data/sql/base/db_world/npc_text_locale.sql:24-42"],
  },
  {
    name: "page_text_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/page_text_locale.sql:24-28"],
  },
  {
    name: "pet_name_generation_locale",
    primaryKey: ["ID", "Locale"],
    source: [
      "core:data/sql/base/db_world/pet_name_generation_locale.sql:24-29",
    ],
  },
  {
    name: "points_of_interest_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/points_of_interest_locale.sql:24-28"],
  },
  {
    name: "quest_greeting_locale",
    primaryKey: ["ID", "type", "locale"],
    source: ["core:data/sql/base/db_world/quest_greeting_locale.sql:24-29"],
  },
  {
    name: "quest_offer_reward_locale",
    primaryKey: ["ID", "locale"],
    source: ["core:data/sql/base/db_world/quest_offer_reward_locale.sql:24-28"],
  },
  {
    name: "quest_request_items_locale",
    primaryKey: ["ID", "locale"],
    source: [
      "core:data/sql/base/db_world/quest_request_items_locale.sql:24-28",
    ],
  },
  {
    name: "areatable_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/areatable_dbc.sql:24-60"],
  },
  {
    name: "achievement_category_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/achievement_category_dbc.sql:24-44"],
  },
  {
    name: "achievement_criteria_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/achievement_criteria_dbc.sql:24-55"],
  },
  {
    name: "areagroup_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/areagroup_dbc.sql:24-32"],
  },
  {
    name: "areapoi_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/areapoi_dbc.sql:24-78"],
  },
  {
    name: "auctionhouse_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/auctionhouse_dbc.sql:24-45"],
  },
  {
    name: "bankbagslotprices_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/bankbagslotprices_dbc.sql:24-26"],
  },
  {
    name: "battlemasterlist_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/battlemasterlist_dbc.sql:24-56"],
  },
  {
    name: "barbershopstyle_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/barbershopstyle_dbc.sql:24-64"],
  },
  {
    name: "charstartoutfit_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/charstartoutfit_dbc.sql:24-101"],
  },
  {
    name: "chartitles_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/chartitles_dbc.sql:24-61"],
  },
  {
    name: "chatchannels_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/chatchannels_dbc.sql:24-61"],
  },
  {
    name: "chrraces_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/chrraces_dbc.sql:24-93"],
  },
  {
    name: "cinematiccamera_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/cinematiccamera_dbc.sql:24-31"],
  },
  {
    name: "cinematicsequences_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/cinematicsequences_dbc.sql:24-34"],
  },
  {
    name: "creaturedisplayinfo_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/creaturedisplayinfo_dbc.sql:24-40"],
  },
  {
    name: "creaturedisplayinfoextra_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/creaturedisplayinfoextra_dbc.sql:24-45",
    ],
  },
  {
    name: "creaturefamily_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/creaturefamily_dbc.sql:24-52"],
  },
  {
    name: "creaturemodeldata_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/creaturemodeldata_dbc.sql:24-52"],
  },
  {
    name: "creaturespelldata_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/creaturespelldata_dbc.sql:24-33"],
  },
  {
    name: "creaturetype_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/creaturetype_dbc.sql:24-43"],
  },
  {
    name: "currencytypes_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/currencytypes_dbc.sql:24-28"],
  },
  {
    name: "destructiblemodeldata_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/destructiblemodeldata_dbc.sql:24-43"],
  },
  {
    name: "dungeonencounter_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/dungeonencounter_dbc.sql:24-47"],
  },
  {
    name: "durabilitycosts_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/durabilitycosts_dbc.sql:24-54"],
  },
  {
    name: "durabilityquality_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/durabilityquality_dbc.sql:24-26"],
  },
  {
    name: "emotes_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/emotes_dbc.sql:24-31"],
  },
  {
    name: "emotestext_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/emotestext_dbc.sql:24-43"],
  },
  {
    name: "faction_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/faction_dbc.sql:24-81"],
  },
  {
    name: "gameobjectartkit_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gameobjectartkit_dbc.sql:24-32"],
  },
  {
    name: "gameobjectdisplayinfo_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gameobjectdisplayinfo_dbc.sql:24-43"],
  },
  {
    name: "gemproperties_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gemproperties_dbc.sql:24-29"],
  },
  {
    name: "glyphproperties_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/glyphproperties_dbc.sql:24-28"],
  },
  {
    name: "glyphslot_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/glyphslot_dbc.sql:24-27"],
  },
  {
    name: "gtbarbershopcostbase_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtbarbershopcostbase_dbc.sql:24-26"],
  },
  {
    name: "gtcombatratings_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtcombatratings_dbc.sql:24-26"],
  },
  {
    name: "gtchancetomeleecritbase_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/gtchancetomeleecritbase_dbc.sql:24-26",
    ],
  },
  {
    name: "gtchancetomeleecrit_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtchancetomeleecrit_dbc.sql:24-26"],
  },
  {
    name: "gtchancetospellcritbase_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/gtchancetospellcritbase_dbc.sql:24-26",
    ],
  },
  {
    name: "gtchancetospellcrit_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtchancetospellcrit_dbc.sql:24-26"],
  },
  {
    name: "gtnpcmanacostscaler_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtnpcmanacostscaler_dbc.sql:24-26"],
  },
  {
    name: "gtoctclasscombatratingscalar_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/gtoctclasscombatratingscalar_dbc.sql:24-26",
    ],
  },
  {
    name: "gtoctregenhp_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtoctregenhp_dbc.sql:24-26"],
  },
  {
    name: "gtregenhpperspt_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtregenhpperspt_dbc.sql:24-26"],
  },
  {
    name: "gtregenmpperspt_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/gtregenmpperspt_dbc.sql:24-26"],
  },
  {
    name: "holidays_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/holidays_dbc.sql:24-79"],
  },
  {
    name: "item_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/item_dbc.sql:24-32"],
  },
  {
    name: "itembagfamily_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itembagfamily_dbc.sql:24-42"],
  },
  {
    name: "itemdisplayinfo_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itemdisplayinfo_dbc.sql:24-49"],
  },
  {
    name: "itemextendedcost_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itemextendedcost_dbc.sql:24-40"],
  },
  {
    name: "itemlimitcategory_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itemlimitcategory_dbc.sql:24-44"],
  },
  {
    name: "itemrandomproperties_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itemrandomproperties_dbc.sql:24-48"],
  },
  {
    name: "itemrandomsuffix_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itemrandomsuffix_dbc.sql:24-53"],
  },
  {
    name: "itemset_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/itemset_dbc.sql:24-77"],
  },
  {
    name: "lfgdungeons_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/lfgdungeons_dbc.sql:24-73"],
  },
  {
    name: "light_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/light_dbc.sql:24-39"],
  },
  {
    name: "liquidtype_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/liquidtype_dbc.sql:24-69"],
  },
  {
    name: "lock_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/lock_dbc.sql:24-57"],
  },
  {
    name: "mailtemplate_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/mailtemplate_dbc.sql:24-59"],
  },
  {
    name: "map_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/map_dbc.sql:24-90"],
  },
  {
    name: "mapdifficulty_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/mapdifficulty_dbc.sql:24-47"],
  },
  {
    name: "movie_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/movie_dbc.sql:24-27"],
  },
  {
    name: "namesreserved_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/namesreserved_dbc.sql:24-27"],
  },
  {
    name: "namesprofanity_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/namesprofanity_dbc.sql:24-27"],
  },
  {
    name: "overridespelldata_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/overridespelldata_dbc.sql:24-36"],
  },
  {
    name: "powerdisplay_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/powerdisplay_dbc.sql:24-30"],
  },
  {
    name: "pvpdifficulty_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/pvpdifficulty_dbc.sql:24-30"],
  },
  {
    name: "questxp_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/questxp_dbc.sql:24-35"],
  },
  {
    name: "questfactionreward_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/questfactionreward_dbc.sql:24-35"],
  },
  {
    name: "questsort_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/questsort_dbc.sql:24-42"],
  },
  {
    name: "randproppoints_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/randproppoints_dbc.sql:24-40"],
  },
  {
    name: "scalingstatdistribution_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/scalingstatdistribution_dbc.sql:24-46",
    ],
  },
  {
    name: "scalingstatvalues_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/scalingstatvalues_dbc.sql:24-48"],
  },
  {
    name: "skillraceclassinfo_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/skillraceclassinfo_dbc.sql:24-32"],
  },
  {
    name: "skilltiers_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/skilltiers_dbc.sql:24-57"],
  },
  {
    name: "soundentries_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/soundentries_dbc.sql:24-54"],
  },
  {
    name: "spellcasttimes_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellcasttimes_dbc.sql:24-28"],
  },
  {
    name: "spellcategory_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellcategory_dbc.sql:24-26"],
  },
  {
    name: "spellduration_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellduration_dbc.sql:24-28"],
  },
  {
    name: "spellfocusobject_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellfocusobject_dbc.sql:24-42"],
  },
  {
    name: "spellitemenchantment_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellitemenchantment_dbc.sql:24-62"],
  },
  {
    name: "spellitemenchantmentcondition_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/spellitemenchantmentcondition_dbc.sql:24-55",
    ],
  },
  {
    name: "spellradius_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellradius_dbc.sql:24-28"],
  },
  {
    name: "spellrange_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellrange_dbc.sql:24-64"],
  },
  {
    name: "spellrunecost_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellrunecost_dbc.sql:24-29"],
  },
  {
    name: "spellshapeshiftform_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellshapeshiftform_dbc.sql:24-59"],
  },
  {
    name: "spellvisual_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/spellvisual_dbc.sql:24-56"],
  },
  {
    name: "stableslotprices_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/stableslotprices_dbc.sql:24-26"],
  },
  {
    name: "summonproperties_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/summonproperties_dbc.sql:24-30"],
  },
  {
    name: "taxinodes_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/taxinodes_dbc.sql:24-48"],
  },
  {
    name: "taxipath_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/taxipath_dbc.sql:24-28"],
  },
  {
    name: "taxipathnode_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/taxipathnode_dbc.sql:24-35"],
  },
  {
    name: "teamcontributionpoints_dbc",
    primaryKey: ["ID"],
    source: [
      "core:data/sql/base/db_world/teamcontributionpoints_dbc.sql:24-26",
    ],
  },
  {
    name: "totemcategory_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/totemcategory_dbc.sql:24-44"],
  },
  {
    name: "transportanimation_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/transportanimation_dbc.sql:24-31"],
  },
  {
    name: "transportrotation_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/transportrotation_dbc.sql:24-31"],
  },
  {
    name: "vehicle_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/vehicle_dbc.sql:24-64"],
  },
  {
    name: "vehicleseat_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/vehicleseat_dbc.sql:24-82"],
  },
  {
    name: "wmoareatable_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/wmoareatable_dbc.sql:24-52"],
  },
  {
    name: "worldmaparea_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/worldmaparea_dbc.sql:24-35"],
  },
  {
    name: "worldmapoverlay_dbc",
    primaryKey: ["ID"],
    source: ["core:data/sql/base/db_world/worldmapoverlay_dbc.sql:24-41"],
  },
  {
    name: "creature_multispawn",
    primaryKey: ["spawnId", "entry"],
    source: ["core:data/sql/updates/db_world/2026_06_16_00.sql:4-6"],
  },
];

export const characterTables: TableDef[] = [
  {
    name: "characters",
    primaryKey: ["guid"],
    source: ["core:data/sql/base/db_characters/characters.sql:24-107"],
  },
  {
    name: "character_spell",
    primaryKey: ["guid", "spell"],
    source: ["core:data/sql/base/db_characters/character_spell.sql:24-27"],
  },
  {
    name: "character_talent",
    primaryKey: ["guid", "spell"],
    source: ["core:data/sql/base/db_characters/character_talent.sql:24-27"],
  },
  {
    name: "character_inventory",
    primaryKey: ["item"],
    source: ["core:data/sql/base/db_characters/character_inventory.sql:24-30"],
  },
  {
    name: "item_instance",
    primaryKey: ["guid"],
    source: ["core:data/sql/base/db_characters/item_instance.sql:24-39"],
  },
  {
    name: "character_action",
    primaryKey: ["guid", "spec", "button"],
    source: ["core:data/sql/base/db_characters/character_action.sql:24-29"],
  },
  {
    name: "character_skills",
    primaryKey: ["guid", "skill"],
    source: ["core:data/sql/base/db_characters/character_skills.sql:24-28"],
  },
  {
    name: "character_aura",
    primaryKey: ["guid", "casterGuid", "itemGuid", "spell", "effectMask"],
    source: ["core:data/sql/base/db_characters/character_aura.sql:24-40"],
  },
  {
    name: "character_glyphs",
    primaryKey: ["guid", "talentGroup"],
    source: ["core:data/sql/base/db_characters/character_glyphs.sql:24-32"],
  },
  {
    name: "character_queststatus",
    primaryKey: ["guid", "quest"],
    source: [
      "core:data/sql/base/db_characters/character_queststatus.sql:24-40",
    ],
  },
  {
    name: "character_achievement",
    primaryKey: ["guid", "achievement"],
    source: [
      "core:data/sql/base/db_characters/character_achievement.sql:24-27",
    ],
  },
  {
    name: "character_queststatus_rewarded",
    primaryKey: ["guid", "quest"],
    source: [
      "core:data/sql/base/db_characters/character_queststatus_rewarded.sql:24-27",
    ],
  },
  {
    name: "updates",
    primaryKey: ["name"],
    source: ["core:data/sql/base/db_characters/updates.sql:24-29"],
  },
  {
    name: "updates_include",
    primaryKey: ["path"],
    source: ["core:data/sql/base/db_characters/updates_include.sql:24-26"],
  },
];
