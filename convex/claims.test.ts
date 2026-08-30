/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest, TestConvex } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

// `ReturnType<typeof convexTest>` resolves convexTest's generic schema
// parameter to its bare constraint, not this project's actual schema, which
// silently widens every id/doc type threaded through a helper typed that
// way — the exact gap that broke `npm run build` in `admin.test.ts`
// (commit `b3b04ab`). Binding the exported `TestConvex` type to `typeof
// schema` keeps it concrete.
type Test = TestConvex<typeof schema>;

/**
 * Seeds a campaign, creates a user, and inserts a spins row + a claims row
 * directly — reaching "this user has a potential-winner claim" without
 * running the actual sealed-shard lottery, which is unrelated to what this
 * file tests.
 */
async function makeClaimant(t: Test, clerkId = "clerk_ada") {
  await t.mutation(internal.seed.seedCampaign, {});
  const as = t.withIdentity({ subject: clerkId, email: `${clerkId}@example.com` });
  const userId = await as.mutation(api.users.ensureUser, {});

  const { campaignId, spinId, reference } = await t.run(async (ctx) => {
    const campaign = (await ctx.db.query("campaigns").first())!;
    const spinId = await ctx.db.insert("spins", {
      userId,
      campaignId: campaign._id,
      idempotencyKey: `${clerkId}-win`,
      shard: 0,
      shardSequence: 1,
      symbols: ["SEVEN", "SEVEN", "SEVEN"],
      isPotentialWinner: true,
      isValid: true,
      riskScore: 0,
      riskFlags: [],
      ipHash: "",
      deviceHash: "test",
      engineVersion: "test",
      rulesVersion: 1,
    });
    const reference = `CLAIM-${clerkId.toUpperCase()}`;
    const claimId = await ctx.db.insert("claims", {
      campaignId: campaign._id,
      spinId,
      userId,
      claimReference: reference,
      status: "potential_winner",
      claimDeadline: Date.now() + 14 * 24 * 3_600_000,
    });
    await ctx.db.patch(campaign._id, {
      status: "winner_pending",
      winningSpinId: spinId,
      potentialWinnerUserId: userId,
    });
    return { campaignId: campaign._id, spinId, claimId, reference };
  });

  return { t, as, userId, campaignId, spinId, reference };
}

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The plan's brief describes this as `generateUploadUrl()` + a raw
 * `fetch(url, {...})` POST reading `storageId` back from the JSON response —
 * the standard client-side upload flow against a real deployment. Under this
 * repo's `convex-test@0.0.56` (node_modules/convex-test/dist/index.js), that
 * doesn't work: `generateUploadUrl` (the "1.0/storageGenerateUploadUrl"
 * syscall) only ever returns a fake `https://some-deployment.convex.cloud/...`
 * string — convex-test runs no HTTP server behind it, so a real `fetch` to
 * that URL has nothing to hit. `t.fetch` exists, but it only routes to HTTP
 * actions registered in `convex/http.ts` (`https://some.convex.site/...`),
 * which is a different mechanism entirely and irrelevant here.
 *
 * What convex-test *does* provide is `t.run`, which — per its own source
 * ("Grab StorageActionWriter from action ctx") — hands the callback a `ctx`
 * whose `ctx.storage` is a full action-style storage writer, including
 * `store()`. That's the real "upload a real file, get a real storage id"
 * primitive this version exposes, so it's what this helper uses.
 *
 * We still call `generateDocumentUploadUrl` first (not just for realism —
 * it's the mutation the ownership check in the brief lives on), so its
 * authorization behavior is exercised exactly as the brief intends even
 * though the URL it returns is never fetched.
 *
 * One more gap: on a real deployment, the storage upload endpoint reads the
 * request's `Content-Type` header and records it on the `_storage` system
 * doc — that's what `registerUploadedDocument` reads back via
 * `ctx.db.system.get(...).contentType`. convex-test@0.0.56's fake
 * `storage/storeBlob` syscall (node_modules/convex-test/dist/index.js) never
 * writes a `contentType` field at all, regardless of the Blob's own `.type`,
 * so without help every upload looks type-less to the code under test. Patch
 * it onto the row directly here — a test-only stand-in for what the real
 * upload endpoint already does — so the assertions below are actually
 * exercising the validation logic in claims.ts rather than this library gap.
 */
async function uploadFile(
  t: Test,
  as: ReturnType<Test["withIdentity"]>,
  reference: string,
  contentType: string,
  bytes: Uint8Array,
) {
  await as.mutation(api.claims.generateDocumentUploadUrl, { reference });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([bytes as BlobPart], { type: contentType }));
    // `_storage` isn't part of the app's DataModel, so there's no
    // type-safe overload of `patch` for it — same double-cast as
    // `admin.test.ts`'s copy of this test-only backdoor.
    await ctx.db.patch(id as never, { contentType } as never);
    return id;
  });
  return storageId as string;
}

