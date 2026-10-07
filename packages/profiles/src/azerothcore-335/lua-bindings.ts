import type {
  BindingArg,
  BindingDef,
  Confidence,
  NodeKind,
} from "@canvas/core";

/**
 * The Lua functions mod-ale gives scripts for attaching a handler to a game
 * event (code research 3.12; binding catalogue rows 30-35). Each is cited at
 * its implementation in `GlobalMethods.h` and at its entry in the table that
 * exports it to Lua (`LuaFunctions.cpp:69-87`). A call emits a `lua_handler`.
 *
 * Confidence follows the catalogue: the server matches the call's literal
 * numbers exactly, except a player gossip menu ID, which the script chooses
 * itself and so names no data row (row 34).
 *
 * The arguments follow the signatures in code research 3.12. Each function
 * takes an event number, decoded through its family's hook table (`hooks`),
 * and a handler function. Entry-bound functions first take the ID of the
 * content they attach to (rows 30, 31), so they are bound through the data
 * that ID names; RegisterMapEvent takes a Map.dbc ID (row 32). A first
 * argument that names no static content (an opcode, a runtime instance ID or
 * GUID, a menu ID the script chooses) is not listed, and the binding is
 * global (rows 32-35).
 */

const GLOBAL = "mod-ale:src/LuaEngine/methods/GlobalMethods.h";
const EXPORTS = "mod-ale:src/LuaEngine/LuaFunctions.cpp";

/** How a Register function's arguments are laid out. */
type Shape =
  /** `(event, function)`: fires for everything of its kind. */
  | { readonly kind: "event"; readonly hooks: string }
  /** `(entry, event, function)` where the entry is a content ID. */
  | {
      readonly kind: "entry";
      readonly hooks: string;
      readonly target: NodeKind;
    }
  /** `(map_id, event, function)`. */
  | { readonly kind: "map"; readonly hooks: string }
  /** `(<runtime value>..., event, function)`: the event sits at `event`. */
  | {
      readonly kind: "runtime";
      readonly hooks: string;
      readonly event: number;
    };

const event = (hooks: string): Shape => ({ kind: "event", hooks });
const entry = (target: NodeKind, hooks: string): Shape => ({
  kind: "entry",
  hooks,
  target,
});

function argsOf(shape: Shape): BindingArg[] {
  switch (shape.kind) {
    case "event":
      return [
        { index: 0, holds: "event", hooks: shape.hooks },
        { index: 1, holds: "handler" },
      ];
    case "entry":
      return [
        { index: 0, holds: "id", kind: shape.target },
        { index: 1, holds: "event", hooks: shape.hooks },
        { index: 2, holds: "handler" },
      ];
    case "map":
      return [
        { index: 0, holds: "map" },
        { index: 1, holds: "event", hooks: shape.hooks },
        { index: 2, holds: "handler" },
      ];
    case "runtime":
      return [
        { index: shape.event, holds: "event", hooks: shape.hooks },
        { index: shape.event + 1, holds: "handler" },
      ];
  }
}

const boundOf = (shape: Shape): BindingDef["bound"] =>
  shape.kind === "entry" ? "db" : shape.kind === "map" ? "map" : "global";

export const luaBindings: BindingDef[] = (
  [
    // (opcode, event, function): an opcode is not content.
    [
      "RegisterPacketEvent",
      935,
      69,
      "exact",
      { kind: "runtime", hooks: "PacketEvents", event: 1 },
    ],
    ["RegisterServerEvent", 711, 70, "exact", event("ServerEvents")],
    ["RegisterPlayerEvent", 809, 71, "exact", event("PlayerEvents")],
    ["RegisterGuildEvent", 846, 72, "exact", event("GuildEvents")],
    ["RegisterGroupEvent", 878, 73, "exact", event("GroupEvents")],
    [
      "RegisterCreatureEvent",
      1200,
      74,
      "exact",
      entry("creature", "CreatureEvents"),
    ],
    // (guid, instance_id, event, function): runtime values only.
    [
      "RegisterUniqueCreatureEvent",
      1272,
      75,
      "exact",
      { kind: "runtime", hooks: "CreatureEvents", event: 2 },
    ],
    [
      "RegisterCreatureGossipEvent",
      962,
      76,
      "exact",
      entry("creature", "GossipEvents"),
    ],
    [
      "RegisterGameObjectEvent",
      1311,
      77,
      "exact",
      entry("gameobject", "GameObjectEvents"),
    ],
    [
      "RegisterGameObjectGossipEvent",
      989,
      78,
      "exact",
      entry("gameobject", "GossipEvents"),
    ],
    ["RegisterItemEvent", 1019, 79, "exact", entry("item", "ItemEvents")],
    [
      "RegisterItemGossipEvent",
      1046,
      80,
      "exact",
      entry("item", "GossipEvents"),
    ],
    // (menu_id, event, function): the script chooses the menu ID itself.
    [
      "RegisterPlayerGossipEvent",
      1129,
      81,
      "heuristic",
      { kind: "runtime", hooks: "GossipEvents", event: 1 },
    ],
    ["RegisterBGEvent", 906, 82, "exact", event("BGEvents")],
    // Map events are decoded with the instance table (LuaEngine.cpp:1492).
    [
      "RegisterMapEvent",
      1073,
      83,
      "exact",
      { kind: "map", hooks: "InstanceEvents" },
    ],
    // (instance_id, event, function): a runtime instance, not static content.
    [
      "RegisterInstanceEvent",
      1100,
      84,
      "exact",
      { kind: "runtime", hooks: "InstanceEvents", event: 1 },
    ],
    ["RegisterTicketEvent", 1335, 85, "exact", event("TicketEvents")],
    ["RegisterSpellEvent", 1358, 86, "exact", entry("spell", "SpellEvents")],
    ["RegisterAllCreatureEvent", 1390, 87, "exact", event("AllCreatureEvents")],
  ] as const satisfies readonly (readonly [
    string,
    number,
    number,
    Confidence,
    Shape,
  ])[]
).map(([symbol, line, exported, confidence, shape]) => ({
  id: `lua.call.${symbol}`,
  language: "lua",
  form: "function_call",
  symbol,
  args: argsOf(shape),
  bound: boundOf(shape),
  emits: "lua_handler",
  confidence,
  source: [`${GLOBAL}:${line}`, `${EXPORTS}:${exported}`],
}));
