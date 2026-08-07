/**
 * Self-check for the reel-drawing rule and the tier table. Run: `npm run check:spin`
 *
 * The drawing rule is easy to get subtly wrong in either direction — withhold
 * sevens entirely and every visible seven becomes a win tell; withhold nothing
 * and the demo can render a jackpot it did not award. Both must hold at every
 * column count, not just at three.
 */
import assert from "node:assert/strict";
import { demoSpin } from "./demoSpin.ts";
import { SYMBOL_KEYS, isJackpot } from "./symbols.ts";
import {
  TIERS,
  SYMBOLS_PER_REEL,
  defaultOddsDenominator,
  formatOdds,
  resolveTier,
} from "./tiers.ts";

/* ---- tier table ---------------------------------------------------------- */

assert.equal(SYMBOL_KEYS.length, SYMBOLS_PER_REEL, "reel depth must match the symbol set");

// Ranges must be contiguous and ascending, or a prize value falls through a gap.
TIERS.forEach((t, i) => {
  assert.equal(t.tier, i + 1, "tiers are numbered in order");
  if (i > 0) {
    assert.equal(
      t.minValue,
      TIERS[i - 1].maxValue,
      `tier ${t.tier} does not start where tier ${t.tier - 1} ends`,
    );
  }
  assert.equal(t.columns, i + 3, `tier ${t.tier} should have ${i + 3} columns`);
});
assert.equal(TIERS.at(-1)!.maxValue, null, "the top tier must be open-ended");

// Boundaries land on the intended side: "up to $100" includes exactly $100.
assert.equal(resolveTier(10_000).tier, 1, "$100 belongs to tier 1");
assert.equal(resolveTier(10_001).tier, 2, "$100.01 belongs to tier 2");
assert.equal(resolveTier(50_000).tier, 2, "$500 belongs to tier 2");
assert.equal(resolveTier(100_000).tier, 3, "$1,000 belongs to tier 3");
assert.equal(resolveTier(500_000).tier, 4, "$5,000 belongs to tier 4");
assert.equal(resolveTier(1_000_000).tier, 5, "$10,000 belongs to tier 5");
assert.equal(resolveTier(9_999_999).tier, 6, "anything above $10,000 is tier 6");
assert.equal(resolveTier(1).tier, 1, "a one-cent prize is tier 1");

/* ---- drawing rule, every tier -------------------------------------------- */

const N = 20_000;
const rows: string[] = [];

for (const t of TIERS) {
  const seen = new Set<string>();
  let withSeven = 0;
  let nearMiss = 0; // all but one reel showing a seven

  for (let i = 0; i < N; i++) {
    const { symbols, isPotentialWinner } = demoSpin(t.columns);

    assert.equal(symbols.length, t.columns, `tier ${t.tier} must draw ${t.columns} reels`);
    assert.equal(isJackpot(symbols), false, `tier ${t.tier} rendered a jackpot`);
    assert.equal(isPotentialWinner, false, "the stub never awards a prize");

    for (const s of symbols) {
      assert.ok(SYMBOL_KEYS.includes(s), `unknown symbol ${s}`);
      seen.add(s);
    }

    const sevens = symbols.filter((s) => s === "SEVEN").length;
    if (sevens >= 1) withSeven++;
    if (sevens === t.columns - 1) nearMiss++;
  }

  assert.equal(
    seen.size,
    SYMBOL_KEYS.length,
    `tier ${t.tier}: only ${seen.size}/${SYMBOL_KEYS.length} symbols appeared`,
  );

  // The assertion that fails if anyone "fixes" the rule by excluding SEVEN.
  assert.ok(
    withSeven > N * 0.1,
    `tier ${t.tier}: sevens too rare (${withSeven}/${N}) — is SEVEN excluded?`,
  );

  // Expected share of spins containing at least one seven: 1 - (9/10)^columns.
  const expected = 1 - Math.pow(1 - 1 / SYMBOLS_PER_REEL, t.columns);
  const actual = withSeven / N;
  assert.ok(
    Math.abs(actual - expected) < 0.02,
    `tier ${t.tier}: seven frequency ${actual.toFixed(3)} strays from ${expected.toFixed(3)} — reels are not drawn uniformly`,
  );

  rows.push(
    `  tier ${t.tier}  ${String(t.columns).padStart(2)} reels  ` +
      `${formatOdds(defaultOddsDenominator(t)).padEnd(20)}  ` +
      `seven ${(actual * 100).toFixed(1)}% (exp ${(expected * 100).toFixed(1)}%)  ` +
      `near miss ${nearMiss}`,
  );
}

console.log(`ok — ${N} spins per tier, 0 jackpots, all reels drawn uniformly`);
console.log(rows.join("\n"));
