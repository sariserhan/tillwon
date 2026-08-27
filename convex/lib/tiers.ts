/**
 * Prize tiers. The tier is derived from the prize's value and decides how many
 * reels the apparatus has — a bigger prize is visibly a longer machine.
 *
 * Monetary values are integer cents, matching the spec's minor-units rule.
 */

export type Tier = {
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  /** Exclusive lower bound in cents. */
  minValue: number;
  /** Inclusive upper bound in cents; null on the open-ended top tier. */
  maxValue: number | null;
  columns: number;
  label: string;
};

export const TIERS: readonly Tier[] = [
  { tier: 1, minValue: 0, maxValue: 10_000, columns: 3, label: "Up to $100" },
  { tier: 2, minValue: 10_000, maxValue: 50_000, columns: 4, label: "$100 to $500" },
  { tier: 3, minValue: 50_000, maxValue: 100_000, columns: 5, label: "$500 to $1,000" },
  { tier: 4, minValue: 100_000, maxValue: 500_000, columns: 6, label: "$1,000 to $5,000" },
  { tier: 5, minValue: 500_000, maxValue: 1_000_000, columns: 7, label: "$5,000 to $10,000" },
  { tier: 6, minValue: 1_000_000, maxValue: null, columns: 8, label: "$10,000 and above" },
];

/**
 * Bounds are exclusive-low / inclusive-high, so "up to $100" includes exactly
 * $100 and $500 sits in the $100-to-$500 tier rather than straddling two.
 */
export function resolveTier(valueCents: number): Tier {
  const found = TIERS.find(
    (t) => valueCents > t.minValue && (t.maxValue === null || valueCents <= t.maxValue),
  );
  if (!found) {
    // Only reachable at exactly 0, or a negative value, which is a data error.
    return TIERS[0];
  }
  return found;
}

/** Symbols per reel. One of these on every column is the jackpot. */
export const SYMBOLS_PER_REEL = 10;

/**
 * Default published odds denominator for a tier: every column must show the
 * seven, so 10^columns.
 *
 * ⚠️ This ladder spans five orders of magnitude while prize value spans about
 * two, so expected value per entry FALLS as tiers rise — tier 6 is roughly 200×
 * worse per entry than tier 1, and at 10,000 entries a day it needs ~27 years to
 * produce a winner. Campaigns therefore carry their own `oddsDenominator`, and
 * this is only its default. Decoupling the two (for example, deriving the
 * denominator from a target campaign length) changes no engine code and no
 * reel code — set the field.
 */
export function defaultOddsDenominator(tier: Tier): number {
  return Math.pow(SYMBOLS_PER_REEL, tier.columns);
}

/** "1 in 100,000,000" */
export function formatOdds(denominator: number): string {
  return `1 in ${denominator.toLocaleString("en-US")}`;
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
