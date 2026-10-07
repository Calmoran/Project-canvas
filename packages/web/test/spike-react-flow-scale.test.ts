// Tests for the pure parts of the React Flow scale spike (issue #24): the
// synthetic graph must be the shape the issue asks for, and the frame
// statistics must compute what the research note says they compute.
import { describe, expect, test } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  centredViewport,
  fitViewport,
  makeGraph,
} from "../spikes/react-flow-scale/graph.js";
import {
  median,
  quantile,
  summarizeFrames,
} from "../spikes/react-flow-scale/stats.js";

describe("makeGraph", () => {
  test.each([500, 1000, 1500])("%i nodes get about 1.5 edges each", (n) => {
    const { nodes, edges } = makeGraph(n);
    expect(nodes).toHaveLength(n);
    expect(edges).toHaveLength(Math.round(n * 1.5));
  });

  test("no self-loops, no duplicate edges, every endpoint exists", () => {
    const { nodes, edges } = makeGraph(1500);
    const ids = new Set(nodes.map((n) => n.id));
    const pairs = new Set<string>();
    for (const e of edges) {
      expect(e.source).not.toBe(e.target);
      expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
      pairs.add(`${e.source}>${e.target}`);
    }
    expect(pairs.size).toBe(edges.length);
  });

  test("every node is connected (the tree part reaches all of them)", () => {
    const { nodes, edges } = makeGraph(1000);
    const touched = new Set(edges.flatMap((e) => [e.source, e.target]));
    expect(touched.size).toBe(nodes.length);
  });

  test("the same seed draws the same graph", () => {
    expect(makeGraph(500, 7)).toEqual(makeGraph(500, 7));
    expect(makeGraph(500, 7)).not.toEqual(makeGraph(500, 8));
  });

  test("rejects counts too small to hold 1.5 edges per node", () => {
    expect(() => makeGraph(2)).toThrow(RangeError);
  });
});

describe("frame statistics", () => {
  test("quantile uses nearest rank", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.95)).toBe(4);
    expect(quantile([], 0.5)).toBeNaN();
    expect(median([3, 1, 2])).toBe(2);
  });

  test("a steady 60 Hz sample is 60 fps with no slow frames", () => {
    const s = summarizeFrames(Array<number>(60).fill(1000 / 60), 1000 / 60);
    expect(s.fps).toBeCloseTo(60);
    expect(s.slowShare).toBe(0);
  });

  test("one 200 ms freeze shows in max and slow share", () => {
    const deltas = [...Array<number>(9).fill(10), 200];
    const s = summarizeFrames(deltas, 10);
    expect(s.maxMs).toBe(200);
    expect(s.medianMs).toBe(10);
    expect(s.slowShare).toBeCloseTo(0.1);
    expect(s.fps).toBeCloseTo((10 * 1000) / 290);
  });
});

describe("fitViewport", () => {
  test("every card lands inside the pane", () => {
    const { nodes } = makeGraph(1500);
    const v = fitViewport(nodes, 1600, 858);
    for (const n of nodes) {
      const left = n.x * v.zoom + v.x;
      const top = n.y * v.zoom + v.y;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + CARD_WIDTH * v.zoom).toBeLessThanOrEqual(1600);
      expect(top + CARD_HEIGHT * v.zoom).toBeLessThanOrEqual(858);
    }
  });
});

describe("centredViewport", () => {
  test("puts the middle of the graph in the middle of the pane", () => {
    const { nodes } = makeGraph(1500);
    const left = Math.min(...nodes.map((n) => n.x));
    const right = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH;
    const top = Math.min(...nodes.map((n) => n.y));
    const bottom = Math.max(...nodes.map((n) => n.y)) + CARD_HEIGHT;
    for (const zoom of [0.3, 0.5, 1]) {
      const v = centredViewport(nodes, 1600, 858, zoom);
      expect(v.zoom).toBe(zoom);
      expect(((left + right) / 2) * zoom + v.x).toBeCloseTo(800);
      expect(((top + bottom) / 2) * zoom + v.y).toBeCloseTo(429);
    }
  });
});
