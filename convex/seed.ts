import { internalMutation } from "./_generated/server";
import { writeAudit } from "./lib/audit.ts";
import { resolveTier, defaultOddsDenominator, formatOdds } from "./lib/tiers.ts";
import { ELIGIBLE_JURISDICTIONS, MINIMUM_AGE } from "./lib/jurisdictions.ts";

const PRIZE_VALUE_CENTS = 10_000; // $100 gift card, the brief's seed campaign

/**
 * The seed campaign from the brief §29: a low-value self-funded prize, so spin
 * reliability and the claim process can be proven before a sponsor is involved.
 *
 * The commitment hash is a placeholder here; Task 6's activateCampaign action
 * replaces it with a real sealed target.
 */
export const seedCampaign = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sponsorId = await ctx.db.insert("sponsors", {
      name: "TillWon",
      slug: "tillwon",
      websiteUrl: "https://example.invalid",
      ctaLabel: "About TillWon",
      ctaUrl: "https://example.invalid",
      description:
        "The first campaign is self-funded, so there is no third-party sponsor yet.",
      contactName: "Platform",
      contactEmail: "support@example.invalid",
      status: "active",
    });

    const prizeId = await ctx.db.insert("prizes", {
      title: "$100 gift card",
      description: "A $100 gift card, fulfilled digitally.",
      estimatedRetailValue: PRIZE_VALUE_CENTS,
      currency: "USD",
      quantity: 1,
      imageStorageIds: [],
      fulfillmentType: "digital",
      fulfillmentNotes: "Emailed to the verified winner after approval.",
      sponsorId,
    });

    const tier = resolveTier(PRIZE_VALUE_CENTS);
    const oddsDenominator = defaultOddsDenominator(tier);

    const campaignId = await ctx.db.insert("campaigns", {
      slug: "seed-100-gift-card",
      title: "$100 gift card",
      description: "Ten free spins a day for a chance to win a $100 gift card.",
      sponsorId,
      prizeId,
      status: "live",
      startAt: Date.now(),
      // No end date: tier 1 is below the $5,000 NY/FL registration threshold,
      // so an open-ended run carries no filing or bonding duty.
      dailySpins: 10,
      resetTimezone: "UTC",
      resetHour: 0,
      reelColumns: tier.columns,
      projectedVolume: oddsDenominator,
      oddsDenominator,
      shardCount: 16,
      commitmentHash: "PENDING_ACTIVATION",
      eligibleCountries: ["US"],
      eligibleRegions: [...ELIGIBLE_JURISDICTIONS],
      minimumAge: MINIMUM_AGE,
      requireEmailVerification: true,
      activeRulesVersion: 1,
      disqualificationPolicy: "resume_campaign",
      activatedAt: Date.now(),
    });

    await ctx.db.insert("campaignRules", {
      campaignId,
      version: 1,
      title: "Official Rules",
      content:
        "Placeholder pending legal review. No purchase necessary. Open to legal residents of 46 US states and DC, 18 or older. Void in TN, AL, NE, MS, all US territories, and where prohibited.",
      noPurchaseStatement:
        "No purchase necessary. A purchase will not increase your chances of winning. Eligibility restrictions apply. See Official Rules.",
      oddsStatement: `Stated odds of ${formatOdds(oddsDenominator)} are based on the expected number of eligible entries; actual odds depend on the total entries received.`,
      effectiveAt: Date.now(),
    });

    await writeAudit(ctx, {
      actorType: "system",
      action: "campaign.seed",
      entityType: "campaigns",
      entityId: campaignId,
      after: { slug: "seed-100-gift-card", oddsDenominator },
    });

    return campaignId;
  },
});
