// The worker's message handling, run in Node with the real ELK engine. The
// worker file itself only connects this to the worker's message events.
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, test, vi } from "vitest";
import type { ElkLike } from "../src/layout/elk-layout";
import { createLayoutHandler } from "../src/layout/worker-handler";

const node = (id: string) => ({ id, width: 100, height: 40 });
const request = {
  nodes: [node("a"), node("b")],
  edges: [{ id: "ab", source: "a", target: "b" }],
};

describe("createLayoutHandler", () => {
  test("answers with the caller's id and a position per node", async () => {
    const handle = createLayoutHandler(() => Promise.resolve(new ELK()));
    const reply = await handle({ id: 7, request });
    expect(reply.id).toBe(7);
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect([...reply.positions.keys()].sort()).toEqual(["a", "b"]);
    expect(reply.positions.get("a")!.x).toBeLessThan(
      reply.positions.get("b")!.x,
    );
  });

  test("an edge to a missing node is an error reply, not a crash", async () => {
    const handle = createLayoutHandler(() => Promise.resolve(new ELK()));
    const reply = await handle({
      id: 1,
      request: {
        nodes: [node("a")],
        edges: [{ id: "ax", source: "a", target: "x" }],
      },
    });
    expect(reply).toMatchObject({ id: 1, ok: false });
    if (reply.ok) return;
    expect(reply.message).not.toBe("");
  });

  test("loads the engine once, on the first call", async () => {
    const load = vi.fn(() => Promise.resolve<ElkLike>(new ELK()));
    const handle = createLayoutHandler(load);
    expect(load).not.toHaveBeenCalled();
    await handle({ id: 1, request });
    await handle({ id: 2, request });
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("a failed engine load fails that call, and the next call retries", async () => {
    const load = vi
      .fn<() => Promise<ElkLike>>()
      .mockRejectedValueOnce(new Error("engine missing"))
      .mockResolvedValue(new ELK());
    const handle = createLayoutHandler(load);
    expect(await handle({ id: 1, request })).toEqual({
      id: 1,
      ok: false,
      message: "engine missing",
    });
    expect((await handle({ id: 2, request })).ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
