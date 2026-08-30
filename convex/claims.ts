import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./users.ts";
import { writeAudit } from "./lib/audit.ts";
import { sniffFileType } from "./lib/fileSniff.ts";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LENGTH = 120;
const ID_AND_ADDRESS_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);

export const documentType = v.union(
  v.literal("photo_id"),
  v.literal("proof_of_address"),
  v.literal("winner_photo"),
);

/**
 * The one lookup every claimant-side function starts with. The reference
 * identifies *which* claim; owning it (being signed in as the user it
 * belongs to) is what authorizes seeing or changing it. Neither alone is
 * enough — a reference was never meant to be a credential.
 */
async function requireOwnedClaim(
  ctx: MutationCtx | QueryCtx,
  reference: string,
): Promise<{ user: Doc<"users">; claim: Doc<"claims"> } | null> {
  const user = await requireUser(ctx);
  // claimReference is a deterministic function of the sealed target
  // (spins.ts), not a uniqueness-guaranteed identifier: two campaigns can
  // produce the identical string. `.unique()` would throw on that collision
  // and hard-lock out both legitimate winners, so collect and pick the
  // caller's own row instead. Zero matches, or matches that all belong to
  // someone else, both fall through to null — "no such reference" and
  // "someone else's reference" must stay indistinguishable to the caller.
  const candidates = await ctx.db
    .query("claims")
    .withIndex("by_reference", (q) => q.eq("claimReference", reference))
    .collect();
  const claim = candidates.find((c) => c.userId === user._id);
  if (claim === undefined) return null;
  return { user, claim };
}

export const getMyClaim = query({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const owned = await requireOwnedClaim(ctx, args.reference);
    if (owned === null) return null;
    const documents = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim", (q) => q.eq("claimId", owned.claim._id))
      .collect();
    // The client only ever reads `.type` (to know which slots are filled);
    // the raw storage id is dead payload the spec's document-access-control
    // section says a query like this shouldn't hand out in the first place.
    return { claim: owned.claim, documents: documents.map((d) => ({ type: d.type })) };
  },
});

export const generateDocumentUploadUrl = mutation({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const owned = await requireOwnedClaim(ctx, args.reference);
    if (owned === null) throw new Error("CLAIM_NOT_FOUND");
    if (owned.claim.status !== "potential_winner") throw new Error("CLAIM_NOT_SUBMITTABLE");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * A cheap, read-only ownership+status gate `registerUploadedDocument`'s
 * action runs before it ever reads storage bytes — actions have no `ctx.db`,
 * so this is the only way to short-circuit an unauthorized or out-of-state
 * call before doing the (bounded but non-trivial) work of fetching and
 * sniffing a file. `finalizeDocumentRegistration` re-checks both
 * authoritatively inside its own transaction; this is an optimization, not
 * the security boundary.
 */
export const checkClaimSubmittable = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const owned = await requireOwnedClaim(ctx, args.reference);
    if (owned === null) throw new Error("CLAIM_NOT_FOUND");
    if (owned.claim.status !== "potential_winner") throw new Error("CLAIM_NOT_SUBMITTABLE");
    return null;
  },
});

/**
 * The actual write, run only after `registerUploadedDocument` (below) has
 * sniffed the file's real bytes — everything ctx.db-shaped from the old
 * single mutation lives here, re-checking ownership/status itself rather
 * than trusting the action's earlier, non-transactional pre-check.
 */
