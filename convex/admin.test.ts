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
    await as.mutation(api.claims.registerUploadedDocument, { reference, type, storageId: storageId as never });
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

  it("returns document URLs on getClaimDetail for an admin, refuses a non-admin", async () => {
    const t = convexTest(schema, modules);
    const { claim, as } = await readyClaim(t);
    const admin = await asAdmin(t);
    const detail = await admin.query(api.admin.getClaimDetail, { claimId: claim._id });
    expect(detail.documents).toHaveLength(3);
    for (const doc of detail.documents) expect(typeof doc.url).toBe("string");

    await expect(as.query(api.admin.getClaimDetail, { claimId: claim._id })).rejects.toThrow(
      "NOT_ADMIN",
    );
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
  });

  describe("rejectClaim", () => {
    it("marks the claim disqualified and leaves the campaign untouched", async () => {
      const t = convexTest(schema, modules);
      const { claim, campaignId } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.rejectClaim, { claimId: claim._id, reason: "ID did not match" });

      const [updatedClaim, campaign] = await t.run(async (ctx) => [
        await ctx.db.get(claim._id),
        await ctx.db.get(campaignId),
      ]);
      expect(updatedClaim!.status).toBe("disqualified");
      expect(campaign!.status).toBe("winner_pending");
    });

    it("refuses a second rejection of an already-resolved claim", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.rejectClaim, { claimId: claim._id, reason: "first" });
      await expect(
        admin.mutation(api.admin.rejectClaim, { claimId: claim._id, reason: "second" }),
      ).rejects.toThrow("CLAIM_NOT_UNDER_REVIEW");
    });
  });

  describe("purgeClaimDocuments", () => {
    it("deletes all documents for a disqualified claim", async () => {
      const t = convexTest(schema, modules);
      const { claim } = await readyClaim(t);
      const admin = await asAdmin(t);
      await admin.mutation(api.admin.rejectClaim, { claimId: claim._id, reason: "no match" });
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
  });
});
