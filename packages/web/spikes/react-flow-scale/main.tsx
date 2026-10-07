/**
 * React Flow scale spike (issue #24). Throwaway: it answers one question, "can
 * the explorer draw 1,500 card nodes smoothly?", and is not part of the app.
 *
 * The page measures itself. For each combination of node count, rendering
 * variant and starting view it:
 *   1. mounts a fresh React Flow and times how long until the cards and edges
 *      are on screen and have stopped changing (initial render);
 *   2. pans the view in a fast circle for a few seconds, recording every frame;
 *   3. zooms in and out for a few seconds, recording every frame.
 *
 * Variants:
 *   - "all": React Flow's default, every node and edge is in the page.
 *   - "visible": `onlyRenderVisibleElements`, React Flow drops nodes and edges
 *     outside the view from the page.
 *   - "visible-presized": the same, plus each node declares its size and handle
 *     positions up front. React Flow otherwise draws every node once to measure
 *     it, even with "visible"; declaring the size skips that first full draw.
 *     Canvas cards have a fixed size, so the real explorer could do this.
 *
 * Views:
 *   - "overview": zoomed out to fit the whole graph (computed, not fitView;
 *     see fitViewport in graph.ts).
 *   - "work": zoom 1, cards readable, a slice of the graph on screen.
 *
 * To measure: `pnpm --filter @canvas/web spike:rf:measure out.json` runs
 * everything headless (see measure.ts). To look at it: `spike:rf` builds and
 * serves the page; open the printed address and press "Run all". Results from
 * the first measurement are in results/, the write-up in
 * docs/research/react-flow-scale.md.
 */
import { StrictMode, useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Position,
  ReactFlow,
  type Edge,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { CardNode, type CardNodeType } from "./CardNode";
import { CARD_HEIGHT, CARD_WIDTH, fitViewport, makeGraph } from "./graph";
import { median, summarizeFrames, type FrameStats } from "./stats";

const COUNTS = [500, 1000, 1500] as const;
const VARIANTS = ["all", "visible", "visible-presized"] as const;
const VIEWS = ["overview", "work"] as const;
type Variant = (typeof VARIANTS)[number];
type View = (typeof VIEWS)[number];

interface Config {
  readonly count: number;
  readonly variant: Variant;
  readonly view: View;
}

export interface RunResult extends Config {
  /** ms from "mount" to cards and edges on screen and stable. */
  readonly renderMs: number;
  /** The longest single frame during that initial render: the freeze. */
  readonly renderFreezeMs: number;
  /** Cards and edges in the page once settled (fewer than total when culled). */
  readonly domNodes: number;
  readonly domEdges: number;
  readonly pan: FrameStats;
  readonly zoom: FrameStats;
}

export interface RunAllOptions {
  readonly repeats?: number;
  readonly motionMs?: number;
  readonly counts?: readonly number[];
}

export interface RunAllResult {
  readonly userAgent: string;
  readonly refreshMs: number;
  readonly devicePixelRatio: number;
  readonly window: { readonly width: number; readonly height: number };
  readonly repeats: number;
  readonly motionMs: number;
  /** One entry per configuration, each metric the median over the repeats. */
  readonly results: readonly RunResult[];
}

declare global {
  interface Window {
    spike?: { runAll: (options?: RunAllOptions) => Promise<RunAllResult> };
  }
}

// Defined once at module level: a new object on every render would make React
// Flow treat the node types as changed and redraw every card.
const nodeTypes = { card: CardNode };

/** Handle boxes matching the CSS (6 px dots centred on the left/right edge). */
const PRESIZED_HANDLES = [
  {
    type: "target" as const,
    position: Position.Left,
    x: -3,
    y: CARD_HEIGHT / 2 - 3,
    width: 6,
    height: 6,
  },
  {
    type: "source" as const,
    position: Position.Right,
    x: CARD_WIDTH - 3,
    y: CARD_HEIGHT / 2 - 3,
    width: 6,
    height: 6,
  },
];

function toFlow(
  config: Config,
  pane: { width: number; height: number },
): { nodes: CardNodeType[]; edges: Edge[]; viewport: Viewport } {
  const graph = makeGraph(config.count);
  const presized = config.variant === "visible-presized";
  const nodes = graph.nodes.map((n): CardNodeType => ({
    id: n.id,
    type: "card",
    position: { x: n.x, y: n.y },
    data: { kind: n.kind, label: n.label, badges: n.badges },
    ...(presized
      ? { width: CARD_WIDTH, height: CARD_HEIGHT, handles: PRESIZED_HANDLES }
      : {}),
  }));
  const edges = graph.edges.map((e): Edge => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));
  const viewport =
    config.view === "overview"
      ? fitViewport(graph.nodes, pane.width, pane.height)
      : { x: 40, y: 40, zoom: 1 };
  return { nodes, edges, viewport };
}

