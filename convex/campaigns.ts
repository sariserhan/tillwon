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
      campaign: pending,
      sponsor,
      prize,
      rules,
      tier: resolveTier(prize.estimatedRetailValue),
      oddsDenominator: pending.oddsDenominator,
    };
  },
});
