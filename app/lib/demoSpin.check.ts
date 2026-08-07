/**
 * Self-check for the reel-drawing rule. Run: `npm run check:spin`
 *
 * The rule is easy to get subtly wrong in either direction — withhold sevens
 * entirely and every visible seven becomes a win tell; withhold nothing and the
 * demo can render a jackpot it did not award.
 */
import assert from "node:assert/strict";
import { demoSpin } from "./demoSpin.ts";
import { SYMBOL_KEYS, isJackpot } from "./symbols.ts";

const N = 50_000;
let sevensSeen = 0;
let twoSevensSeen = 0;
const seen = new Set<string>();

for (let i = 0; i < N; i++) {
  const { symbols, isPotentialWinner } = demoSpin();

  assert.equal(symbols.length, 3, "a spin has exactly three reels");
  assert.equal(isJackpot(symbols), false, "the stub must never render 7-7-7");
  assert.equal(isPotentialWinner, false, "the stub never awards a prize");

  for (const s of symbols) {
    assert.ok(SYMBOL_KEYS.includes(s), `unknown symbol ${s}`);
    seen.add(s);
  }

  const sevens = symbols.filter((s) => s === "SEVEN").length;
  if (sevens >= 1) sevensSeen++;
  if (sevens === 2) twoSevensSeen++;
}

// Every symbol must be reachable, or a drum can never show it.
assert.equal(
  seen.size,
  SYMBOL_KEYS.length,
  `only ${seen.size} of ${SYMBOL_KEYS.length} symbols ever appeared`,
);

// Individual sevens must appear. This is the assertion that fails if someone
// "fixes" the jackpot rule by excluding SEVEN from the pool again.
assert.ok(
  sevensSeen > N * 0.1,
  `sevens appear too rarely (${sevensSeen}/${N}) — is SEVEN excluded from the pool?`,
);

// Two sevens is a near miss. It must occur at its natural rate: neither
// engineered upward (a banned dark pattern) nor suppressed to zero.
assert.ok(
  twoSevensSeen > 0,
  "two-seven near misses never occur, so the third reel is being constrained",
);

console.log(
  `ok — ${N} spins, ${seen.size}/${SYMBOL_KEYS.length} symbols seen, ` +
    `${sevensSeen} with a seven, ${twoSevensSeen} near misses, 0 jackpots`,
);