// ---- frame measurement -------------------------------------------------

const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls `step(elapsedMs)` once per frame for `durationMs` and returns the
 * time between frames. `step` is where the view is moved.
 */
async function sampleFrames(
  durationMs: number,
  step: (elapsedMs: number) => void,
): Promise<number[]> {
  const deltas: number[] = [];
  const start = await nextFrame();
  let last = start;
  for (;;) {
    const now = await nextFrame();
    deltas.push(now - last);
    last = now;
    if (now - start >= durationMs) return deltas;
    step(now - start);
  }
}

/** The screen's idle frame time: median frame gap with nothing on screen. */
async function measureRefresh(): Promise<number> {
  return median(await sampleFrames(1000, () => undefined));
}

const countIn = (root: Element, selector: string): number =>
  root.querySelectorAll(selector).length;

/**
 * Waits until the flow has cards and edges in the page and their counts have
 * not changed for 5 frames in a row. Returns when that stable state began
 * (relative to `t0`) and the longest frame seen on the way.
 */
async function waitForSettled(
  root: Element,
  t0: number,
): Promise<{ renderMs: number; freezeMs: number }> {
  let last = t0;
  let freezeMs = 0;
  let stableSince = Number.NaN;
  let previous = "";
  for (;;) {
    const now = await nextFrame();
    freezeMs = Math.max(freezeMs, now - last);
    last = now;
    const nodes = countIn(root, ".react-flow__node");
    const edges = countIn(root, ".react-flow__edge");
    const signature = `${nodes}/${edges}`;
    if (nodes > 0 && edges > 0 && signature === previous) {
      if (Number.isNaN(stableSince)) stableSince = now;
    } else {
      stableSince = Number.NaN;
    }
    previous = signature;
    if (!Number.isNaN(stableSince) && now - stableSince > 5 * 17) {
      return { renderMs: stableSince - t0, freezeMs };
    }
    if (now - t0 > 60_000) throw new Error("flow did not settle in 60 s");
  }
}

// ---- the page ----------------------------------------------------------

interface Mounted {
  readonly config: Config;
  readonly key: number;
}

