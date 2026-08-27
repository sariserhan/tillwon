import { describe, it, expect } from "vitest";
import { drawLosingReels, drawWinningReels } from "./reels";
import { SYMBOL_KEYS, isJackpot } from "./symbols";
import { TIERS, SYMBOLS_PER_REEL } from "./tiers";

/** Deterministic generator so a failure is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("drawWinningReels", () => {
  it("is a seven on every column, at every tier", () => {
    for (const t of TIERS) {
      const reels = drawWinningReels(t.columns);
      expect(reels).toHaveLength(t.columns);
      expect(isJackpot(reels)).toBe(true);
    }
  });
});

describe("drawLosingReels", () => {
  it("never produces a jackpot at any tier", () => {
    for (const t of TIERS) {
      const rand = mulberry32(7);
      for (let i = 0; i < 20_000; i++) {
        const reels = drawLosingReels(t.columns, rand);
        expect(reels).toHaveLength(t.columns);
        expect(isJackpot(reels)).toBe(false);
      }
    }
  });

  it("reaches every symbol", () => {
    const rand = mulberry32(11);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      for (const s of drawLosingReels(3, rand)) seen.add(s);
    }
    expect(seen.size).toBe(SYMBOL_KEYS.length);
  });

  it("lands individual sevens at their honest frequency", () => {
    // Excluding SEVEN outright would make any visible seven a win tell, and a
    // machine whose jackpot symbol never appears looks broken or rigged.
    for (const t of TIERS) {
      const rand = mulberry32(23);
      const N = 40_000;
      let withSeven = 0;
      for (let i = 0; i < N; i++) {
        if (drawLosingReels(t.columns, rand).includes("SEVEN")) withSeven++;
      }
      const expected = 1 - Math.pow(1 - 1 / SYMBOLS_PER_REEL, t.columns);
      expect(Math.abs(withSeven / N - expected)).toBeLessThan(0.02);
    }
  });
});
