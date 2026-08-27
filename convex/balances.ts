import { query } from "./_generated/server";
import { requireUser } from "./users.ts";
import { resetDateKey } from "./lib/resetDate.ts";

export const getDailySpinBalance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .first();
    if (campaign === null) return null;

    const resetDate = resetDateKey(
      Date.now(),
      campaign.resetTimezone,
      campaign.resetHour,
    );
    const row = await ctx.db
      .query("spinBalances")
      .withIndex("by_user_campaign_date", (q) =>
        q
          .eq("userId", user._id)
          .eq("campaignId", campaign._id)
          .eq("resetDate", resetDate),
      )
      .unique();

    // `remaining` is derived, never stored. Two fields that must agree are two
    // fields that will eventually disagree.
    const allocated = row?.allocated ?? campaign.dailySpins;
    const used = row?.used ?? 0;
    return { allocated, used, remaining: allocated - used, resetDate };
  },
});
