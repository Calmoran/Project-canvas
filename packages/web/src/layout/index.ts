/**
 * `layout(nodes, edges)`: where every node goes, worked out by ELK in a Web
 * Worker so the page stays responsive while it runs.
 *
 * A Web Worker is a second thread the page can hand work to; the two sides
 * talk only by sending messages. `LayoutClient` keeps one worker alive,
 * numbers each request, and matches each answer to the promise waiting for
 * it.
 */
import type {
  LayoutDirection,
  LayoutEdge,
  LayoutNode,
  Position,
} from "./elk-layout";
import type { LayoutCall, LayoutReply } from "./protocol";

export type {
  LayoutDirection,
  LayoutEdge,
  LayoutNode,
  Position,
} from "./elk-layout";

export interface LayoutOptions {
  /** Which way edges run; left to right (`RIGHT`) unless a view asks. */
  readonly direction?: LayoutDirection;
  /**
   * Cancels the request: the promise rejects with the signal's reason and
   * the answer, when it comes, is dropped. Used when the visible graph
   * changes before its last layout finished.
   */
  readonly signal?: AbortSignal;
}

/** The layout failed: ELK refused the graph, or the worker itself broke. */
export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

/** The parts of a browser `Worker` the client uses; tests pass a fake. */
export interface LayoutWorker {
  postMessage(call: LayoutCall): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<LayoutReply>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

interface Pending {
  resolve(positions: ReadonlyMap<string, Position>): void;
  reject(reason: unknown): void;
}

export class LayoutClient {
  readonly #createWorker: () => LayoutWorker;
  #worker: LayoutWorker | undefined;
  #nextId = 1;
  readonly #pending = new Map<number, Pending>();

  constructor(createWorker: () => LayoutWorker) {
    this.#createWorker = createWorker;
  }

  layout(
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
    options: LayoutOptions = {},
  ): Promise<ReadonlyMap<string, Position>> {
    const { signal, direction } = options;
    if (signal?.aborted) return Promise.reject(signal.reason as Error);

    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.#pending.delete(id);
        reject(signal!.reason as Error);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const settle =
        <T>(fn: (value: T) => void) =>
        (value: T) => {
          signal?.removeEventListener("abort", onAbort);
          fn(value);
        };
      this.#pending.set(id, {
        resolve: settle(resolve),
        reject: settle(reject),
      });

      // Only the fields ELK needs cross to the worker: a caller may pass
      // richer objects (React Flow nodes), and copying those is wasted work.
      this.#ensureWorker().postMessage({
        id,
        request: {
          nodes: nodes.map(({ id, width, height }) => ({ id, width, height })),
          edges: edges.map(({ id, source, target }) => ({
            id,
            source,
            target,
          })),
          ...(direction === undefined ? {} : { direction }),
        },
      });
    });
  }

  /** Stops the worker; requests still waiting fail with a LayoutError. */
  dispose(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#failAll("The layout worker was stopped.");
  }

  #ensureWorker(): LayoutWorker {
    if (this.#worker !== undefined) return this.#worker;
    const worker = this.#createWorker();
    worker.addEventListener("message", (event) => {
      const reply = event.data;
      const pending = this.#pending.get(reply.id);
      if (pending === undefined) return; // cancelled meanwhile
      this.#pending.delete(reply.id);
      if (reply.ok) pending.resolve(reply.positions);
      else pending.reject(new LayoutError(reply.message));
    });
    // The worker script failed to load or threw outside a request. Every
    // waiting request fails, and the next request starts a fresh worker.
    worker.addEventListener("error", (event) => {
      if (this.#worker !== worker) return;
      worker.terminate();
      this.#worker = undefined;
      this.#failAll(
        `The layout worker failed: ${event.message || "unknown error"}.`,
      );
    });
    this.#worker = worker;
    return worker;
  }

  #failAll(message: string): void {
    const waiting = [...this.#pending.values()];
    this.#pending.clear();
    for (const pending of waiting) pending.reject(new LayoutError(message));
  }
}

let shared: LayoutClient | undefined;

/**
 * Lays out a graph with ELK's `layered` algorithm and returns the top-left
 * corner of each node, keyed by node id. All views share one worker.
 */
export function layout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  options?: LayoutOptions,
): Promise<ReadonlyMap<string, Position>> {
  shared ??= new LayoutClient(
    () =>
      new Worker(new URL("./layout.worker.ts", import.meta.url), {
        type: "module",
        name: "canvas-layout",
      }),
  );
  return shared.layout(nodes, edges, options);
}
