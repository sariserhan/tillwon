/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";
import { convexTest, TestConvex } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { commitmentFor } from "./winnerEngine";

const modules = import.meta.glob("./**/*.*s");

// `ReturnType<typeof convexTest>` (used elsewhere in this repo's test files)
// resolves `convexTest`'s generic schema parameter to its bare constraint,
// not this project's actual schema, which silently widens every id/doc type
// threaded through a helper typed that way (e.g. `ctx.db.get()` on an id
// that crossed a `readyClaim(t: ReturnType<typeof convexTest>)` boundary
// returns a union of every table's document instead of the real one).
// Binding the exported `TestConvex` type to `typeof schema` keeps it concrete.
type Test = TestConvex<typeof schema>;

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The brief describes this as `generateUploadUrl()` + a raw `fetch(url, {...})`
 * POST reading `storageId` back from the JSON response. Under this repo's
 * `convex-test@0.0.56`, that doesn't work: `generateUploadUrl` only ever
 * returns a fake `https://some-deployment.convex.cloud/...` string with no
 * HTTP server behind it (the same gap `convex/claims.test.ts`'s own
 * `uploadFile` already documents and works around). `t.run` with
 * `ctx.storage.store` is the real "upload a real file, get a real storage id"
 * primitive this version exposes, so it's used here too — still calling
 * `generateDocumentUploadUrl` first so the ownership check it gates is
 * exercised the same as the brief intends.
 */
async function uploadFile(t: Test, as: ReturnType<Test["withIdentity"]>, reference: string) {
  await as.mutation(api.claims.generateDocumentUploadUrl, { reference });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([pngBytes as BlobPart], { type: "image/png" }));
    // `_storage` isn't part of the app's DataModel, so there's no type-safe
    // overload of `patch` for it — same double-cast `claims.test.ts`'s own
    // copy of this test-only backdoor would also need once `t` (below) is
    // typed against the real schema instead of the erased default.
    await ctx.db.patch(id as never, { contentType: "image/png" } as never);
    return id;
  });
  return storageId as string;
}

/**
 * A full pipeline up to under_review: seed a campaign, seal a real target,
 * force a claimant to win it, submit all three documents. Everything this
 * file tests happens after this point.
 */
async function readyClaim(t: Test) {
  await t.mutation(internal.seed.seedCampaign, {});
  const campaign = await t.run((ctx) => ctx.db.query("campaigns").first());
  const nonce = "deadbeef";
  const commitmentHash = await commitmentFor(0, 1, nonce);
  await t.mutation(internal.winnerEngine.sealTarget, {
    campaignId: campaign!._id,
    winningShard: 0,
    winningCount: 1,
    nonce,
    commitmentHash,
  });

  const as = t.withIdentity({
    subject: "clerk_ada",
    email: "ada@example.com",
    emailVerified: true,
  });
  const userId = await as.mutation(api.users.ensureUser, {});
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, { country: "US", region: "NY", birthDate: "1990-01-01" });
  });
  await as.mutation(api.rules.acceptRules, {});

  // spinExecute assigns a random shard out of the seed campaign's 16; the
  // sealed target above only wins on shard 0. Pin Math.random so this spin
  // actually lands there instead of failing this helper 15 times out of 16 —
  // the same fix convex/spins.test.ts already applies to its own concurrency
  // tests, for the same reason.
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  const spin = await as.mutation(api.spins.spinExecute, {
    idempotencyKey: "win-1",
    deviceHash: "test",
  });
  randomSpy.mockRestore();

  expect(spin.isPotentialWinner).toBe(true);
  const reference = spin.claimReference!;

  for (const type of ["photo_id", "proof_of_address", "winner_photo"] as const) {
    const storageId = await uploadFile(t, as, reference);
    await as.action(api.claims.registerUploadedDocument, { reference, type, storageId: storageId as never });
  }
  await as.mutation(api.claims.submitClaimDocuments, {
    reference,
    legalName: "Ada Lovelace",
    affidavitAccepted: true,
    publicityReleaseAccepted: true,
  });

  const claim = await t.run(async (ctx) => {
    return ctx.db
      .query("claims")
      .withIndex("by_reference", (q) => q.eq("claimReference", reference))
      .unique();
  });
  return { t, as, userId, campaignId: campaign!._id, claim: claim!, reference };
}

