import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./users.ts";
import { assertEligible } from "./eligibility.ts";
import { resetDateKey } from "./lib/resetDate.ts";
import { drawLosingReels, drawWinningReels } from "./lib/reels.ts";
import { writeAudit } from "./lib/audit.ts";
import { ENGINE_VERSION } from "./winnerEngine.ts";

function claimReference(seed: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  let n = seed;
  for (let i = 0; i < 6; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length) + 7;
  }
  return `CLAIM-${out}`;
}

/**
 * The whole spin, in one serializable transaction.
 *
 * Two parallel requests both try to patch the same balance row; one commits and
 * the other re-executes from the top, where it either replays via the idempotency
 * key or fails with NO_SPINS_REMAINING. Neither path can double-spend, and the
 * winning shard count is reached exactly once across all committed transactions,
 * so a duplicate winner is impossible rather than unlikely.
 */
export const spinExecute = mutation({
  args: {
    idempotencyKey: v.string(),
    deviceHash: v.string(),
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Before any validation: a retried request must return the original answer
    // even if the user has since run out of spins or become ineligible.
    const replay = await ctx.db
      .query("spins")
      .withIndex("by_user_idempotency", (q) =>
        q.eq("userId", user._id).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (replay !== null) {
      const campaign = await ctx.db.get(replay.campaignId);
      // Scoped to this exact spin, not just the campaign: disqualificationPolicy
      // already allows "select_alternate", which will eventually produce a second
      // claim on the same campaign after a disqualification. Matching on
      // campaignId alone would then let a replayed idempotency key hand back
      // another user's claimReference.
      const claim = replay.isPotentialWinner
        ? await ctx.db
            .query("claims")
            .withIndex("by_spin", (q) => q.eq("spinId", replay._id))
            .unique()
        : null;
      const balance = await ctx.db
        .query("spinBalances")
        .withIndex("by_user_campaign_date", (q) =>
          q
            .eq("userId", user._id)
            .eq("campaignId", replay.campaignId)
            .eq(
              "resetDate",
              resetDateKey(Date.now(), campaign!.resetTimezone, campaign!.resetHour),
            ),
        )
        .unique();
      return {
        spinId: replay._id,
        campaignId: replay.campaignId,
        symbols: replay.symbols,
        isPotentialWinner: replay.isPotentialWinner,
        remainingSpins: (balance?.allocated ?? 0) - (balance?.used ?? 0),
        campaignStatus: campaign!.status,
        claimReference: claim?.claimReference,
      };
    }

    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .first();
    if (campaign === null) throw new Error("CAMPAIGN_NOT_LIVE");

    await assertEligible(ctx, user, campaign);

    const resetDate = resetDateKey(
      Date.now(),
      campaign.resetTimezone,
      campaign.resetHour,
    );
    let balance = await ctx.db
      .query("spinBalances")
      .withIndex("by_user_campaign_date", (q) =>
        q
          .eq("userId", user._id)
          .eq("campaignId", campaign._id)
          .eq("resetDate", resetDate),
      )
      .unique();

    if (balance === null) {
      const id = await ctx.db.insert("spinBalances", {
        userId: user._id,
        campaignId: campaign._id,
        resetDate,
        allocated: campaign.dailySpins,
        used: 0,
      });
      balance = (await ctx.db.get(id))!;
    }

    if (balance.used >= balance.allocated) throw new Error("NO_SPINS_REMAINING");

    // Balance first, so a conflict retry cannot consume a shard sequence without
    // consuming a spin and drift the entry count away from the spins behind it.
    await ctx.db.patch(balance._id, { used: balance.used + 1 });
    const remainingSpins = balance.allocated - (balance.used + 1);

    const shard = Math.floor(Math.random() * campaign.shardCount);
    const shardRow = await ctx.db
      .query("spinShards")
      .withIndex("by_campaign_shard", (q) =>
        q.eq("campaignId", campaign._id).eq("shard", shard),
      )
      .unique();
    if (shardRow === null) throw new Error("CAMPAIGN_NOT_ACTIVATED");
    const shardSequence = shardRow.count + 1;
    await ctx.db.patch(shardRow._id, { count: shardSequence });

    const secret = await ctx.db
      .query("campaignSecrets")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .unique();
    if (secret === null) throw new Error("CAMPAIGN_NOT_ACTIVATED");

    // No cryptographic randomness here: the win is an integer comparison. The
    // function that decides who wins a prize contains no RNG.
    const isPotentialWinner =
      shard === secret.winningShard && shardSequence === secret.winningCount;

    const symbols = isPotentialWinner
      ? drawWinningReels(campaign.reelColumns)
      : drawLosingReels(campaign.reelColumns);

    const spinId = await ctx.db.insert("spins", {
      userId: user._id,
      campaignId: campaign._id,
      idempotencyKey: args.idempotencyKey,
      shard,
      shardSequence,
      symbols,
      isPotentialWinner,
      isValid: true,
      riskScore: user.fraudRiskScore,
      riskFlags: [],
      ipHash: args.ipHash ?? "",
      deviceHash: args.deviceHash,
      engineVersion: ENGINE_VERSION,
      rulesVersion: campaign.activeRulesVersion,
    });

    await ctx.db.patch(user._id, { totalSpins: user.totalSpins + 1 });

    let reference: string | undefined;
    if (isPotentialWinner) {
      reference = claimReference(shardSequence * 31 + shard);
      await ctx.db.patch(campaign._id, {
        status: "winner_pending",
        winningSpinId: spinId,
        potentialWinnerUserId: user._id,
      });
      await ctx.db.insert("claims", {
        campaignId: campaign._id,
        spinId,
        userId: user._id,
        claimReference: reference,
        status: "potential_winner",
        // 14 days to start a claim. The exact window belongs in the Official
        // Rules; this is the value the seeded rules state.
        claimDeadline: Date.now() + 14 * 24 * 3_600_000,
      });
      await ctx.db.patch(user._id, {
        totalPotentialWins: user.totalPotentialWins + 1,
      });
      await writeAudit(ctx, {
        actorType: "system",
        action: "campaign.winner_pending",
        entityType: "campaigns",
        entityId: campaign._id,
        before: { status: "live" },
        after: { status: "winner_pending", winningSpinId: spinId },
        metadata: { shard, shardSequence },
      });
    }

    return {
      spinId,
      campaignId: campaign._id,
      symbols,
      isPotentialWinner,
      remainingSpins,
      campaignStatus: isPotentialWinner ? "winner_pending" : "live",
      claimReference: reference,
    };
  },
});
