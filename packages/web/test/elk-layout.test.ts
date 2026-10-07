// The layout step on a small graph, with the real ELK engine (its single-file
// build, which runs in Node as well as in a worker).
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, test } from "vitest";
import { runLayout, toElkGraph } from "../src/layout/elk-layout";

const node = (id: string) => ({ id, width: 100, height: 40 });
// a -> b -> c, and a -> c: a small graph with one long edge.
const request = {
  nodes: [node("a"), node("b"), node("c")],
  edges: [
    { id: "ab", source: "a", target: "b" },
    { id: "bc", source: "b", target: "c" },
    { id: "ac", source: "a", target: "c" },
  ],
};

describe("toElkGraph", () => {
  test("asks for the layered algorithm, left to right by default", () => {
    const graph = toElkGraph(request);
    expect(graph.layoutOptions).toEqual({
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
    });
    expect(graph.children).toHaveLength(3);
    expect(graph.edges?.[0]).toEqual({
      id: "ab",
      sources: ["a"],
      targets: ["b"],
    });
  });
});

describe("runLayout", () => {
  test("places every node, each edge pointing right, none overlapping", async () => {
    const positions = await runLayout(new ELK(), request);
    expect([...positions.keys()].sort()).toEqual(["a", "b", "c"]);
    const x = (id: string) => positions.get(id)!.x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
    // Columns are at least one node wide apart.
    expect(x("b") - x("a")).toBeGreaterThanOrEqual(100);
  });

  test("DOWN puts the columns into rows instead", async () => {
    const positions = await runLayout(new ELK(), {
      ...request,
      direction: "DOWN",
    });
    const y = (id: string) => positions.get(id)!.y;
    expect(y("a")).toBeLessThan(y("b"));
    expect(y("b")).toBeLessThan(y("c"));
  });
});
