import { parseCitation } from "@canvas/core";
import { describe, expect, test } from "vitest";
import { luaHookTables } from "../src/azerothcore-335/lua-hooks.js";
import { azerothcore335 } from "../src/index.js";

describe("Lua hook tables (mod-ale Hooks.h)", () => {
  test("there is one table per event enum, each named once", () => {
    const ids = luaHookTables.map((t) => t.id);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(luaHookTables.map((t) => [t.id, t] as const))(
    "%s has no duplicate numbers and no duplicate names",
    (_id, table) => {
      const values = table.events.map((e) => e.value);
      const names = table.events.map((e) => e.name);
      expect(new Set(values).size).toBe(values.length);
      expect(new Set(names).size).toBe(names.length);
    },
  );

  test("each table cites a line range in mod-ale's Hooks.h", () => {
    for (const table of luaHookTables) {
      const c = parseCitation(table.source[0]!);
      expect(c).toMatchObject({
        source: "mod-ale",
        path: "src/LuaEngine/Hooks.h",
      });
      expect(c!.last).toBeGreaterThan(c!.first);
    }
  });

  test("spot checks against the research, gaps included", () => {
    const creature = luaHookTables.find((t) => t.id === "CreatureEvents")!;
    const name = (v: number) =>
      creature.events.find((e) => e.value === v)?.name;
    expect(name(1)).toBe("CREATURE_EVENT_ON_ENTER_COMBAT");
    expect(name(4)).toBe("CREATURE_EVENT_ON_DIED");
    expect(name(11)).toBeUndefined();
    expect(creature.events).toHaveLength(37);
    const server = luaHookTables.find((t) => t.id === "ServerEvents")!;
    expect(server.events.find((e) => e.value === 30)?.name).toBe(
      "ADDON_EVENT_ON_MESSAGE",
    );
  });
});

describe("Lua Register functions", () => {
  const lua = azerothcore335.bindings.filter((b) => b.language === "lua");

  test("all 19 exported Register functions emit a lua_handler", () => {
    expect(lua).toHaveLength(19);
    for (const b of lua) {
      expect(b).toMatchObject({ form: "function_call", emits: "lua_handler" });
      expect(b.symbol).toMatch(/^Register\w+Event$/);
    }
  });

  test("only the player gossip menu, which the script picks, is heuristic", () => {
    expect(
      lua.filter((b) => b.confidence !== "exact").map((b) => b.symbol),
    ).toEqual(["RegisterPlayerGossipEvent"]);
  });

  test("the profile versions mod-ale at its own commit", () => {
    expect(azerothcore335.sources["mod-ale"]).toBe(
      "c3de79426b03b02d2762536d727f8d40b0f8f24a",
    );
  });
});

describe("Lua binding arguments (code research 3.12)", () => {
  const lua = azerothcore335.bindings.filter((b) => b.language === "lua");
  const call = (symbol: string) => lua.find((b) => b.symbol === symbol);

  test("the hook tables are the profile's hooks", () => {
    expect(azerothcore335.hooks).toBe(luaHookTables);
  });

  test("every Register function decodes its event through an existing hook table", () => {
    const ids = new Set(luaHookTables.map((h) => h.id));
    for (const b of lua) {
      const events = (b.args ?? []).filter((a) => a.holds === "event");
      expect(events, b.id).toHaveLength(1);
      expect(ids.has(events[0]!.hooks!), b.id).toBe(true);
      expect(
        b.args?.some((a) => a.holds === "handler"),
        b.id,
      ).toBe(true);
    }
  });

  test("an entry-bound function names the content its first argument identifies", () => {
    expect(call("RegisterCreatureEvent")).toMatchObject({
      bound: "db",
      args: [
        { index: 0, holds: "id", kind: "creature" },
        { index: 1, holds: "event", hooks: "CreatureEvents" },
        { index: 2, holds: "handler" },
      ],
    });
    expect(call("RegisterSpellEvent")?.args?.[0]).toEqual({
      index: 0,
      holds: "id",
      kind: "spell",
    });
    expect(call("RegisterItemGossipEvent")?.args?.[1]).toMatchObject({
      hooks: "GossipEvents",
    });
  });

  test("map events take a Map.dbc ID and decode with the instance table", () => {
    expect(call("RegisterMapEvent")).toMatchObject({
      bound: "map",
      args: [
        { index: 0, holds: "map" },
        { index: 1, holds: "event", hooks: "InstanceEvents" },
        { index: 2, holds: "handler" },
      ],
    });
  });

  test("functions whose first values name no static content are global", () => {
    for (const symbol of [
      "RegisterPlayerEvent",
      "RegisterServerEvent",
      "RegisterPacketEvent",
      "RegisterInstanceEvent",
      "RegisterUniqueCreatureEvent",
      "RegisterPlayerGossipEvent",
    ]) {
      expect(call(symbol)?.bound, symbol).toBe("global");
    }
    // (guid, instance_id, event, function): the event is the third argument.
    expect(call("RegisterUniqueCreatureEvent")?.args?.[0]).toEqual({
      index: 2,
      holds: "event",
      hooks: "CreatureEvents",
    });
  });
});
