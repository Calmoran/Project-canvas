import type { LabelRule } from "@canvas/core";

/**
 * Human-readable labels per node kind (schema research section 12), cited at
 * the label column in the base SQL file. Rows of section 12 without a node
 * kind (item set, gossip option, comments) or without a DB label (spell and
 * the DBC-only kinds) have no rule. Locale fallbacks for creature, item,
 * gameobject and quest names come through the locale tables once
 * `TableDef.localeOf` lands (core #47).
 */
export const labelRules: LabelRule[] = [
  {
    kind: "creature",
    attrs: ["name", "subname"],
    source: ["core:data/sql/base/db_world/creature_template.sql:30-31"],
  },
  {
    kind: "item",
    attrs: ["name"],
    source: ["core:data/sql/base/db_world/item_template.sql:28"],
  },
  {
    kind: "gameobject",
    attrs: ["name"],
    source: ["core:data/sql/base/db_world/gameobject_template.sql:27"],
  },
  {
    kind: "quest",
    attrs: ["LogTitle"],
    source: ["core:data/sql/base/db_world/quest_template.sql:98"],
  },
  {
    kind: "trainer",
    attrs: ["Greeting"],
    source: ["core:data/sql/base/db_world/trainer.sql:27"],
  },
];
