/**
 * What the layout worker does with one message, apart from the worker
 * plumbing, so a test can run it in Node with the real ELK engine.
 */
import { runLayout, type ElkLike } from "./elk-layout";
import type { LayoutCall, LayoutReply } from "./protocol";

/**
 * Returns a handler that answers each call with positions or an error
 * message. `loadElk` runs once, on the first call, so the 5 MB engine is
 * read only when a view first asks for a layout.
 */
export function createLayoutHandler(
  loadElk: () => Promise<ElkLike>,
): (call: LayoutCall) => Promise<LayoutReply> {
  let elk: Promise<ElkLike> | undefined;
  return async ({ id, request }) => {
    try {
      // A failed engine load is forgotten, so the next call tries again.
      elk ??= loadElk().catch((error: unknown) => {
        elk = undefined;
        throw error;
      });
      const positions = await runLayout(await elk, request);
      return { id, ok: true, positions };
    } catch (error) {
      return { id, ok: false, message: describe(error) };
    }
  };
}

/** ELK throws Java-style objects as well as Errors; say something readable. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return String(error);
}
