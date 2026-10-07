/**
 * The messages between the page and the layout worker. The page sends a
 * request with a number it picked; the worker answers with the same number,
 * so several layouts can be in flight and each answer finds its caller.
 */
import type { LayoutRequest, Position } from "./elk-layout";

export interface LayoutCall {
  readonly id: number;
  readonly request: LayoutRequest;
}

export type LayoutReply =
  | {
      readonly id: number;
      readonly ok: true;
      readonly positions: ReadonlyMap<string, Position>;
    }
  | { readonly id: number; readonly ok: false; readonly message: string };
