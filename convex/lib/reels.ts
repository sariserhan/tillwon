import { SYMBOL_KEYS, isJackpot, jackpotFor, type SymbolKey } from "./symbols.ts";

const NON_SEVEN = SYMBOL_KEYS.filter((s) => s !== "SEVEN");

/**
 * Decorative only. The outcome is already decided by the sealed entry counter
 * before this runs, which is why a seeded generator is acceptable here and would
 * not be for the winner draw.
 *
 * Every reel is drawn uniformly and only the all-sevens result is withheld, by
 * re-rolling the last reel from the non-seven pool — one step, no loop.
 */
export function drawLosingReels(
  columns: number,
  rand: () => number = Math.random,
): SymbolKey[] {
  const pick = <T,>(pool: readonly T[]): T => pool[Math.floor(rand() * pool.length)];
  const reels = Array.from({ length: columns }, () => pick(SYMBOL_KEYS));
  if (isJackpot(reels)) reels[columns - 1] = pick(NON_SEVEN);
  return reels;
}

export function drawWinningReels(columns: number): SymbolKey[] {
  return jackpotFor(columns);
}
