import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { writeAudit } from "./lib/audit.ts";

export const ENGINE_VERSION = "sealed-shard-1";

/**
 * SHA-256 over the sealed target and its nonce. Published before the first spin
 * and reproducible from the revealed values afterwards, so anyone can confirm the
 * target was fixed in advance. A pure function, so tests can verify the
 * commitment without touching the database.
 */
export async function commitmentFor(
  winningShard: number,
  winningCount: number,
  nonce: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(`${winningShard}:${winningCount}:${nonce}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const sealTarget = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    winningShard: v.number(),
    winningCount: v.number(),
    nonce: v.string(),
    commitmentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");

    // The shard rows below are created from campaign.shardCount, and spinExecute
    // only ever assigns shards in [0, campaign.shardCount). A target outside that
    // range is a campaign nothing can ever win, which would look identical to bad
    // luck for its whole life — so it fails loudly here instead.
    if (
      !Number.isInteger(args.winningShard) ||
      args.winningShard < 0 ||
      args.winningShard >= campaign.shardCount
    ) {
      throw new Error("WINNING_SHARD_OUT_OF_RANGE");
    }
    // shardSequence starts at 1, so a target of 0 or below is equally unreachable.
    if (!Number.isInteger(args.winningCount) || args.winningCount < 1) {
      throw new Error("WINNING_COUNT_OUT_OF_RANGE");
    }

    // Sealing twice would let a second target replace the committed one, which is
    // exactly the tampering the commitment exists to prevent.
    const existing = await ctx.db
      .query("campaignSecrets")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .unique();
    if (existing !== null) throw new Error("TARGET_ALREADY_SEALED");

    // Only one campaign may ever be live or winner_pending at a time. This is the
    // authoritative, transactional check — not a pre-check some caller runs before
    // reaching here — so two concurrent activation attempts can't both succeed:
    // whichever commits first wins, and the loser re-reads state that now includes
    // the winner's write and fails this check. Excluding args.campaignId itself
    // matters: in the existing seed-then-activate CLI flow, the campaign being
    // sealed is already status "live" (set by seedCampaign) at the moment this
    // runs, so an unqualified check would make that flow fail against itself.
    const liveCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .collect();
    const pendingCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "winner_pending"))
      .collect();
    const anotherActive = [...liveCampaigns, ...pendingCampaigns].some(
      (c) => c._id !== args.campaignId,
    );
    if (anotherActive) throw new Error("ANOTHER_CAMPAIGN_ACTIVE");

    await ctx.db.insert("campaignSecrets", {
      campaignId: args.campaignId,
      winningShard: args.winningShard,
      winningCount: args.winningCount,
      nonce: args.nonce,
    });

    for (let shard = 0; shard < campaign.shardCount; shard++) {
      await ctx.db.insert("spinShards", {
        campaignId: args.campaignId,
        shard,
        count: 0,
      });
    }

    // Sealed, therefore exclusively playable — both belong in the one transaction
    // that actually enforces them, not split across a pre-check and a separate
    // write. Backward-compatible with the existing CLI flow: seedCampaign already
    // sets status "live" before this runs, so re-patching it to "live" is a no-op.
    await ctx.db.patch(args.campaignId, {
      commitmentHash: args.commitmentHash,
      status: "live",
    });

    // The hash is logged; the target is not. The trail must prove a target existed
    // without disclosing it.
    await writeAudit(ctx, {
      actorType: "system",
      action: "campaign.seal_target",
      entityType: "campaigns",
      entityId: args.campaignId,
      after: { commitmentHash: args.commitmentHash, shardCount: campaign.shardCount },
    });

    return args.commitmentHash;
  },
});

/** The activation parameters, read from the campaign rather than from a caller. */
export const activationParameters = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    return {
      shardCount: campaign.shardCount,
      projectedVolume: campaign.projectedVolume,
    };
  },
});

/**
 * Draws the sealed target. An action, because randomness belongs outside a
 * transaction that may be retried — and this is the only place the product needs
 * cryptographic randomness at all, since a predetermined-entry engine does no RNG
 * per spin.
 *
 * Internal, and it takes no odds parameters. A caller-supplied shardCount would
 * let anyone seal a campaign at odds of their choosing (`shardCount: 1` makes the
 * next spin win) or seal a target outside the range spinExecute assigns, making
 * the campaign unwinnable. Both come from the campaign document instead.
 * The admin-facing entry point is campaignAdmin.activate, which requireAdmin-gates
 * the caller before reaching here — this function itself stays internal-only and
 * trusts its caller completely, the same way every other internalAction/internalMutation
 * in this codebase does.
 */
export const activateCampaign = internalAction({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args): Promise<string> => {
    const params: { shardCount: number; projectedVolume: number } = await ctx.runQuery(
      internal.winnerEngine.activationParameters,
      { campaignId: args.campaignId },
    );
    const { shardCount, projectedVolume } = params;

    // Each value comes from its own CSPRNG draw: winningShard and winningCount
    // are drawn independently to avoid correlation, and the nonce gets its own
    // 256-bit buffer specifically. shardCount and winningCount both have very
    // little natural entropy (shardCount is small, winningCount is bounded by
    // perShard), so the nonce alone must be unguessable — a shared 32-bit slice
    // of one small buffer would leave the published commitment hash brute-forceable.
    const shardBuf = new Uint32Array(1);
    crypto.getRandomValues(shardBuf);
    const winningShard = shardBuf[0] % shardCount;

    const countBuf = new Uint32Array(1);
    crypto.getRandomValues(countBuf);
    const perShard = Math.max(1, Math.floor(projectedVolume / shardCount));
    const winningCount = (countBuf[0] % perShard) + 1;

    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = [...nonceBytes].map((b) => b.toString(16).padStart(2, "0")).join("");

    const commitmentHash = await commitmentFor(winningShard, winningCount, nonce);

    return await ctx.runMutation(internal.winnerEngine.sealTarget, {
      campaignId: args.campaignId,
      winningShard,
      winningCount,
      nonce,
      commitmentHash,
    });
  },
});