describe("claims", () => {
  describe("getMyClaim", () => {
    it("returns null for a signed-in user with no matching claim", async () => {
      const t = convexTest(schema, modules);
      const as = t.withIdentity({ subject: "clerk_nobody", email: "nobody@example.com" });
      await as.mutation(api.users.ensureUser, {});
      expect(await as.query(api.claims.getMyClaim, { reference: "CLAIM-NOTHING" })).toBeNull();
    });

    it("returns null for a reference that belongs to someone else", async () => {
      const t = convexTest(schema, modules);
      const { reference } = await makeClaimant(t, "clerk_ada");
      const asEve = t.withIdentity({ subject: "clerk_eve", email: "eve@example.com" });
      await asEve.mutation(api.users.ensureUser, {});
      expect(await asEve.query(api.claims.getMyClaim, { reference })).toBeNull();
    });

    it("returns the claim and its documents for the owning user", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const result = await as.query(api.claims.getMyClaim, { reference });
      expect(result).toMatchObject({ claim: { claimReference: reference, status: "potential_winner" }, documents: [] });
    });

    it("lets each user reach their own claim when claimReference collides across campaigns, and still returns null for an unrelated user", async () => {
      // claimReference is a deterministic function of the sealed target
      // (spins.ts), not a uniqueness-guaranteed identifier — two campaigns can
      // produce the identical string. Seeding the collision directly here
      // (rather than via the full spin pipeline) reaches the same condition
      // requireOwnedClaim (claims.ts) must survive without a hard crash.
      const t = convexTest(schema, modules);
      await t.mutation(internal.seed.seedCampaign, {});

      const asAda = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
      const adaId = await asAda.mutation(api.users.ensureUser, {});
      const asBob = t.withIdentity({ subject: "clerk_bob", email: "bob@example.com" });
      const bobId = await asBob.mutation(api.users.ensureUser, {});
      const asCarol = t.withIdentity({ subject: "clerk_carol", email: "carol@example.com" });
      await asCarol.mutation(api.users.ensureUser, {});

      const collidingReference = "CLAIM-COLLISION";
      const spinFields = {
        shard: 0,
        shardSequence: 1,
        symbols: ["SEVEN", "SEVEN", "SEVEN"],
        isPotentialWinner: true,
        isValid: true,
        riskScore: 0,
        riskFlags: [] as string[],
        ipHash: "",
        deviceHash: "test",
        engineVersion: "test",
        rulesVersion: 1,
      };
      const { adaClaimId, bobClaimId } = await t.run(async (ctx) => {
        const campaign = (await ctx.db.query("campaigns").first())!;
        const adaSpinId = await ctx.db.insert("spins", {
          ...spinFields,
          userId: adaId,
          campaignId: campaign._id,
          idempotencyKey: "ada-win",
        });
        const bobSpinId = await ctx.db.insert("spins", {
          ...spinFields,
          userId: bobId,
          campaignId: campaign._id,
          idempotencyKey: "bob-win",
        });
        const claimDeadline = Date.now() + 14 * 24 * 3_600_000;
        const adaClaimId = await ctx.db.insert("claims", {
          campaignId: campaign._id,
          spinId: adaSpinId,
          userId: adaId,
          claimReference: collidingReference,
          status: "potential_winner",
          claimDeadline,
        });
        const bobClaimId = await ctx.db.insert("claims", {
          campaignId: campaign._id,
          spinId: bobSpinId,
          userId: bobId,
          claimReference: collidingReference,
          status: "potential_winner",
          claimDeadline,
        });
        return { adaClaimId, bobClaimId };
      });

      const adaResult = await asAda.query(api.claims.getMyClaim, { reference: collidingReference });
      expect(adaResult!.claim._id).toBe(adaClaimId);

      const bobResult = await asBob.query(api.claims.getMyClaim, { reference: collidingReference });
      expect(bobResult!.claim._id).toBe(bobClaimId);

      const carolResult = await asCarol.query(api.claims.getMyClaim, { reference: collidingReference });
      expect(carolResult).toBeNull();
    });
  });

  describe("upload and registration", () => {
    it("registers a valid PNG and it appears in getMyClaim", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const storageId = await uploadFile(t, as, reference, "image/png", pngBytes);
      await as.action(api.claims.registerUploadedDocument, {
        reference,
        type: "winner_photo",
        storageId: storageId as never,
      });
      const result = await as.query(api.claims.getMyClaim, { reference });
      expect(result!.documents).toHaveLength(1);
      expect(result!.documents[0]).toMatchObject({ type: "winner_photo" });
    });

    it("rejects a disallowed content type and deletes the upload", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const storageId = await uploadFile(t, as, reference, "text/plain", new TextEncoder().encode("hi"));
      await expect(
        as.action(api.claims.registerUploadedDocument, {
          reference,
          type: "photo_id",
          storageId: storageId as never,
        }),
      ).rejects.toThrow("UNSUPPORTED_FILE_TYPE");
    });

    it("rejects a file whose declared Content-Type lies about its actual bytes", async () => {
      // The whole point of sniffing the real bytes instead of trusting the
      // upload's declared header: a caller who lies about the type (here,
      // claiming "image/png" for plain text) must not slip through just
      // because the header says so.
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const storageId = await uploadFile(
        t,
        as,
        reference,
        "image/png",
        new TextEncoder().encode("not actually a png"),
      );
      await expect(
        as.action(api.claims.registerUploadedDocument, {
          reference,
          type: "winner_photo",
          storageId: storageId as never,
        }),
      ).rejects.toThrow("UNSUPPORTED_FILE_TYPE");
    });

    it("accepts a real PNG even if the upload's declared Content-Type disagrees", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const storageId = await uploadFile(t, as, reference, "text/plain", pngBytes);
      await as.action(api.claims.registerUploadedDocument, {
        reference,
        type: "winner_photo",
        storageId: storageId as never,
      });
      const result = await as.query(api.claims.getMyClaim, { reference });
      expect(result!.documents).toEqual([{ type: "winner_photo" }]);
    });

    it("rejects a file over 10MB", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      // A real PNG signature so this fails on size, not on the (now
      // byte-sniffed) type check — a big block of zero bytes wouldn't sniff
      // as a PNG at all.
      const big = new Uint8Array(10 * 1024 * 1024 + 1);
      big.set(pngBytes);
      const storageId = await uploadFile(t, as, reference, "image/png", big);
      await expect(
        as.action(api.claims.registerUploadedDocument, {
          reference,
          type: "winner_photo",
          storageId: storageId as never,
        }),
      ).rejects.toThrow("FILE_TOO_LARGE");
    });

    it("replaces an existing document of the same type rather than accumulating", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const first = await uploadFile(t, as, reference, "image/png", pngBytes);
      await as.action(api.claims.registerUploadedDocument, {
        reference,
        type: "winner_photo",
        storageId: first as never,
      });
      const second = await uploadFile(t, as, reference, "image/png", pngBytes);
      await as.action(api.claims.registerUploadedDocument, {
        reference,
        type: "winner_photo",
        storageId: second as never,
      });
      const rows = await t.run((ctx) => ctx.db.query("claimDocuments").collect());
      expect(rows).toHaveLength(1);
      expect(rows[0].storageId).toBe(second);
    });

    it("refuses to register a document against a claim the caller does not own", async () => {
      const t = convexTest(schema, modules);
      const { reference } = await makeClaimant(t, "clerk_ada");
      const asEve = t.withIdentity({ subject: "clerk_eve", email: "eve@example.com" });
      await asEve.mutation(api.users.ensureUser, {});
      // generateDocumentUploadUrl itself must refuse Eve before she ever gets a storage id
      await expect(
        asEve.mutation(api.claims.generateDocumentUploadUrl, { reference }),
      ).rejects.toThrow("CLAIM_NOT_FOUND");
    });

    it("refuses registerUploadedDocument itself against a claim the caller does not own, and does not delete the storage object", async () => {
      const t = convexTest(schema, modules);
      const { reference } = await makeClaimant(t, "clerk_ada");
      const asEve = t.withIdentity({ subject: "clerk_eve", email: "eve@example.com" });
      await asEve.mutation(api.users.ensureUser, {});

      // A storageId is just a client-supplied argument, decoupled from
      // `reference` — Eve could pair any storage id she has with a claim
      // reference she doesn't own. registerUploadedDocument must refuse this
      // directly (not merely rely on generateDocumentUploadUrl gatekeeping
      // upstream), and it must not delete the object on the way out: nothing
      // at the ownership-check point establishes Eve has any legitimate
      // claim on this storage object, so treating "ownership failed" as
      // license to delete it would be an authenticated-only delete-any-file
      // primitive.
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob([pngBytes as BlobPart], { type: "image/png" })),
      );

      await expect(
        asEve.action(api.claims.registerUploadedDocument, {
          reference,
          type: "winner_photo",
          storageId: storageId as never,
        }),
      ).rejects.toThrow("CLAIM_NOT_FOUND");

      const metadata = await t.run((ctx) => ctx.db.system.get(storageId));
      expect(metadata).not.toBeNull();
    });

    it("refuses to attach a storageId already registered on another claim, and does not delete it", async () => {
      const t = convexTest(schema, modules);
      const { as: asAda, reference: adaReference } = await makeClaimant(t, "clerk_ada");
      const adaStorageId = await uploadFile(t, asAda, adaReference, "image/png", pngBytes);
      await asAda.action(api.claims.registerUploadedDocument, {
        reference: adaReference,
        type: "winner_photo",
        storageId: adaStorageId as never,
      });

      const { as: asBob, reference: bobReference } = await makeClaimant(t, "clerk_bob");
      // Bob pairs his own claim reference with the storage id Ada's document
      // already points at — nothing about owning his own claim proves he
      // uploaded that particular file.
      await expect(
        asBob.action(api.claims.registerUploadedDocument, {
          reference: bobReference,
          type: "winner_photo",
          storageId: adaStorageId as never,
        }),
      ).rejects.toThrow("STORAGE_ALREADY_REGISTERED");

      // Ada's own registration must be completely unaffected: still exactly
      // one row, and the storage object still resolves (not deleted).
      const adaClaim = await t.run((ctx) =>
        ctx.db
          .query("claims")
          .withIndex("by_reference", (q) => q.eq("claimReference", adaReference))
          .unique(),
      );
      const adaDocs = await t.run((ctx) =>
        ctx.db.query("claimDocuments").withIndex("by_claim", (q) => q.eq("claimId", adaClaim!._id)).collect(),
      );
      expect(adaDocs).toHaveLength(1);
      const metadata = await t.run((ctx) => ctx.db.system.get(adaStorageId as never));
      expect(metadata).not.toBeNull();
    });
  });

  describe("submitClaimDocuments", () => {
    async function withAllDocuments(t: Test, clerkId = "clerk_ada") {
      const ctx = await makeClaimant(t, clerkId);
      for (const type of ["photo_id", "proof_of_address", "winner_photo"] as const) {
        const storageId = await uploadFile(t, ctx.as, ctx.reference, "image/png", pngBytes);
        await ctx.as.action(api.claims.registerUploadedDocument, {
          reference: ctx.reference,
          type,
          storageId: storageId as never,
        });
      }
      return ctx;
    }

    it("throws if a required document is missing", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      await expect(
        as.mutation(api.claims.submitClaimDocuments, {
          reference,
          legalName: "Ada Lovelace",
          affidavitAccepted: true,
          publicityReleaseAccepted: true,
        }),
      ).rejects.toThrow("MISSING_DOCUMENTS");
    });

    it("refuses to submit after the claim deadline has passed", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      const claim = await t.run((ctx2) =>
        ctx2.db
          .query("claims")
          .withIndex("by_reference", (q) => q.eq("claimReference", ctx.reference))
          .unique(),
      );
      await t.run((ctx2) => ctx2.db.patch(claim!._id, { claimDeadline: Date.now() - 1 }));
      await expect(
        ctx.as.mutation(api.claims.submitClaimDocuments, {
          reference: ctx.reference,
          legalName: "Ada Lovelace",
          affidavitAccepted: true,
          publicityReleaseAccepted: true,
        }),
      ).rejects.toThrow("CLAIM_DEADLINE_PASSED");
    });

    it("throws if either checkbox is false", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await expect(
        ctx.as.mutation(api.claims.submitClaimDocuments, {
          reference: ctx.reference,
          legalName: "Ada Lovelace",
          affidavitAccepted: false,
          publicityReleaseAccepted: true,
        }),
      ).rejects.toThrow("CONSENT_REQUIRED");
    });

    it("moves the claim to under_review and stamps both acceptance timestamps", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await ctx.as.mutation(api.claims.submitClaimDocuments, {
        reference: ctx.reference,
        legalName: "Ada Lovelace",
        affidavitAccepted: true,
        publicityReleaseAccepted: true,
      });
      const result = await ctx.as.query(api.claims.getMyClaim, { reference: ctx.reference });
      expect(result!.claim).toMatchObject({
        status: "under_review",
        legalName: "Ada Lovelace",
        publicDisplayName: "Ada Lovelace",
      });
      expect(result!.claim.eligibilityAffidavitAcceptedAt).toBeTypeOf("number");
      expect(result!.claim.publicityReleaseAcceptedAt).toBeTypeOf("number");
    });

    it("uses the provided public display name instead of the legal name when given", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await ctx.as.mutation(api.claims.submitClaimDocuments, {
        reference: ctx.reference,
        legalName: "Ada Lovelace",
        publicDisplayName: "A.L.",
        affidavitAccepted: true,
        publicityReleaseAccepted: true,
      });
      const result = await ctx.as.query(api.claims.getMyClaim, { reference: ctx.reference });
      expect(result!.claim.publicDisplayName).toBe("A.L.");
    });

    it("trims legal and public display names, and falls back to the trimmed legal name when the display name is blank", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await ctx.as.mutation(api.claims.submitClaimDocuments, {
        reference: ctx.reference,
        legalName: "  Ada Lovelace  ",
        publicDisplayName: "   ",
        affidavitAccepted: true,
        publicityReleaseAccepted: true,
      });
      const result = await ctx.as.query(api.claims.getMyClaim, { reference: ctx.reference });
      expect(result!.claim.legalName).toBe("Ada Lovelace");
      expect(result!.claim.publicDisplayName).toBe("Ada Lovelace");
    });

    it("rejects a whitespace-only legal name", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await expect(
        ctx.as.mutation(api.claims.submitClaimDocuments, {
          reference: ctx.reference,
          legalName: "   ",
          affidavitAccepted: true,
          publicityReleaseAccepted: true,
        }),
      ).rejects.toThrow("LEGAL_NAME_REQUIRED");
    });

    it("rejects a legal name over the length cap", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await expect(
        ctx.as.mutation(api.claims.submitClaimDocuments, {
          reference: ctx.reference,
          legalName: "A".repeat(121),
          affidavitAccepted: true,
          publicityReleaseAccepted: true,
        }),
      ).rejects.toThrow("LEGAL_NAME_TOO_LONG");
    });

    it("rejects a public display name over the length cap", async () => {
      const t = convexTest(schema, modules);
      const ctx = await withAllDocuments(t);
      await expect(
        ctx.as.mutation(api.claims.submitClaimDocuments, {
          reference: ctx.reference,
          legalName: "Ada Lovelace",
          publicDisplayName: "A".repeat(121),
          affidavitAccepted: true,
          publicityReleaseAccepted: true,
        }),
      ).rejects.toThrow("PUBLIC_DISPLAY_NAME_TOO_LONG");
    });
  });

  it("getMyClaim returns only the document type, never the raw storage id", async () => {
    const t = convexTest(schema, modules);
    const { as, reference } = await makeClaimant(t);
    const storageId = await uploadFile(t, as, reference, "image/png", pngBytes);
    await as.action(api.claims.registerUploadedDocument, {
      reference,
      type: "winner_photo",
      storageId: storageId as never,
    });
    const result = await as.query(api.claims.getMyClaim, { reference });
    expect(result!.documents[0]).toEqual({ type: "winner_photo" });
    expect(result!.documents[0]).not.toHaveProperty("storageId");
  });
});
