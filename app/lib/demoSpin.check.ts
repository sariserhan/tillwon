/**
 * Self-check for the reel-drawing rule and the tier table. Run: `npm run check:spin`
 *
 * The drawing rule is easy to get subtly wrong in either direction — withhold
 * sevens entirely and every visible seven becomes a win tell; withhold nothing
 * and the demo can render a jackpot it did not award. Both must hold at every
 * column count, not just at three.
 */
import assert from "node:assert/strict";
import { demoSpin, reelQueue } from "./demoSpin.ts";
import {
  FIRST_SETTLE_MS,
  FLAP_MS,
  SETTLE_SPREAD_MS,
  flipTimes,
  settleMs,
  spinDurationMs,
} from "./reelTiming.ts";
import { SYMBOL_KEYS, isJackpot } from "./symbols.ts";
import {
  TIERS,
  SYMBOLS_PER_REEL,
  defaultOddsDenominator,
  formatOdds,
  resolveTier,
} from "./tiers.ts";
import {
  ALL_US_JURISDICTIONS,
  ELIGIBLE_JURISDICTIONS,
  EXCLUSIONS,
  REGISTRATION_THRESHOLD_CENTS,
  isEligibleJurisdiction,
  registrationDuty,
} from "./jurisdictions.ts";

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

/* ---- jurisdictions ------------------------------------------------------- */

assert.equal(ALL_US_JURISDICTIONS.length, 51, "50 states plus DC");
assert.equal(
  new Set(ALL_US_JURISDICTIONS).size,
  51,
  "jurisdiction codes must be unique",
);
assert.equal(ELIGIBLE_JURISDICTIONS.length, 47, "46 states plus DC are eligible");

// Nothing may be both eligible and excluded, and every exclusion must name a real
// jurisdiction — a typo'd code would silently exclude nobody.
for (const e of EXCLUSIONS) {
  assert.ok(
    (ALL_US_JURISDICTIONS as readonly string[]).includes(e.code),
    `exclusion ${e.code} is not a real jurisdiction`,
  );
  assert.equal(isEligibleJurisdiction(e.code), false, `${e.code} must be excluded`);
  assert.ok(e.reason.length > 40, `exclusion ${e.code} needs a real reason`);
}
assert.ok(isEligibleJurisdiction("ny"), "lookups are case-insensitive");
assert.ok(isEligibleJurisdiction("RI"), "Rhode Island stays eligible: online-only");
assert.equal(isEligibleJurisdiction("PR"), false, "territories are out of scope");

// The registration cliff must sit exactly on tier 4's ceiling.
const tier4Ceiling = TIERS[3].maxValue!;
assert.equal(
  tier4Ceiling,
  REGISTRATION_THRESHOLD_CENTS,
  "the NY/FL $5,000 threshold must coincide with tier 4's ceiling",
);
assert.equal(registrationDuty(tier4Ceiling).required, false, "$5,000 exactly: no filing");
assert.equal(registrationDuty(tier4Ceiling + 1).required, true, "$5,000.01: filing due");
assert.deepEqual(registrationDuty(1_000_000).states, ["NY", "FL"]);
assert.equal(registrationDuty(1_000_000).leadDays, 30);

for (const t of TIERS) {
  const probe = t.maxValue ?? t.minValue + 1;
  const duty = registrationDuty(probe);
  assert.equal(
    duty.required,
    t.tier >= 5,
    `tier ${t.tier} registration duty should be ${t.tier >= 5}`,
  );
}

/* ---- reel timing --------------------------------------------------------- */

// The spec budgets 2.5-4s per spin. This must hold at every reel count, because
// the animation cannot be watched in a headless environment — the numbers are the
// only guarantee available.
for (const t of TIERS) {
  const total = spinDurationMs(t.columns);
  assert.ok(
    total >= 2500 && total <= 4000,
    `tier ${t.tier} (${t.columns} reels): spin takes ${total}ms, outside the 2500-4000ms budget`,
  );
  assert.equal(settleMs(0, t.columns), FIRST_SETTLE_MS, "first reel settles on time");
  assert.equal(
    settleMs(t.columns - 1, t.columns),
    FIRST_SETTLE_MS + SETTLE_SPREAD_MS,
    "last reel lands one full spread after the first, whatever the count",
  );

  // Reels must land in order, each strictly after the one before it.
  for (let i = 1; i < t.columns; i++) {
    assert.ok(
      settleMs(i, t.columns) > settleMs(i - 1, t.columns),
      `tier ${t.tier}: reel ${i} does not land after reel ${i - 1}`,
    );
  }
}

{
  const times = flipTimes(FIRST_SETTLE_MS);

  assert.ok(times.length >= 8, `only ${times.length} flips — the reel barely moves`);
  assert.equal(times.at(-1), FIRST_SETTLE_MS, "the final flip lands exactly on settle");

  const gaps = times.map((t, i) => (i === 0 ? t : t - times[i - 1]));
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] > times[i - 1], "flip times must strictly increase");
  }
  // Decelerating: every gap except the last (which absorbs the remainder) grows.
  for (let i = 1; i < gaps.length - 1; i++) {
    assert.ok(
      gaps[i] > gaps[i - 1],
      `gap ${i} (${gaps[i]}ms) is not longer than gap ${i - 1} (${gaps[i - 1]}ms) — the reel is not slowing down`,
    );
  }
  // The first gap is deliberately shorter than one flap, so leaves overlap. That
  // only reads as motion because FlapDrum remounts the leaf per flip.
  assert.ok(
    gaps[0] < FLAP_MS,
    "the opening gap should be shorter than a flap, for continuous motion",
  );

  // reelQueue must supply exactly one symbol per flip, ending on the result.
  const queue = reelQueue("SEVEN", times.length - 1);
  assert.equal(queue.length, times.length, "one queued symbol per flip");
  assert.equal(queue.at(-1), "SEVEN", "the queue ends on the actual result");
}

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
