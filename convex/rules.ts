import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./users.ts";

export const acceptRules = mutation({
  // ipHash is client-reported and unverified — see the note on `spins.ipHash` in
  // schema.ts. It records what the browser claimed, not where acceptance came from.
  //
  // region and birthDate are the same self-certification the rules checkbox always
  // asked for, just with the actual values now attached: "one checkbox, three
  // facts" becomes "one submission, three facts." Optional so this mutation still
  // works for a caller that only wants to record acceptance (e.g. tests exercising
  // other eligibility branches); the product's own UI always sends both.
  args: {
    ipHash: v.optional(v.string()),
    region: v.optional(v.string()),
    birthDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .first();
    if (campaign === null) throw new Error("CAMPAIGN_NOT_LIVE");

    if (args.region !== undefined || args.birthDate !== undefined) {
      // Country is hardcoded: every eligible jurisdiction is a US one today, so
      // there is nothing for the entrant to pick.
      await ctx.db.patch(user._id, {
        ...(args.region !== undefined ? { region: args.region, country: "US" } : {}),
        ...(args.birthDate !== undefined ? { birthDate: args.birthDate } : {}),
      });
    }

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
