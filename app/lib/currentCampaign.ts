import { resolveTier, defaultOddsDenominator } from "@/app/lib/tiers.ts";

/**
 * The live campaign, hardcoded until the backend reads it from Convex
 * (implementation plan, Task 8). Shared by the campaign surface and the Official
 * Rules so the published rules cannot drift from what the product does.
 */
export const CURRENT_CAMPAIGN = {
  name: "SpinDrop",
  slug: "seed-100-gift-card",
  sponsorSlug: "spindrop",
  prizeTitle: "$100 gift card",
  /** Integer cents. Decides the tier, and therefore the reel count. */
  prizeValueCents: 10_000,
  /** Override the tier default when set. See the hazard note in tiers.ts. */
  oddsDenominator: undefined as number | undefined,
  sponsorName: "SpinDrop",
  status: "live" as const,
  dailySpins: 10,
  resetTimezone: "UTC",
  resetHour: 0,
  claimDeadlineDays: 14,
  noPurchaseStatement:
    "No purchase necessary. A purchase will not increase your chances of winning. Eligibility restrictions apply. See ",
} as const;

export const CURRENT_TIER = resolveTier(CURRENT_CAMPAIGN.prizeValueCents);

export const CURRENT_ODDS =
  CURRENT_CAMPAIGN.oddsDenominator ?? defaultOddsDenominator(CURRENT_TIER);
