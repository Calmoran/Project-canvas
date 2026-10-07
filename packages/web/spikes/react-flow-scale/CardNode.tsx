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
import { createContext, memo, useCallback, useContext, useEffect } from "react";
import {
  Handle,
  Position,
  useStore,
  type Node,
  type NodeProps,
  type ReactFlowState,
} from "@xyflow/react";
import type { Kind } from "./graph";

export type CardData = {
  kind: Kind;
  label: string;
  badges: readonly [string, string];
};

/** "cardSwap" is the same card with the zoom switch (issue #65). */
export type CardNodeType = Node<CardData, "card" | "cardSwap">;

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

// ---- simplified cards below a zoom threshold (issue #65) ------------------
//
// Below the threshold zoom a card is drawn as a plain coloured box: no icon,
// text or badges. The two handles stay, because React Flow reads where they
// are to draw the edges. Two ways to do the switch are measured:
//
//   - "swap": every card watches the zoom in React Flow's store and renders a
//     different, smaller element below the threshold. Crossing the threshold
//     re-renders every card on screen once; in between, nothing re-renders,
//     because the store only wakes a card when its yes/no answer changes.
//   - "css": the card stays as it is. One small component watches the zoom
//     and puts a class on the flow's container; the stylesheet hides the
//     icon and text under that class. React re-renders nothing; the browser
//     restyles the cards on screen once.

/** The zoom below which cards are simplified; `null` turns it off. */
export const ThresholdContext = createContext<number | null>(null);

function useBelowThreshold(): boolean {
  const threshold = useContext(ThresholdContext);
  const selector = useCallback(
    (s: ReactFlowState) => threshold !== null && s.transform[2] < threshold,
    [threshold],
  );
  return useStore(selector);
}

function SwapCardNodeComponent(props: NodeProps<CardNodeType>) {
  const simple = useBelowThreshold();
  if (!simple) return <CardNodeComponent {...props} />;
  return (
    <div className={`card card--box card--${props.data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const SwapCardNode = memo(SwapCardNodeComponent);

/**
 * Rendered inside `<ReactFlow>` for the "css" way: keeps the class
 * `flow--boxes` on `target` while the zoom is below the threshold.
 */
export function ZoomClass({ target }: { target: HTMLElement | null }) {
  const simple = useBelowThreshold();
  useEffect(() => {
    target?.classList.toggle("flow--boxes", simple);
  }, [simple, target]);
  return null;
}