async function asAdmin(t: Test) {
  const as = t.withIdentity({ subject: "clerk_admin", email: "admin@example.com" });
  const userId = await as.mutation(api.users.ensureUser, {});
  await t.run((ctx) => ctx.db.patch(userId, { role: "admin" }));
  return as;
}

describe("admin claim review", () => {
  it("lists a submitted claim with its self-certified region and birthdate", async () => {
    const t = convexTest(schema, modules);
    const { claim } = await readyClaim(t);
    const admin = await asAdmin(t);
    const rows = await admin.query(api.admin.listPendingClaims, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      claim: { _id: claim._id, status: "under_review" },
      region: "NY",
      birthDate: "1990-01-01",
    });
  });

  it("returns document types (never a raw url) on getClaimDetail for an admin, refuses a non-admin", async () => {
    const t = convexTest(schema, modules);
    const { claim, as } = await readyClaim(t);
    const admin = await asAdmin(t);
    const detail = await admin.query(api.admin.getClaimDetail, { claimId: claim._id });
    expect(detail.documents).toHaveLength(3);
    for (const doc of detail.documents) {
      expect(typeof doc.type).toBe("string");
      expect(doc).not.toHaveProperty("url");
    }

    await expect(as.query(api.admin.getClaimDetail, { claimId: claim._id })).rejects.toThrow(
      "NOT_ADMIN",
    );
  });

  describe("getDocumentForServing", () => {
    it("returns the storage id and content type for an admin, refuses a non-admin", async () => {
      const t = convexTest(schema, modules);
      const { claim, as } = await readyClaim(t);
      const admin = await asAdmin(t);
      const doc = await t.run((ctx) =>
        ctx.db
          .query("claimDocuments")
          .withIndex("by_claim_type", (q) => q.eq("claimId", claim._id).eq("type", "winner_photo"))
          .unique(),
      );
      const result = await admin.query(internal.admin.getDocumentForServing, {
        claimId: claim._id,
        type: "winner_photo",
      });
      expect(result).toEqual({ storageId: doc!.storageId, contentType: "image/png" });

      await expect(
        as.query(internal.admin.getDocumentForServing, { claimId: claim._id, type: "winner_photo" }),
      ).rejects.toThrow("NOT_ADMIN");
    });

    it("serves the row's sniffed content type, never `_storage`'s own (client-declared) metadata, even when they disagree", async () => {
      // The vulnerability this guards: `_storage`'s own metadata.contentType
      // is the client's own declared upload header — a caller can lie
      // ("Content-Type: text/html") on a file that still sniffs as a real
      // PNG. If getDocumentForServing ever served that lie back, an admin
      // opening the "document" could get HTML/script content instead of an
      // image, from an origin that inherits the admin session (stored XSS).
      // finalizeDocumentRegistration only ever stores the sniffed type on
      // the claimDocuments row, so simulate `_storage` disagreeing after the
      // fact (as if the upload had declared something else) and confirm the
      // served type still comes from the row, not from `_storage`.
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);

      const doc = await t.run((ctx) =>
        ctx.db
          .query("claimDocuments")
          .withIndex("by_claim_type", (q) => q.eq("claimId", claim._id).eq("type", "winner_photo"))
          .unique(),
      );
      expect(doc!.sniffedType).toBe("image/png");
      await t.run((ctx) => ctx.db.patch(doc!.storageId as never, { contentType: "text/html" } as never));

      const result = await admin.query(internal.admin.getDocumentForServing, {
        claimId: claim._id,
        type: "winner_photo",
      });
      expect(result.contentType).toBe("image/png");
    });

    it("throws DOCUMENT_NOT_FOUND for a document type never uploaded", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "test" });
      await admin.mutation(api.admin.purgeClaimDocuments, { claimId: claim._id });
      await expect(
        admin.query(internal.admin.getDocumentForServing, { claimId: claim._id, type: "winner_photo" }),
      ).rejects.toThrow("DOCUMENT_NOT_FOUND");
    });
  });

  describe("approveClaim", () => {
    it("publishes to winnerArchive, reveals the target, and completes the campaign", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.approveClaim, { claimId: claim._id });

      const [updatedClaim, campaign, archive] = await t.run(async (ctx) => [
        await ctx.db.get(claim._id),
        await ctx.db.get(campaignId),
        await ctx.db.query("winnerArchive").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).unique(),
      ]);
      expect(updatedClaim!.status).toBe("approved");
      expect(campaign!.status).toBe("completed");
      expect(campaign!.revealedTarget).toBe("0:1");
      expect(campaign!.revealedNonce).toBe("deadbeef");
      expect(archive).toMatchObject({
        legalName: "Ada Lovelace",
        publicDisplayName: "Ada Lovelace",
        region: "NY",
        prizeTitle: "$100 gift card",
      });
    });

    it("writes a campaign-scoped audit entry for the completion and reveal, alongside the claim's own entry", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.approveClaim, { claimId: claim._id });

      const campaignAuditEntries = await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
          .collect(),
      );
      const completed = campaignAuditEntries.find((e) => e.action === "campaign.completed");
      expect(completed).toBeDefined();
      expect(completed!.after).toMatchObject({
        status: "completed",
        commitmentHash: expect.any(String),
        revealedTarget: "0:1",
      });

      const claimAuditEntries = await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", "claims").eq("entityId", claim._id))
          .collect(),
      );
      expect(claimAuditEntries.some((e) => e.action === "claim.approved")).toBe(true);
    });

    it("throws and publishes nothing if the commitment hash was tampered with", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      await t.run((ctx) => ctx.db.patch(campaignId, { commitmentHash: "tampered" }));
      const admin = await asAdmin(t);
      await expect(admin.mutation(api.admin.approveClaim, { claimId: claim._id })).rejects.toThrow(
        "COMMITMENT_MISMATCH",
      );
      const archive = await t.run((ctx) =>
        ctx.db.query("winnerArchive").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).unique(),
      );
      expect(archive).toBeNull();
    });

    it("refuses a second approval of an already-approved claim", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.approveClaim, { claimId: claim._id });
      await expect(admin.mutation(api.admin.approveClaim, { claimId: claim._id })).rejects.toThrow(
        "CLAIM_NOT_UNDER_REVIEW",
      );
      const archives = await t.run((ctx) => ctx.db.query("winnerArchive").collect());
      expect(archives).toHaveLength(1);
    });

    it("throws CLAIM_DATA_INCOMPLETE rather than publishing a blank field, if the claim or user is missing required data", async () => {
      // submitClaimDocuments always sets legalName/publicDisplayName, and a
      // user reaches under_review only after acceptRules sets a region — this
      // path should be unreachable through normal use. Forcing it directly
      // is the only way to exercise the guard that replaced a silent `?? ""`
      // fallback: every other precondition in this mutation throws instead of
      // degrading, and a blank public archive row deserves the same treatment.
      const t = convexTest(schema, modules);
      const { claim, userId } = await readyClaim(t);
      await t.run((ctx) => ctx.db.patch(userId, { region: undefined }));
      const admin = await asAdmin(t);
      await expect(admin.mutation(api.admin.approveClaim, { claimId: claim._id })).rejects.toThrow(
        "CLAIM_DATA_INCOMPLETE",
      );
      const archives = await t.run((ctx) => ctx.db.query("winnerArchive").collect());
      expect(archives).toHaveLength(0);
    });
  });

  describe("requestMoreInfo", () => {
    it("sends the claim back to the claimant with a message, leaving the campaign untouched", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.requestMoreInfo, {
        claimId: claim._id,
        message: "Your photo ID is blurry, please re-upload.",
      });

      const [updatedClaim, campaign] = await t.run(async (ctx) => [
        await ctx.db.get(claim._id),
        await ctx.db.get(campaignId),
      ]);
      expect(updatedClaim!.status).toBe("more_info_required");
      expect(updatedClaim!.moreInfoMessage).toBe("Your photo ID is blurry, please re-upload.");
      expect(campaign!.status).toBe("winner_pending");

      const auditEntries = await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", "claims").eq("entityId", claim._id))
          .collect(),
      );
      const requested = auditEntries.find((e) => e.action === "claim.more_info_requested");
      expect(requested).toBeDefined();
      expect(requested!.metadata).toMatchObject({ message: "Your photo ID is blurry, please re-upload." });
    });

    it("still lists a more_info_required claim in listPendingClaims", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.requestMoreInfo, { claimId: claim._id, message: "fix it" });
      const rows = await admin.query(api.admin.listPendingClaims, {});
      expect(rows).toHaveLength(1);
      expect(rows[0].claim.status).toBe("more_info_required");
    });

    it("lets the claimant replace a document and resubmit, clearing the message and returning to under_review", async () => {
      const t = convexTest(schema, modules);
      const { claim, as, reference } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.requestMoreInfo, {
        claimId: claim._id,
        message: "Your photo ID is blurry, please re-upload.",
      });

      // Re-registering under more_info_required must be allowed — this is
      // exactly what the status gate on generateDocumentUploadUrl/
      // registerUploadedDocument now needs to accept.
      await as.mutation(api.claims.generateDocumentUploadUrl, { reference });
      const newStorageId = await t.run(async (ctx) => {
        const id = await ctx.storage.store(new Blob([pngBytes as BlobPart], { type: "image/png" }));
        await ctx.db.patch(id as never, { contentType: "image/png" } as never);
        return id;
      });
      await as.action(api.claims.registerUploadedDocument, {
        reference,
        type: "photo_id",
        storageId: newStorageId as never,
      });

      await as.mutation(api.claims.submitClaimDocuments, {
        reference,
        legalName: "Ada Lovelace",
        affidavitAccepted: true,
        publicityReleaseAccepted: true,
      });

      const updatedClaim = await t.run((ctx) => ctx.db.get(claim._id));
      expect(updatedClaim!.status).toBe("under_review");
      expect(updatedClaim).not.toHaveProperty("moreInfoMessage");
    });

    it("refuses to request more info on a claim that isn't under_review", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.approveClaim, { claimId: claim._id });
      await expect(
        admin.mutation(api.admin.requestMoreInfo, { claimId: claim._id, message: "too late" }),
      ).rejects.toThrow("CLAIM_NOT_UNDER_REVIEW");
    });
  });

  describe("rejectClaim", () => {
    it("marks the claim disqualified and, under resume_campaign (the seed campaign's policy), resumes the campaign to live with the sealed target untouched", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      const secretBefore = await t.run((ctx) =>
        ctx.db.query("campaignSecrets").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).unique(),
      );
      const admin = await asAdmin(t);
      await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "ID did not match" });

      const [updatedClaim, campaign, secretAfter] = await t.run(async (ctx) => [
        await ctx.db.get(claim._id),
        await ctx.db.get(campaignId),
        await ctx.db
          .query("campaignSecrets")
          .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
          .unique(),
      ]);
      expect(updatedClaim!.status).toBe("disqualified");
      expect(campaign!.status).toBe("live");
      expect(campaign).not.toHaveProperty("winningSpinId");
      expect(campaign).not.toHaveProperty("potentialWinnerUserId");
      // The sealed target itself is the thing product policy says must
      // survive a resume untouched — same shard/count/nonce/hash as before.
      expect(secretAfter).toEqual(secretBefore);

      const campaignAuditEntries = await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
          .collect(),
      );
      const resumed = campaignAuditEntries.find((e) => e.action === "campaign.resumed");
      expect(resumed).toBeDefined();
      expect(resumed!.before).toMatchObject({ status: "winner_pending" });
      expect(resumed!.after).toMatchObject({ status: "live" });
    });

    it("lets a new spin win the resumed campaign against the same sealed target", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId, reference: firstReference } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" });

      const asBob = t.withIdentity({ subject: "clerk_bob", email: "bob@example.com", emailVerified: true });
      const bobId = await asBob.mutation(api.users.ensureUser, {});
      await t.run((ctx) => ctx.db.patch(bobId, { country: "US", region: "NY", birthDate: "1990-01-01" }));
      await asBob.mutation(api.rules.acceptRules, {});

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
      const spin = await asBob.mutation(api.spins.spinExecute, {
        idempotencyKey: "bob-win",
        deviceHash: "test",
      });
      randomSpy.mockRestore();

      expect(spin.isPotentialWinner).toBe(true);
      expect(spin.claimReference).toBe(firstReference);

      const campaign = await t.run((ctx) => ctx.db.get(campaignId));
      expect(campaign!.status).toBe("winner_pending");
    });

    it("cancels the campaign under end_campaign", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      await t.run((ctx) => ctx.db.patch(campaignId, { disqualificationPolicy: "end_campaign" }));
      const admin = await asAdmin(t);
      await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" });

      const campaign = await t.run((ctx) => ctx.db.get(campaignId));
      expect(campaign!.status).toBe("cancelled");
      const campaignAuditEntries = await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
          .collect(),
      );
      const cancelled = campaignAuditEntries.find((e) => e.action === "campaign.cancelled");
      expect(cancelled).toBeDefined();
      expect(cancelled!.before).toMatchObject({ status: "winner_pending" });
      expect(cancelled!.after).toMatchObject({ status: "cancelled" });
    });

    describe("select_alternate", () => {
      async function withSelectAlternate(t: Test) {
        const ctx = await readyClaim(t);
        await t.run((c) => c.db.patch(ctx.campaignId, { disqualificationPolicy: "select_alternate" }));
        const [secretBefore, campaignBefore] = await t.run(async (c) => [
          await c.db
            .query("campaignSecrets")
            .withIndex("by_campaign", (q) => q.eq("campaignId", ctx.campaignId))
            .unique(),
          await c.db.get(ctx.campaignId),
        ]);
        return { ...ctx, secretBefore: secretBefore!, commitmentHashBefore: campaignBefore!.commitmentHash };
      }

      it("advances to the next occurrence on the same shard and re-seals a new commitment", async () => {
        const t = convexTest(schema, modules);
        const { claim, campaignId, secretBefore, commitmentHashBefore } = await withSelectAlternate(t);
        const admin = await asAdmin(t);
        await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" });

        const [campaign, secretAfter] = await t.run(async (ctx) => [
          await ctx.db.get(campaignId),
          await ctx.db
            .query("campaignSecrets")
            .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
            .unique(),
        ]);
        expect(campaign!.status).toBe("live");
        expect(campaign).not.toHaveProperty("winningSpinId");
        expect(campaign).not.toHaveProperty("potentialWinnerUserId");

        // Same shard, count advanced by exactly one, a genuinely different nonce.
        expect(secretAfter!.winningShard).toBe(secretBefore.winningShard);
        expect(secretAfter!.winningCount).toBe(secretBefore.winningCount + 1);
        expect(secretAfter!.nonce).not.toBe(secretBefore.nonce);

        const expectedHash = await commitmentFor(
          secretAfter!.winningShard,
          secretAfter!.winningCount,
          secretAfter!.nonce,
        );
        expect(campaign!.commitmentHash).toBe(expectedHash);
        expect(campaign!.commitmentHash).not.toBe(commitmentHashBefore);

        const campaignAuditEntries = await t.run((ctx) =>
          ctx.db
            .query("auditLogs")
            .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
            .collect(),
        );
        const resealed = campaignAuditEntries.find((e) => e.action === "campaign.alternate_selected");
        expect(resealed).toBeDefined();
        // The hash is logged; the raw target never is. (The nonce is a
        // 64-char hex string, so this is a meaningful check — a small
        // integer like winningCount would trivially collide with a
        // substring of an unrelated hash/id and isn't worth asserting on.)
        expect(JSON.stringify(resealed)).not.toContain(secretAfter!.nonce);
      });

      it("lets a new spin win against the advanced target on the same shard", async () => {
        const t = convexTest(schema, modules);
        const { claim, campaignId } = await withSelectAlternate(t);
        const admin = await asAdmin(t);
        await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" });

        const asBob = t.withIdentity({ subject: "clerk_bob", email: "bob@example.com", emailVerified: true });
        const bobId = await asBob.mutation(api.users.ensureUser, {});
        await t.run((ctx) => ctx.db.patch(bobId, { country: "US", region: "NY", birthDate: "1990-01-01" }));
        await asBob.mutation(api.rules.acceptRules, {});

        const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
        const spin = await asBob.mutation(api.spins.spinExecute, {
          idempotencyKey: "bob-win",
          deviceHash: "test",
        });
        randomSpy.mockRestore();

        expect(spin.isPotentialWinner).toBe(true);
        const campaign = await t.run((ctx) => ctx.db.get(campaignId));
        expect(campaign!.status).toBe("winner_pending");
      });

      it("throws and reseals nothing if the current commitment was tampered with", async () => {
        const t = convexTest(schema, modules);
        const { claim, campaignId, secretBefore } = await withSelectAlternate(t);
        await t.run((ctx) => ctx.db.patch(campaignId, { commitmentHash: "tampered" }));
        const admin = await asAdmin(t);
        await expect(
          admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" }),
        ).rejects.toThrow("COMMITMENT_MISMATCH");

        const secretAfter = await t.run((ctx) =>
          ctx.db.query("campaignSecrets").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).unique(),
        );
        expect(secretAfter).toEqual(secretBefore);
        // finalizeRejection is one mutation, one transaction: a throw
        // partway through rolls back everything, including the claim
        // disqualification that ran earlier in the same call.
        const updatedClaim = await t.run((ctx) => ctx.db.get(claim._id));
        expect(updatedClaim!.status).toBe("under_review");
      });
    });

    it("refuses a second rejection of an already-resolved claim", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "first" });
      await expect(
        admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "second" }),
      ).rejects.toThrow("CLAIM_NOT_UNDER_REVIEW");
    });
  });

  describe("purgeClaimDocuments", () => {
    it("deletes all documents for a disqualified claim", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.action(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" });
      await admin.mutation(api.admin.purgeClaimDocuments, { claimId: claim._id });
      const rows = await t.run((ctx) =>
        ctx.db.query("claimDocuments").withIndex("by_claim", (q) => q.eq("claimId", claim._id)).collect(),
      );
      expect(rows).toHaveLength(0);
    });

    it("keeps the winner photo's storage object referenced by winnerArchive after purging an approved claim", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.approveClaim, { claimId: claim._id });
      const archiveBefore = await t.run((ctx) =>
        ctx.db.query("winnerArchive").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).unique(),
      );
      await admin.mutation(api.admin.purgeClaimDocuments, { claimId: claim._id });

      const photoStillReadable = await t.run((ctx) => ctx.storage.getUrl(archiveBefore!.photoStorageId));
      expect(photoStillReadable).not.toBeNull();

      // The claimDocuments row for that photo is not itself archived anywhere,
      // so purge must still remove it even though its storage object survives.
      const rows = await t.run((ctx) =>
        ctx.db.query("claimDocuments").withIndex("by_claim", (q) => q.eq("claimId", claim._id)).collect(),
      );
      expect(rows).toHaveLength(0);
    });

    it("refuses to purge a claim before an approve/reject decision has been made", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await expect(
        admin.mutation(api.admin.purgeClaimDocuments, { claimId: claim._id }),
      ).rejects.toThrow("CLAIM_NOT_RESOLVED");

      const rows = await t.run((ctx) =>
        ctx.db.query("claimDocuments").withIndex("by_claim", (q) => q.eq("claimId", claim._id)).collect(),
      );
      expect(rows).toHaveLength(3);
    });

    it("records which document types were purged, and which one kept its storage object, in the audit entry", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.approveClaim, { claimId: claim._id });
      await admin.mutation(api.admin.purgeClaimDocuments, { claimId: claim._id });

      const entries = await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_entity", (q) => q.eq("entityType", "claims").eq("entityId", claim._id))
          .collect(),
      );
      const purged = entries.find((e) => e.action === "claim.documents_purged");
      expect(purged).toBeDefined();
      expect(purged!.metadata).toMatchObject({
        purgedTypes: expect.arrayContaining(["photo_id", "proof_of_address", "winner_photo"]),
        retainedStorageFor: "winner_photo",
      });
    });
  });
});
