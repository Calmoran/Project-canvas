/**
 * Synthetic graph for the React Flow scale spike (issue #24).
 *
 * The spike measures rendering, not data, so the graph is invented: a random
 * tree (n - 1 edges, so every node is connected) plus n / 2 random cross
 * edges, about 1.5 edges per node as the issue asks. A seeded random number
 * generator makes every run draw the same graph, so numbers from two runs
 * compare like for like.
 *
 * Plain TypeScript with no React import, so the unit test can run it in Node.
 */

/** The fixed size of one card, in screen pixels at zoom 1. */
export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 64;

/** Placeholder kinds, only to vary the icon; not a claim about any server. */
export const KINDS = ["alpha", "beta", "gamma", "delta", "epsilon"] as const;
export type Kind = (typeof KINDS)[number];

export interface SpikeNode {
  readonly id: string;
  readonly kind: Kind;
  readonly label: string;
  readonly badges: readonly [string, string];
  readonly x: number;
  readonly y: number;
}

export interface SpikeEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

export interface SpikeGraph {
  readonly nodes: readonly SpikeNode[];
  readonly edges: readonly SpikeEdge[];
}

/** mulberry32: a small, fast, seedable pseudo-random generator in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BADGES = ["DBC", "SQL", "C++", "Lua", "override"] as const;
const GAP_X = 80;
const GAP_Y = 40;

/**
 * Builds `count` nodes on a near-square grid and `round(count * 1.5)`
 * edges with no self-loops and no duplicates. The grid stands in for a real
 * layout: ELK is a separate concern (WEB-2), and a grid keeps the visible
 * area per zoom level predictable.
 */
export function makeGraph(count: number, seed = 1): SpikeGraph {
  if (!Number.isInteger(count) || count < 3) {
    throw new RangeError(`count must be an integer >= 3, got ${count}`);
  }
  const random = seededRandom(seed);
  const pick = (max: number): number => Math.floor(random() * max);
  const columns = Math.ceil(Math.sqrt(count));

  const nodes: SpikeNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `n${i}`,
      kind: KINDS[i % KINDS.length]!,
      label: `Node ${i}`,
      badges: [BADGES[pick(BADGES.length)]!, BADGES[pick(BADGES.length)]!],
      x: (i % columns) * (CARD_WIDTH + GAP_X),
      y: Math.floor(i / columns) * (CARD_HEIGHT + GAP_Y),
    });
  }

  const edges: SpikeEdge[] = [];
  const seen = new Set<string>();
  const add = (s: number, t: number): boolean => {
    const key = `${s}>${t}`;
    if (s === t || seen.has(key)) return false;
    seen.add(key);
    edges.push({ id: `e${edges.length}`, source: `n${s}`, target: `n${t}` });
    return true;
  };

  // Tree: each node after the first hangs off an earlier one.
  for (let i = 1; i < count; i++) add(pick(i), i);
  // Cross edges until the total reaches about 1.5 per node.
  const target = Math.round(count * 1.5);
  while (edges.length < target) add(pick(count), pick(count));

  return { nodes, edges };
}

/**
 * The pan and zoom that fit every card into a `width` x `height` pane with a
 * 5% margin. The spike computes this itself rather than using React Flow's
 * `fitView`, because `fitView` waits until every node has been measured, and
 * the "visible-presized" variant never measures off-screen nodes; every
 * variant then starts from exactly the same view.
 */
export function fitViewport(
  nodes: readonly SpikeNode[],
  width: number,
  height: number,
): { x: number; y: number; zoom: number } {
  const right = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH;
  const bottom = Math.max(...nodes.map((n) => n.y)) + CARD_HEIGHT;
  const left = Math.min(...nodes.map((n) => n.x));
  const top = Math.min(...nodes.map((n) => n.y));
  const zoom = Math.min(width / (right - left), height / (bottom - top)) * 0.95;
  return {
    x: (width - (right - left) * zoom) / 2 - left * zoom,
    y: (height - (bottom - top) * zoom) / 2 - top * zoom,
    zoom,
  };
}

/**
 * The pan that puts the middle of the graph in the middle of a `width` x
 * `height` pane at a given zoom. Used to start a run at a chosen zoom (just
 * above a simplification threshold, issue #65) with the densest part of the
 * grid on screen.
 */
export function centredViewport(
  nodes: readonly SpikeNode[],
  width: number,
  height: number,
  zoom: number,
): { x: number; y: number; zoom: number } {
  const left = Math.min(...nodes.map((n) => n.x));
  const top = Math.min(...nodes.map((n) => n.y));
  const right = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH;
  const bottom = Math.max(...nodes.map((n) => n.y)) + CARD_HEIGHT;
  return {
    x: width / 2 - ((left + right) / 2) * zoom,
    y: height / 2 - ((top + bottom) / 2) * zoom,
    zoom,
  };
}
