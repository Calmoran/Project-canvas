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
