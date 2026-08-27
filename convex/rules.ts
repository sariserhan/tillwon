import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./users.ts";

export const acceptRules = mutation({
  // ipHash is client-reported and unverified — see the note on `spins.ipHash` in
  // schema.ts. It records what the browser claimed, not where acceptance came from.
  args: { ipHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .first();
    if (campaign === null) throw new Error("CAMPAIGN_NOT_LIVE");

    // Append-only: an old row is the evidence of what this user actually agreed
    // to, so a new version never overwrites it.
    await ctx.db.insert("rulesAcceptances", {
      userId: user._id,
      campaignId: campaign._id,
      rulesVersion: campaign.activeRulesVersion,
      acceptedAt: Date.now(),
      ipHash: args.ipHash ?? "",
    });
    return null;
  },
});
