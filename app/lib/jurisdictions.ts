/**
 * Eligible jurisdictions for a SpinDrop campaign.
 *
 * ⚠️ RECOMMENDED, PENDING COUNSEL. This encodes desk research, not legal advice.
 * Every exclusion below carries its reason so a lawyer can confirm or overrule it
 * quickly, which is the whole point of writing it down rather than burying it in
 * an Official Rules paragraph.
 *
 * Sources are listed in docs/superpowers/specs/2026-08-06-spindrop-design.md §17.
 */

export const ALL_US_JURISDICTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI",
  "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN",
  "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA",
  "WI", "WV", "WY",
] as const;

export type UsJurisdiction = (typeof ALL_US_JURISDICTIONS)[number];

export type Exclusion = { code: UsJurisdiction; reason: string };

/**
 * Excluded for the MVP. Each is a business decision with a cost, not a legal
 * impossibility — a different product choice reopens most of them.
 */
export const EXCLUSIONS: readonly Exclusion[] = [
  {
    code: "TN",
    reason:
      "Tennessee's consumer protection act makes it a deceptive practice to condition receipt of a prize on consent to promotional use. Because SpinDrop requires a publicity release to accept a prize (winners are not anonymous), Tennessee is incompatible. Tennessee is the ONLY state with this restriction: making publicity optional would reopen it.",
  },
  {
    code: "AL",
    reason:
      "Minimum age is 19, above the campaign's 18. Excluded only because minimumAge is a single per-campaign number today; a per-region age floor would reopen it.",
  },
  {
    code: "NE",
    reason:
      "Minimum age is 19, above the campaign's 18. Same fix as Alabama.",
  },
  {
    code: "MS",
    reason:
      "Minimum age is 21, above the campaign's 18. Same fix as Alabama.",
  },
];

const excludedCodes = new Set<string>(EXCLUSIONS.map((e) => e.code));

/** 46 states plus the District of Columbia. */
export const ELIGIBLE_JURISDICTIONS: readonly UsJurisdiction[] =
  ALL_US_JURISDICTIONS.filter((c) => !excludedCodes.has(c));

export const MINIMUM_AGE = 18;

/**
 * US territories and overseas military installations are out of scope. They are
 * separate regimes (Puerto Rico in particular has its own promotion rules), and
 * the brief is explicit that campaigns must not claim eligibility anywhere that
 * has not been reviewed.
 */
export const TERRITORIES_EXCLUDED = true;

export function isEligibleJurisdiction(code: string): boolean {
  return (ELIGIBLE_JURISDICTIONS as readonly string[]).includes(
    code.toUpperCase(),
  );
}

/* -------------------------------------------------------------------------- */
/* Registration and bonding                                                    */
/* -------------------------------------------------------------------------- */

/**
 * NY and FL require registration AND a surety bond for the total prize value when
 * prizes EXCEED $5,000. Below that, neither applies.
 *
 * $5,000 is tier 4's ceiling exactly, so tiers 1-4 are registration-free and
 * tiers 5-6 are not. Keep that alignment when editing the tier table.
 */
export const REGISTRATION_THRESHOLD_CENTS = 500_000;

export type RegistrationDuty = {
  required: boolean;
  states: string[];
  /** Longest lead time across the required filings, in days. */
  leadDays: number;
  notes: string[];
};

export function registrationDuty(prizeValueCents: number): RegistrationDuty {
  if (prizeValueCents <= REGISTRATION_THRESHOLD_CENTS) {
    return {
      required: false,
      states: [],
      leadDays: 0,
      notes: [
        "At or below $5,000 in total prize value, no state registration or bond applies.",
      ],
    };
  }
  return {
    required: true,
    states: ["NY", "FL"],
    leadDays: 30,
    notes: [
      "New York: file at least 30 days before the start date, $100 fee, surety bond or CD for the total prize value.",
      "Florida: file at least 7 days before the start date, with a bond for the total prize value.",
      "Both require a winners list to be made available after the promotion ends.",
      "An open-ended 'until someone wins' campaign is a poor fit here: these filings assume a stated period and the bond stays outstanding for the whole run. Set a hard end date above this threshold.",
    ],
  };
}

/**
 * Rhode Island registers sweepstakes tied to RETAIL locations when the prize pool
 * exceeds $500, with no bond. SpinDrop is online-only with no in-store component,
 * so RI stays eligible — but a sponsor who ties a campaign to physical stores
 * brings this duty back at a far lower threshold than NY or FL.
 */
export const RHODE_ISLAND_RETAIL_THRESHOLD_CENTS = 50_000;