function App() {
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const [status, setStatus] = useState("idle");
  const [report, setReport] = useState<RunAllResult | null>(null);
  const instance = useRef<ReactFlowInstance<CardNodeType> | null>(null);
  const flowBox = useRef<HTMLDivElement>(null);

  const flow = useMemo(
    // The pane div is always in the page, so it has a size before the flow mounts.
    () =>
      mounted
        ? toFlow(mounted.config, flowBox.current!.getBoundingClientRect())
        : null,
    [mounted],
  );

  const onInit = useCallback((rf: ReactFlowInstance<CardNodeType>) => {
    instance.current = rf;
  }, []);

  const runOne = useCallback(
    async (config: Config, motionMs: number, key: number) => {
      instance.current = null;
      setMounted(null);
      await nextFrame();
      await wait(300); // let the previous graph be collected
      const t0 = performance.now();
      setMounted({ config, key });
      const { renderMs, freezeMs } = await waitForSettled(flowBox.current!, t0);
      // onInit fires on a timer after the first render; wait for it.
      let rf = instance.current as ReactFlowInstance<CardNodeType> | null;
      while (rf === null) {
        await nextFrame();
        rf = instance.current;
      }
      const base: Viewport = rf.getViewport();
      const box = flowBox.current!.getBoundingClientRect();
      const settledNodes = countIn(flowBox.current!, ".react-flow__node");
      const settledEdges = countIn(flowBox.current!, ".react-flow__edge");

      // Pan: a fast circle (800 px radius, one lap per 2 s, about 2,500 px/s),
      // so new cards keep entering the view.
      const pan = await sampleFrames(motionMs, (t) => {
        const a = (t / 2000) * 2 * Math.PI;
        void rf.setViewport({
          x: base.x + 800 * Math.cos(a) - 800,
          y: base.y + 800 * Math.sin(a),
          zoom: base.zoom,
        });
      });
      void rf.setViewport(base);
      await nextFrame();

      // Zoom: from half to double the starting zoom and back every 2 s,
      // around the centre of the view.
      const cx = box.width / 2;
      const cy = box.height / 2;
      const zoom = await sampleFrames(motionMs, (t) => {
        const z = base.zoom * 2 ** Math.sin((t / 2000) * 2 * Math.PI);
        const k = z / base.zoom;
        void rf.setViewport({
          x: cx - (cx - base.x) * k,
          y: cy - (cy - base.y) * k,
          zoom: z,
        });
      });

      return { renderMs, freezeMs, settledNodes, settledEdges, pan, zoom };
    },
    [],
  );

  const runAll = useCallback(
    async (options: RunAllOptions = {}): Promise<RunAllResult> => {
      const repeats = options.repeats ?? 3;
      const motionMs = options.motionMs ?? 3000;
      const counts = options.counts ?? COUNTS;
      setReport(null);
      setStatus("measuring screen refresh");
      const refreshMs = await measureRefresh();
      const configs: Config[] = [];
      for (const count of counts)
        for (const variant of VARIANTS)
          for (const view of VIEWS) configs.push({ count, variant, view });

      // Repeats run as whole passes, so a slow moment on the machine spreads
      // across configurations instead of landing on one.
      const raw = configs.map(() => [] as Awaited<ReturnType<typeof runOne>>[]);
      let key = 0;
      for (let r = 0; r < repeats; r++) {
        for (const [i, config] of configs.entries()) {
          setStatus(
            `pass ${r + 1}/${repeats}: ${config.count} nodes, ${config.variant}, ${config.view}`,
          );
          raw[i]!.push(await runOne(config, motionMs, ++key));
        }
      }
      setMounted(null);

      const collapse = (runs: FrameStats[]): FrameStats => ({
        fps: median(runs.map((s) => s.fps)),
        medianMs: median(runs.map((s) => s.medianMs)),
        p95Ms: median(runs.map((s) => s.p95Ms)),
        maxMs: median(runs.map((s) => s.maxMs)),
        slowShare: median(runs.map((s) => s.slowShare)),
      });
      const results = configs.map((config, i): RunResult => {
        const runs = raw[i]!;
        return {
          ...config,
          renderMs: median(runs.map((x) => x.renderMs)),
          renderFreezeMs: median(runs.map((x) => x.freezeMs)),
          domNodes: median(runs.map((x) => x.settledNodes)),
          domEdges: median(runs.map((x) => x.settledEdges)),
          pan: collapse(runs.map((x) => summarizeFrames(x.pan, refreshMs))),
          zoom: collapse(runs.map((x) => summarizeFrames(x.zoom, refreshMs))),
        };
      });
      const result: RunAllResult = {
        userAgent: navigator.userAgent,
        refreshMs,
        devicePixelRatio: window.devicePixelRatio,
        window: { width: window.innerWidth, height: window.innerHeight },
        repeats,
        motionMs,
        results,
      };
      setReport(result);
      setStatus("done");
      return result;
    },
    [runOne],
  );

  window.spike = { runAll };

  return (
    <div className="spike">
      <header className="spike__bar">
        <button type="button" onClick={() => void runAll()}>
          Run all
        </button>
        <span className="spike__status">{status}</span>
      </header>
      <div className="spike__flow" ref={flowBox}>
        {mounted && flow ? (
          <ReactFlow
            key={mounted.key}
            nodes={flow.nodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            onInit={onInit}
            onlyRenderVisibleElements={mounted.config.variant !== "all"}
            minZoom={0.02}
            maxZoom={4}
            defaultViewport={flow.viewport}
          />
        ) : null}
      </div>
      {report ? <ReportTable report={report} /> : null}
    </div>
  );
}

const ms = (v: number): string => v.toFixed(0);
const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;

function ReportTable({ report }: { report: RunAllResult }) {
  return (
    <section className="spike__report">
      <p>
        Screen refresh {report.refreshMs.toFixed(1)} ms (
        {(1000 / report.refreshMs).toFixed(0)} Hz), window {report.window.width}
        x{report.window.height}, {report.repeats} passes, medians shown.
      </p>
      <table>
        <thead>
          <tr>
            <th>Nodes</th>
            <th>Variant</th>
            <th>View</th>
            <th>Render ms</th>
            <th>Freeze ms</th>
            <th>In page</th>
            <th>Pan fps</th>
            <th>Pan p95 ms</th>
            <th>Pan slow</th>
            <th>Zoom fps</th>
            <th>Zoom p95 ms</th>
            <th>Zoom slow</th>
          </tr>
        </thead>
        <tbody>
          {report.results.map((r) => (
            <tr key={`${r.count}-${r.variant}-${r.view}`}>
              <td>{r.count}</td>
              <td>{r.variant}</td>
              <td>{r.view}</td>
              <td>{ms(r.renderMs)}</td>
              <td>{ms(r.renderFreezeMs)}</td>
              <td>
                {r.domNodes}/{r.domEdges}
              </td>
              <td>{r.pan.fps.toFixed(0)}</td>
              <td>{ms(r.pan.p95Ms)}</td>
              <td>{pct(r.pan.slowShare)}</td>
              <td>{r.zoom.fps.toFixed(0)}</td>
              <td>{ms(r.zoom.p95Ms)}</td>
              <td>{pct(r.zoom.slowShare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>JSON</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
