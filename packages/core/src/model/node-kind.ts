import { z } from "zod";

/**
 * Every node kind, grouped by the layer it belongs to (architecture section 3).
 * Kind names are unique across layers, so a kind alone tells its layer:
 * `class` is a C++ class, `player_class` is a game class such as Mage
 * (decision of 2026-10-06, PR #7).
 */
export const NODE_KINDS_BY_LAYER = {
  data: ["row", "dbc_record", "table", "dbc_file"],
  code: [
    "file",
    "class",
    "function",
    "enum",
    "enum_value",
    "module",
    "patch",
    "patch_hunk",
    "lua_file",
    "lua_handler",
  ],
  binding: ["script_registration", "id_literal", "loader"],
  game: [
    "spell",
    "player_class",
    "race",
    "skill",
    "talent",
    "item",
    "creature",
    "gameobject",
    "quest",
    "trainer",
    "map",
  ],
} as const;

export type Layer = keyof typeof NODE_KINDS_BY_LAYER;
export type NodeKind = (typeof NODE_KINDS_BY_LAYER)[Layer][number];

export const LAYERS = Object.keys(NODE_KINDS_BY_LAYER) as Layer[];

export const NODE_KINDS: readonly NodeKind[] = LAYERS.flatMap(
  (layer) => NODE_KINDS_BY_LAYER[layer],
);

export const NodeKindSchema = z.enum(NODE_KINDS as [NodeKind, ...NodeKind[]]);

const layerOfKind = new Map<NodeKind, Layer>(
  LAYERS.flatMap((layer) =>
    NODE_KINDS_BY_LAYER[layer].map((kind) => [kind, layer] as const),
  ),
);

/** The layer a node kind belongs to. */
export function layerOf(kind: NodeKind): Layer {
  const layer = layerOfKind.get(kind);
  if (layer === undefined) throw new Error(`Unknown node kind: ${kind}`);
  return layer;
}
