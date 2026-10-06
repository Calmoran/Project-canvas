import { expect, test } from "vitest";
import {
  LAYERS,
  NODE_KINDS,
  NODE_KINDS_BY_LAYER,
  layerOf,
} from "../../src/index.js";

test("every kind name is unique across layers, so a kind tells its layer", () => {
  expect(new Set(NODE_KINDS).size).toBe(NODE_KINDS.length);
});

test("the C++ class and the player class are different kinds", () => {
  expect(layerOf("class")).toBe("code");
  expect(layerOf("player_class")).toBe("game");
});

test("each layer holds the kinds architecture section 3 lists", () => {
  expect(LAYERS).toEqual(["data", "code", "binding", "game"]);
  expect(NODE_KINDS_BY_LAYER.data).toEqual([
    "row",
    "dbc_record",
    "table",
    "dbc_file",
  ]);
  expect(NODE_KINDS_BY_LAYER.binding).toEqual([
    "script_registration",
    "id_literal",
    "loader",
  ]);
  expect(NODE_KINDS_BY_LAYER.code).toHaveLength(10);
  expect(NODE_KINDS_BY_LAYER.game).toHaveLength(11);
});
