/**
 * The layout worker: a second thread in the page that runs ELK, so a long
 * layout never freezes the screen. The page starts it with
 * `new Worker(new URL("./layout.worker.ts", import.meta.url))`; Vite builds
 * it as its own file.
 */
import ELK from "elkjs/lib/elk-api.js";
import type { ElkLike } from "./elk-layout";
import type { LayoutCall, LayoutReply } from "./protocol";
import { createLayoutHandler } from "./worker-handler";

/** The parts of the worker's global scope this file uses. */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<LayoutCall>) => void,
  ): void;
  postMessage(message: LayoutReply): void;
}
const scope = globalThis as unknown as WorkerScope;

/** ELK's in-thread engine: takes ELK's messages, answers through `onmessage`. */
type EngineConstructor = new () => object;

/**
 * Loads ELK's layout engine to run here, in this thread.
 *
 * The engine file decides at load time how to present itself. When it sees
 * a worker (no `document`) it takes over the worker's own message handler
 * and expects ELK's message format; otherwise it exports an in-thread engine
 * object, as it does in Node. Canvas wants the in-thread object, so its own
 * messages and errors stay its own (Alex's WEB-2 decision, point 3). So the
 * engine is loaded with a stand-in `document` present, removed right after.
 * The stand-in is never read: the engine only checks that the name exists.
 */
async function loadElk(): Promise<ElkLike> {
  const global = globalThis as { document?: unknown };
  const standIn = !("document" in global);
  if (standIn) global.document = {};
  try {
    // A CommonJS file: its exports arrive as `default`, and bundlers may
    // also copy them to the top level.
    const loaded = (await import("elkjs/lib/elk-worker.js")) as unknown as {
      Worker?: EngineConstructor;
      default?: { Worker?: EngineConstructor };
    };
    const Engine = loaded.default?.Worker ?? loaded.Worker;
    if (Engine === undefined) {
      throw new Error("ELK's engine file did not export its in-thread engine.");
    }
    // ELK's API talks to the engine through a worker-shaped object; the
    // in-thread engine is one, though not a browser Worker by type.
    return new ELK({ workerFactory: () => new Engine() as unknown as Worker });
  } finally {
    if (standIn) delete global.document;
  }
}

const handle = createLayoutHandler(loadElk);

scope.addEventListener("message", (event) => {
  void handle(event.data).then((reply) => scope.postMessage(reply));
});
