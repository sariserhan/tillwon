import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin.ts";
import { writeAudit } from "./lib/audit.ts";
import { commitmentFor } from "./winnerEngine.ts";
import { documentType } from "./claims.ts";

export const listPendingClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // ponytail: claims has no by_status index (schema is owned by an earlier,
    // already-merged task) so this scans the whole table; the admin review
    // queue is small in practice. Add a by_status index and .withIndex if it
    // ever grows enough to matter.
    const allClaims = await ctx.db.query("claims").collect();
    const claims = allClaims.filter((claim) => claim.status === "under_review");

    return await Promise.all(
      claims.map(async (claim) => {
        const [user, campaign] = await Promise.all([
          ctx.db.get(claim.userId),
          ctx.db.get(claim.campaignId),
        ]);
        const prize = campaign ? await ctx.db.get(campaign.prizeId) : null;
        return {
          claim,
          region: user?.region ?? null,
          birthDate: user?.birthDate ?? null,
          prizeTitle: prize?.title ?? null,
        };
      }),
    );
  },
});

export const getClaimDetail = query({
  args: { claimId: v.id("claims") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (claim === null) throw new Error("CLAIM_NOT_FOUND");
    const [user, documentRows] = await Promise.all([
      ctx.db.get(claim.userId),
      ctx.db
        .query("claimDocuments")
        .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
        .collect(),
    ]);
    return {
      claim,
      region: user?.region ?? null,
      birthDate: user?.birthDate ?? null,
      // No `url` here on purpose: `storage.getUrl()` is an unauthenticated,
      // non-expiring bearer link once obtained (Convex's own docs are
      // explicit about this) — a government ID has no business behind one.
      // The admin UI fetches each document through the authenticated
      // /documents HTTP action in convex/http.ts instead.
      documents: documentRows.map((doc) => ({ type: doc.type })),
    };
  },
});

/**
 * The one piece of privileged data the /documents HTTP action (convex/http.ts)
 * needs: which storage object backs a given claim's document, and its content
 * type — gated by the same requireAdmin check every other admin function
 * uses. Internal because nothing outside that HTTP action should ever call
 * it directly; a bare storageId is not itself fetchable by a client, but
 * there's no reason to expose it as a public query either.
 */
export const getDocumentForServing = internalQuery({
  args: { claimId: v.id("claims"), type: documentType },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const doc = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim_type", (q) => q.eq("claimId", args.claimId).eq("type", args.type))
      .unique();
    if (doc === null) throw new Error("DOCUMENT_NOT_FOUND");
    const metadata = await ctx.db.system.get(doc.storageId);
    return { storageId: doc.storageId, contentType: metadata?.contentType ?? null };
  },
});