export const finalizeDocumentRegistration = internalMutation({
  args: {
    reference: v.string(),
    type: documentType,
    storageId: v.id("_storage"),
    sniffedType: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const owned = await requireOwnedClaim(ctx, args.reference);
    if (owned === null) throw new Error("CLAIM_NOT_FOUND");
    if (owned.claim.status !== "potential_winner") throw new Error("CLAIM_NOT_SUBMITTABLE");

    // A storageId is a client-supplied argument, decoupled from `reference` —
    // nothing about owning this claim proves the caller is the one who
    // uploaded a *particular* storage object. If it's already attached to
    // someone else's claim, refuse rather than let this claim adopt (and,
    // via the replace-on-reupload path below, eventually delete) it.
    const alreadyRegistered = await ctx.db
      .query("claimDocuments")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (alreadyRegistered !== null && alreadyRegistered.claimId !== owned.claim._id) {
      throw new Error("STORAGE_ALREADY_REGISTERED");
    }

    // Identified from the file's own bytes (see registerUploadedDocument),
    // not the client-declared upload Content-Type header — the whole point
    // of this check is that the caller's own assertion proves nothing.
    const allowed = args.type === "winner_photo" ? PHOTO_TYPES : ID_AND_ADDRESS_TYPES;
    if (args.sniffedType === null || !allowed.has(args.sniffedType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("UNSUPPORTED_FILE_TYPE");
    }

    const metadata = await ctx.db.system.get(args.storageId);
    if (metadata === null) throw new Error("UPLOAD_NOT_FOUND");
    if (metadata.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("FILE_TOO_LARGE");
    }

    const existing = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim_type", (q) => q.eq("claimId", owned.claim._id).eq("type", args.type))
      .unique();
    if (existing !== null) {
      await ctx.storage.delete(existing.storageId);
      await ctx.db.delete(existing._id);
    }

    await ctx.db.insert("claimDocuments", {
      claimId: owned.claim._id,
      userId: owned.user._id,
      type: args.type,
      storageId: args.storageId,
      uploadedAt: Date.now(),
      // The sniffed (byte-verified) type, not the client-declared upload
      // header — this is what /documents (convex/http.ts) serves the file
      // back as, so a mismatched, attacker-chosen Content-Type never
      // reaches the response.
      sniffedType: args.sniffedType,
    });
    await writeAudit(ctx, {
      actorType: "user",
      actorId: owned.user._id,
      action: "claim.document_registered",
      entityType: "claims",
      entityId: owned.claim._id,
      metadata: { type: args.type },
    });
    return null;
  },
});

/**
 * An action, not a mutation, because verifying a file's real type means
 * reading its actual bytes (`ctx.storage.get`) — only available where
 * `ctx.db` isn't, so the ownership/status gate and the actual write both
 * live in internal functions this delegates to.
 */
export const registerUploadedDocument = action({
  args: { reference: v.string(), type: documentType, storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(internal.claims.checkClaimSubmittable, { reference: args.reference });

    const blob = await ctx.storage.get(args.storageId);
    if (blob === null) throw new Error("UPLOAD_NOT_FOUND");
    const sniffedType = sniffFileType(new Uint8Array(await blob.arrayBuffer()));

    await ctx.runMutation(internal.claims.finalizeDocumentRegistration, {
      reference: args.reference,
      type: args.type,
      storageId: args.storageId,
      sniffedType,
    });
    return null;
  },
});

export const submitClaimDocuments = mutation({
  args: {
    reference: v.string(),
    legalName: v.string(),
    publicDisplayName: v.optional(v.string()),
    affidavitAccepted: v.boolean(),
    publicityReleaseAccepted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owned = await requireOwnedClaim(ctx, args.reference);
    if (owned === null) throw new Error("CLAIM_NOT_FOUND");
    if (owned.claim.status !== "potential_winner") throw new Error("CLAIM_NOT_SUBMITTABLE");
    // The Official Rules promise a 14-day window to begin a claim; nothing
    // previously enforced it, so a claim could be submitted and approved
    // arbitrarily long after the deadline it commits to.
    if (owned.claim.claimDeadline < Date.now()) throw new Error("CLAIM_DEADLINE_PASSED");

    const documents = await ctx.db
      .query("claimDocuments")
      .withIndex("by_claim", (q) => q.eq("claimId", owned.claim._id))
      .collect();
    const types = new Set(documents.map((d) => d.type));
    if (!types.has("photo_id") || !types.has("proof_of_address") || !types.has("winner_photo")) {
      throw new Error("MISSING_DOCUMENTS");
    }
    if (!args.affidavitAccepted || !args.publicityReleaseAccepted) {
      throw new Error("CONSENT_REQUIRED");
    }

    const legalName = args.legalName.trim();
    if (legalName.length === 0) throw new Error("LEGAL_NAME_REQUIRED");
    if (legalName.length > MAX_NAME_LENGTH) throw new Error("LEGAL_NAME_TOO_LONG");
    const publicDisplayNameTrimmed = args.publicDisplayName?.trim();
    const publicDisplayName =
      publicDisplayNameTrimmed !== undefined && publicDisplayNameTrimmed.length > 0
        ? publicDisplayNameTrimmed
        : legalName;
    if (publicDisplayName.length > MAX_NAME_LENGTH) throw new Error("PUBLIC_DISPLAY_NAME_TOO_LONG");

    const now = Date.now();
    await ctx.db.patch(owned.claim._id, {
      legalName,
      publicDisplayName,
      eligibilityAffidavitAcceptedAt: now,
      publicityReleaseAcceptedAt: now,
      status: "under_review",
    });
    await writeAudit(ctx, {
      actorType: "user",
      actorId: owned.user._id,
      action: "claim.submitted",
      entityType: "claims",
      entityId: owned.claim._id,
      before: { status: "potential_winner" },
      after: { status: "under_review" },
    });
    return null;
  },
});
