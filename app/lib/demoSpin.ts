import { SYMBOL_KEYS, isJackpot, type SymbolKey } from "./symbols.ts";

/* ============================================================================
   DEMO STUB — NOT THE PRODUCT'S SPIN ENGINE. DELETE AT CHECKPOINT 5.

   In production the outcome is decided by a Convex mutation before the
   animation starts, and the client only performs a result that already exists
   (PRODUCT.md, principle 2). This file exists so the first viewport can be
   designed and reviewed before the backend exists.

   It never returns a jackpot. The state this viewport has to get right is the
   loss, because that is what essentially every spin returns; the potential-
   winner path is a different surface with its own claim flow.
   ========================================================================== */

const NON_SEVEN = SYMBOL_KEYS.filter((s) => s !== "SEVEN");

const pick = <T,>(pool: readonly T[]): T =>
  pool[Math.floor(Math.random() * pool.length)];

export type DemoResult = {
  symbols: [SymbolKey, SymbolKey, SymbolKey];
  isPotentialWinner: false;
};

/**
 * Mirrors the real engine's rule: a non-winning spin may never read 7-7-7, but
 * individual sevens land at their honest frequency.
 *
 * Excluding SEVEN outright — which this stub did originally — makes any visible
 * seven a tell that the spin has won, and a machine whose jackpot symbol never
 * appears looks either broken or rigged. Over-generating near misses would be
 * the opposite failure, banned by the product's own copy rules, so the reels are
 * drawn uniformly and only the jackpot triple is withheld.
 */
export function demoSpin(): DemoResult {
  const symbols: [SymbolKey, SymbolKey, SymbolKey] = [
    pick(SYMBOL_KEYS),
    pick(SYMBOL_KEYS),
    pick(SYMBOL_KEYS),
  ];

  // Re-roll the third reel only, from the non-seven pool, so this terminates in
  // one step rather than looping on a fresh jackpot.
  if (isJackpot(symbols)) symbols[2] = pick(NON_SEVEN);

  return { symbols, isPotentialWinner: false };
}

/** Symbols each drum cycles through on its way to the result. */
export function reelQueue(final: SymbolKey, steps: number): SymbolKey[] {
  const queue: SymbolKey[] = [];
  for (let i = 0; i < steps; i++) {
    queue.push(SYMBOL_KEYS[i % SYMBOL_KEYS.length]);
  }
  queue.push(final);
  return queue;
}
