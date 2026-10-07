/**
 * The card under test: kind icon, label, two badges, one handle on each side
 * (a handle is the dot an edge attaches to). It is wrapped in `memo`, so
 * React skips re-rendering a card whose props did not change; React Flow's
 * performance guide asks for exactly that, and the real explorer card will
 * be built the same way.
 *
 * Styling is flat on purpose (no shadows, gradients or animations), also per
 * that guide, so the numbers measure React Flow and not CSS effects.
 */
import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { Kind } from "./graph";

export type CardData = {
  kind: Kind;
  label: string;
  badges: readonly [string, string];
};

export type CardNodeType = Node<CardData, "card">;

/** One simple vector shape per kind, standing in for a real icon. */
const ICON_PATHS: Record<Kind, string> = {
  alpha: "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z",
  beta: "M2 2h12v12H2z",
  gamma: "M8 1l7 14H1z",
  delta: "M8 1l7 7-7 7-7-7z",
  epsilon: "M4 1h8l4 7-4 7H4L0 8z",
};

function CardNodeComponent({ data }: NodeProps<CardNodeType>) {
  return (
    <div className={`card card--${data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <svg className="card__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d={ICON_PATHS[data.kind]} />
      </svg>
      <div className="card__body">
        <div className="card__label">{data.label}</div>
        <div className="card__badges">
          <span className="card__badge">{data.badges[0]}</span>
          <span className="card__badge">{data.badges[1]}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const CardNode = memo(CardNodeComponent);
