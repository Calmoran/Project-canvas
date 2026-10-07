/**
 * Turns a list of frame durations into the numbers the spike reports.
 *
 * A frame is one screen update. The browser calls `requestAnimationFrame` once
 * per frame, so the time between two calls is how long that frame took. At
 * 60 Hz a smooth frame takes about 16.7 ms; a frame that takes much longer is
 * a visible stutter. Plain TypeScript, so it is unit-tested in Node.
 */

export interface FrameStats {
  /** Frames per second over the whole sample. */
  readonly fps: number;
  /** Median frame time in ms: the typical frame. */
  readonly medianMs: number;
  /** 95th-percentile frame time in ms: how bad the worst 1 in 20 frames is. */
  readonly p95Ms: number;
  /** The single slowest frame in ms: the longest freeze the user saw. */
  readonly maxMs: number;
  /** Share of frames (0 to 1) that took longer than 1.5 screen refreshes. */
  readonly slowShare: number;
}

/** Value at quantile `q` (0..1) of an ascending-sorted list, nearest rank. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.ceil(q * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

/**
 * @param deltas time between consecutive frames, in ms
 * @param refreshMs the screen's idle frame time (16.7 at 60 Hz), the yardstick
 *   for "slow"
 */
export function summarizeFrames(
  deltas: readonly number[],
  refreshMs: number,
): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = deltas.reduce((sum, d) => sum + d, 0);
  const slow = deltas.filter((d) => d > refreshMs * 1.5).length;
  return {
    fps: total > 0 ? (deltas.length * 1000) / total : 0,
    medianMs: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    maxMs: sorted.length > 0 ? sorted[sorted.length - 1]! : Number.NaN,
    slowShare: deltas.length > 0 ? slow / deltas.length : 0,
  };
}

/** Median of a list, for collapsing repeated runs into one number. */
export function median(values: readonly number[]): number {
  return quantile(
    [...values].sort((a, b) => a - b),
    0.5,
  );
}
