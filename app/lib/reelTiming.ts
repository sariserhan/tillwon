/**
 * Reel animation timing. Pure functions, extracted from the component so the
 * numbers behind the signature interaction can be asserted rather than trusted.
 *
 * The spec budgets 2.5–4s for a spin. `spinDurationMs` is the number to check
 * that against: it is 2.78s at every reel count from 3 to 8, since the spread
 * between the first and last reel is fixed rather than per-reel. (The standalone
 * `npm run check:spin` script that used to assert this was deleted with the demo
 * stub; nothing asserts it now.)
 */

/** First reel settles here; the last lands SETTLE_SPREAD_MS later, whatever the count. */
export const FIRST_SETTLE_MS = 1500;
export const SETTLE_SPREAD_MS = 1100;

/** Milliseconds after the announcement that the outcome text lands. */
export const SETTLE_TAIL_MS = 180;

/** How long one leaf takes to hinge down. Must match `flap-fall` in globals.css. */
export const FLAP_MS = 150;

export function settleMs(index: number, columns: number): number {
  if (columns <= 1) return FIRST_SETTLE_MS;
  return Math.round(FIRST_SETTLE_MS + (index * SETTLE_SPREAD_MS) / (columns - 1));
}

/** Total wall time for a spin, announcement included. */
export function spinDurationMs(columns: number): number {
  return settleMs(columns - 1, columns) + SETTLE_TAIL_MS;
}

/**
 * Decelerating flip times filling `total`, landing the final flip exactly on it.
 *
 * The gap starts below FLAP_MS, so early flips replace the falling leaf before it
 * finishes its travel — which is what continuous rapid flipping looks like on a
 * real board. It only works because FlapDrum remounts the leaf per flip; without
 * that the animation completes once and freezes.
 */
export function flipTimes(total: number): number[] {
  const times: number[] = [];
  let t = 0;
  let gap = 85;
  while (t + gap < total) {
    t += gap;
    times.push(t);
    gap *= 1.16;
  }
  times.push(total);
  return times;
}
