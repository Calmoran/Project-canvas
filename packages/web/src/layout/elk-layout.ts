/**
 * The layout step itself, independent of where it runs: turns Canvas's nodes
 * and edges into ELK's graph format, asks ELK to place them with its
 * `layered` algorithm, and reads back a position for each node.
 *
 * "Layered" puts nodes in columns so that most edges point the same way
 * (left to right by default), which suits Canvas's "this leads to that"
 * connections. The research measured it at about 4 s for 2,000 nodes, which
 * is why it runs in a Web Worker, off the thread that draws the page.
 */
import type { ElkNode, LayoutOptions } from "elkjs/lib/elk-api";

export interface LayoutNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface LayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

/** Which way edges run. Matches ELK's `elk.direction` values. */
export type LayoutDirection = "RIGHT" | "DOWN" | "LEFT" | "UP";

export interface LayoutRequest {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  readonly direction?: LayoutDirection;
}

/** Anything with ELK's `layout` method: ELK itself, in a worker or in a test. */
export interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>;
}

export function toElkGraph(request: LayoutRequest): ElkNode {
  const layoutOptions: LayoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": request.direction ?? "RIGHT",
  };
  return {
    id: "root",
    layoutOptions,
    children: request.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
    })),
    edges: request.edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };
}

/** Top-left corner of each node, keyed by node id. */
export async function runLayout(
  elk: ElkLike,
  request: LayoutRequest,
): Promise<Map<string, Position>> {
  const result = await elk.layout(toElkGraph(request));
  const positions = new Map<string, Position>();
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
