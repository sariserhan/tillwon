import { action, internalMutation } from "./_generated/server";
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

    // Sealing twice would let a second target replace the committed one, which is
    // exactly the tampering the commitment exists to prevent.
    const existing = await ctx.db
      .query("campaignSecrets")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .unique();
    if (existing !== null) throw new Error("TARGET_ALREADY_SEALED");

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

    await ctx.db.patch(args.campaignId, { commitmentHash: args.commitmentHash });

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

/**
 * Draws the sealed target. An action, because randomness belongs outside a
 * transaction that may be retried — and this is the only place the product needs
 * cryptographic randomness at all, since a predetermined-entry engine does no RNG
 * per spin.
 */
export const activateCampaign = action({
  args: {
    campaignId: v.id("campaigns"),
    shardCount: v.number(),
    projectedVolume: v.number(),
  },
  handler: async (ctx, args) => {
    // Each value comes from its own CSPRNG draw: winningShard and winningCount
    // are drawn independently to avoid correlation, and the nonce gets its own
    // 256-bit buffer specifically. shardCount and winningCount both have very
    // little natural entropy (shardCount is small, winningCount is bounded by
    // perShard), so the nonce alone must be unguessable — a shared 32-bit slice
    // of one small buffer would leave the published commitment hash brute-forceable.
    const shardBuf = new Uint32Array(1);
    crypto.getRandomValues(shardBuf);
    const winningShard = shardBuf[0] % args.shardCount;

    const countBuf = new Uint32Array(1);
    crypto.getRandomValues(countBuf);
    const perShard = Math.max(1, Math.floor(args.projectedVolume / args.shardCount));
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
