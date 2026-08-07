import { SYMBOL_KEYS, type SymbolKey } from "@/app/components/Symbols";

/* ============================================================================
   DEMO STUB — NOT THE PRODUCT'S SPIN ENGINE. DELETE AT CHECKPOINT 5.

   In production the outcome is decided by a Convex mutation before the
   animation starts, and the client only performs a result that already exists
   (PRODUCT.md, principle 2). This file exists so the first viewport can be
   designed and reviewed before the backend exists.

   It deliberately never returns a jackpot. The state this viewport has to get
   right is the loss, because that is what essentially every spin returns; the
   potential-winner path is a different surface with its own claim flow.
   ========================================================================== */

const NON_JACKPOT = SYMBOL_KEYS.filter((s) => s !== "SEVEN");

export type DemoResult = {
  symbols: [SymbolKey, SymbolKey, SymbolKey];
  isPotentialWinner: false;
};

export function demoSpin(): DemoResult {
  const pick = () => NON_JACKPOT[Math.floor(Math.random() * NON_JACKPOT.length)];
  // Matches the real engine's rule: a non-winning spin can never read 7-7-7.
  // Excluding SEVEN outright also keeps the demo from manufacturing near
  // misses, which the product bans in copy and must not smuggle into art.
  return { symbols: [pick(), pick(), pick()], isPotentialWinner: false };
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
