// The page side of the layout worker: numbering requests, matching answers,
// cancelling, and recovering when the worker breaks. A fake worker stands in
// for the browser's (Node has none); it runs the real handler and ELK.
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, test } from "vitest";
import {
  LayoutClient,
  LayoutError,
  type LayoutWorker,
} from "../src/layout/index";
import type { LayoutCall, LayoutReply } from "../src/layout/protocol";
import { createLayoutHandler } from "../src/layout/worker-handler";

/** A worker that answers in-process, recording what it was sent. */
class FakeWorker implements LayoutWorker {
  readonly sent: LayoutCall[] = [];
  terminated = false;
  #onMessage: ((event: MessageEvent<LayoutReply>) => void) | undefined;
  #onError: ((event: ErrorEvent) => void) | undefined;
  readonly #handle = createLayoutHandler(() => Promise.resolve(new ELK()));

  postMessage(call: LayoutCall): void {
    // Copy the call the way the browser does between threads.
    const copy = structuredClone(call);
    this.sent.push(copy);
    void this.#handle(copy).then((reply) =>
      this.#onMessage?.({ data: reply } as MessageEvent<LayoutReply>),
    );
  }

  addEventListener(
    type: "message" | "error",
    listener:
      | ((event: MessageEvent<LayoutReply>) => void)
      | ((event: ErrorEvent) => void),
  ): void {
    if (type === "message")
      this.#onMessage = listener as (e: MessageEvent<LayoutReply>) => void;
    else this.#onError = listener as (e: ErrorEvent) => void;
  }

  /** Simulates the worker script failing. */
  fail(message: string): void {
    this.#onError?.({ message } as ErrorEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const node = (id: string) => ({ id, width: 100, height: 40 });
const nodes = [node("a"), node("b"), node("c")];
const edges = [
  { id: "ab", source: "a", target: "b" },
  { id: "bc", source: "b", target: "c" },
];

function setup() {
  const workers: FakeWorker[] = [];
  const client = new LayoutClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

describe("LayoutClient", () => {
  test("returns a position for every node, left to right by default", async () => {
    const { client } = setup();
    const positions = await client.layout(nodes, edges);
    expect(positions.get("a")!.x).toBeLessThan(positions.get("b")!.x);
    expect(positions.get("b")!.x).toBeLessThan(positions.get("c")!.x);
  });

  test("passes the direction through", async () => {
    const { client } = setup();
    const positions = await client.layout(nodes, edges, { direction: "DOWN" });
    expect(positions.get("a")!.y).toBeLessThan(positions.get("c")!.y);
  });

  test("starts one worker and matches concurrent answers to their callers", async () => {
    const { client, workers } = setup();
    const [first, second] = await Promise.all([
      client.layout([node("p")], []),
      client.layout([node("q"), node("r")], []),
    ]);
    expect(workers).toHaveLength(1);
    expect([...first.keys()]).toEqual(["p"]);
    expect([...second.keys()].sort()).toEqual(["q", "r"]);
    expect(workers[0]!.sent.map((call) => call.id)).toEqual([1, 2]);
  });

  test("sends only the fields ELK needs", async () => {
    const { client, workers } = setup();
    const rich = { ...node("a"), data: { label: "Fireball" } };
    await client.layout([rich], []);
    expect(workers[0]!.sent[0]!.request.nodes).toEqual([node("a")]);
  });

  test("an ELK error becomes a LayoutError", async () => {
    const { client } = setup();
    await expect(
      client.layout([node("a")], [{ id: "ax", source: "a", target: "x" }]),
    ).rejects.toBeInstanceOf(LayoutError);
  });

  test("an aborted request rejects with the signal's reason", async () => {
    const { client } = setup();
    const controller = new AbortController();
    const pending = client.layout(nodes, edges, { signal: controller.signal });
    const reason = new Error("graph changed");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  test("an already aborted signal sends nothing", async () => {
    const { client, workers } = setup();
    const reason = new Error("too late");
    await expect(
      client.layout(nodes, edges, { signal: AbortSignal.abort(reason) }),
    ).rejects.toBe(reason);
    expect(workers).toHaveLength(0);
  });

  test("a broken worker fails waiting requests; the next request gets a new worker", async () => {
    const { client, workers } = setup();
    // The worker fails before its answer arrives; the late answer is ignored.
    const pending = client.layout(nodes, edges);
    workers[0]!.fail("script did not load");
    await expect(pending).rejects.toThrow(/script did not load/);
    expect(workers[0]!.terminated).toBe(true);

    const positions = await client.layout(nodes, edges);
    expect(positions.size).toBe(3);
    expect(workers).toHaveLength(2);
  });

  test("dispose stops the worker and fails waiting requests", async () => {
    const { client, workers } = setup();
    const pending = client.layout(nodes, edges);
    client.dispose();
    await expect(pending).rejects.toBeInstanceOf(LayoutError);
    expect(workers[0]!.terminated).toBe(true);
  });
});