export const approveClaim = mutation({
  args: { claimId: v.id("claims") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (claim === null) throw new Error("CLAIM_NOT_FOUND");
    if (claim.status !== "under_review") throw new Error("CLAIM_NOT_UNDER_REVIEW");

    const campaign = await ctx.db.get(claim.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "winner_pending") throw new Error("CAMPAIGN_NOT_WINNER_PENDING");

    const secret = await ctx.db
      .query("campaignSecrets")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .unique();
    if (secret === null) throw new Error("CAMPAIGN_NOT_ACTIVATED");

    // The whole point of a commitment scheme is that it is checked, not assumed.
    // A mismatch here means something is wrong with data nobody should be able to
    // change after sealing — publish nothing rather than trust it anyway.
    const recomputed = await commitmentFor(secret.winningShard, secret.winningCount, secret.nonce);
    if (recomputed !== campaign.commitmentHash) throw new Error("COMMITMENT_MISMATCH");

    const documents = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
      .collect();
    const photo = documents.find((d) => d.type === "winner_photo");
    if (photo === undefined) throw new Error("MISSING_WINNER_PHOTO");

    const [user, prize] = await Promise.all([
      ctx.db.get(claim.userId),
      ctx.db.get(campaign.prizeId),
    ]);
    if (user === null || prize === null) throw new Error("CLAIM_DATA_INCOMPLETE");
    // submitClaimDocuments always sets these before a claim can reach
    // under_review, so this should be unreachable in practice — but every
    // other precondition here throws rather than silently degrading, and a
    // blank public archive row is exactly the kind of permanent, public
    // mistake that deserves the same treatment rather than a `?? ""` fallback.
    if (!claim.legalName || !claim.publicDisplayName || !user.region) {
      throw new Error("CLAIM_DATA_INCOMPLETE");
    }

    const now = Date.now();
    const revealedTarget = `${secret.winningShard}:${secret.winningCount}`;

    await ctx.db.patch(claim._id, { status: "approved" });
    await ctx.db.patch(campaign._id, {
      status: "completed",
      completedAt: now,
      revealedTarget,
      revealedNonce: secret.nonce,
    });
    await ctx.db.insert("winnerArchive", {
      campaignId: campaign._id,
      claimId: claim._id,
      legalName: claim.legalName,
      publicDisplayName: claim.publicDisplayName,
      photoStorageId: photo.storageId,
      region: user.region,
      prizeTitle: prize.title,
      awardedAt: now,
      revealedTarget,
      revealedNonce: secret.nonce,
      commitmentHash: campaign.commitmentHash,
    });
    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "claim.approved",
      entityType: "claims",
      entityId: claim._id,
      before: { status: "under_review" },
      after: { status: "approved" },
    });
    // The campaign's own transition — completed, with its sealed commitment
    // now unsealed — is the most consequential state change in this feature
    // and needs its own campaign-scoped record, mirroring sealTarget's
    // campaign.seal_target entry in winnerEngine.ts.
    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.completed",
      entityType: "campaigns",
      entityId: campaign._id,
      before: { status: "winner_pending" },
      after: { status: "completed", commitmentHash: campaign.commitmentHash, revealedTarget },
    });
    return null;
  },
});

export const rejectClaim = mutation({
  args: { claimId: v.id("claims"), reason: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (claim === null) throw new Error("CLAIM_NOT_FOUND");
    if (claim.status !== "under_review") throw new Error("CLAIM_NOT_UNDER_REVIEW");

    await ctx.db.patch(claim._id, { status: "disqualified" });
    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "claim.rejected",
      entityType: "claims",
      entityId: claim._id,
      before: { status: "under_review" },
      after: { status: "disqualified" },
      metadata: { reason: args.reason },
    });
    return null;
  },
});

export const purgeClaimDocuments = mutation({
  args: { claimId: v.id("claims") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const claim = await ctx.db.get(args.claimId);
    if (claim === null) throw new Error("CLAIM_NOT_FOUND");
    // Purge is post-decision cleanup, not pre-decision: purging before
    // approve/reject would delete evidence a later legitimate approveClaim
    // still needs (it would then fail with MISSING_WINNER_PHOTO after the
    // documents are already gone).
    if (claim.status !== "approved" && claim.status !== "disqualified") {
      throw new Error("CLAIM_NOT_RESOLVED");
    }

    const archive =
      claim.status === "approved"
        ? await ctx.db
            .query("winnerArchive")
            .withIndex("by_campaign", (q) => q.eq("campaignId", claim.campaignId))
            .unique()
        : null;

    const documents = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim", (q) => q.eq("claimId", claim._id))
      .collect();

    const purgedTypes: string[] = [];
    let retainedStorageFor: string | null = null;
    for (const doc of documents) {
      // The winner photo's storage object is kept if winnerArchive references
      // it independently — the archive copy is intentionally permanent and
      // public; deleting the underlying file would break it. The claimDocuments
      // row itself is not archived anywhere, so it's always purged.
      const keepStorage = archive !== null && doc.storageId === archive.photoStorageId;
      if (keepStorage) {
        retainedStorageFor = doc.type;
      } else {
        await ctx.storage.delete(doc.storageId);
      }
      await ctx.db.delete(doc._id);
      purgedTypes.push(doc.type);
    }

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "claim.documents_purged",
      entityType: "claims",
      entityId: claim._id,
      metadata: { purgedTypes, retainedStorageFor },
    });
    return null;
  },
});
