import { query } from "./_generated/server";
import { resolveTier } from "./lib/tiers.ts";

/**
 * The one public read the campaign surface needs. It deliberately assembles a
 * narrow shape rather than returning raw documents, so the sealed target — which
 * lives in its own table — has no path to a client.
 */
export const getActiveCampaign = query({
  args: {},
  handler: async (ctx) => {
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .first();

    // A campaign with a potential winner under review is still readable: a
    // promotion that vanishes mid-flight looks exactly like a scam.
    const pending =
      campaign ??
      (await ctx.db
        .query("campaigns")
        .withIndex("by_status", (q) => q.eq("status", "winner_pending"))
        .first());

    if (pending === null) return null;

    const [sponsor, prize, rules] = await Promise.all([
      ctx.db.get(pending.sponsorId),
      ctx.db.get(pending.prizeId),
      ctx.db
        .query("campaignRules")
        .withIndex("by_campaign_version", (q) =>
          q.eq("campaignId", pending._id).eq("version", pending.activeRulesVersion),
        )
        .unique(),
    ]);
    if (sponsor === null || prize === null || rules === null) return null;

    return {
      // Picked field by field, never spread. This query deliberately also serves
      // winner_pending campaigns — the one state where potentialWinnerUserId and
      // winningSpinId are populated — so returning the raw document would hand a
      // potential winner's internal user id to every visitor. revealedTarget and
      // revealedNonce are withheld for the same reason: they are the sealed
      // target, and publishing them is a deliberate end-of-campaign act, not a
      // side effect of rendering the home page.
      campaign: {
        _id: pending._id,
        slug: pending.slug,
        title: pending.title,
        description: pending.description,
        status: pending.status,
        startAt: pending.startAt,
        endAt: pending.endAt,
        dailySpins: pending.dailySpins,
        resetTimezone: pending.resetTimezone,
        resetHour: pending.resetHour,
        reelColumns: pending.reelColumns,
        projectedVolume: pending.projectedVolume,
        oddsDenominator: pending.oddsDenominator,
        commitmentHash: pending.commitmentHash,
        eligibleCountries: pending.eligibleCountries,
        eligibleRegions: pending.eligibleRegions,
        minimumAge: pending.minimumAge,
        requireEmailVerification: pending.requireEmailVerification,
        activeRulesVersion: pending.activeRulesVersion,
        disqualificationPolicy: pending.disqualificationPolicy,
        activatedAt: pending.activatedAt,
      },
      sponsor,
      prize,
      rules,
      tier: resolveTier(prize.estimatedRetailValue),
      oddsDenominator: pending.oddsDenominator,
    };
  },
});
