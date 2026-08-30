# Claim Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pipeline that takes a potential winner from "may have won" to either a published, verified winner or a disqualified claim — document upload, an admin review queue, and publication to `/winners`.

**Architecture:** Two new Convex tables (`claimDocuments`, `winnerArchive`) and three new/extended fields on `claims`. Claimant-side functions live in `convex/claims.ts`, admin-side in `convex/admin.ts`, both gated by identity checks (`requireUser`/`requireAdmin`) rather than by trusting anything in a URL or a client-supplied argument. Files upload through Convex's native storage with server-side type/size validation at registration time, not at final submission. Approval recomputes and verifies the campaign's sealed commitment before ever publishing a winner.

**Tech Stack:** Convex, Next.js 16 App Router, TypeScript, `convex-test` + Vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-claim-verification-design.md`

## Global Constraints

- **A claim reference alone is never authorization.** Every claimant-side function takes a `reference` argument, looks up the claim by it, and then asserts `claim.userId === caller._id` before doing anything else. A caller with no matching, owned claim gets `null` (queries) or a thrown error (mutations) — never a fabricated result, and never a different error message for "wrong reference" vs. "someone else's reference" (both must be indistinguishable to the caller).
- **No client-supplied storage ID is trusted without a matching `claimDocuments` row written by `registerUploadedDocument`.** `submitClaimDocuments` never takes a storage ID as an argument.
- **Every file is validated server-side** (content type, size) at registration time using the `_storage` system table, not the browser's `accept` attribute. Photo ID and proof of address: JPEG, PNG, or PDF, max 10 MB. Winner photo: JPEG or PNG, max 10 MB. A file failing validation is deleted from storage, not left orphaned.
- **`approveClaim` and `rejectClaim` assert `claim.status === "under_review"` before writing anything.** `approveClaim` additionally asserts `campaign.status === "winner_pending"`. A second call against an already-resolved claim throws instead of double-writing.
- **`approveClaim` recomputes the commitment hash with `commitmentFor` (from `convex/winnerEngine.ts`) and asserts it equals `campaign.commitmentHash` before writing `winnerArchive` or revealing anything.** A mismatch throws and publishes nothing.
- **Monetary values are integer cents; vocabulary is binding** (spins, prize, campaign, claim, Official Rules, potential winner — never bet, wager, credits, balance-as-money, deposit, cash out) — same rules as the rest of this backend.
- **Every mutation that changes claim, campaign, or document state writes an audit entry** via `writeAudit` from `convex/lib/audit.ts`.
- **Node version:** the repo runs Node 22 with `allowImportingTsExtensions: true`; keep explicit `.ts` extensions on relative imports inside `convex/` non-test files. Test files never use `{ eager: true }` on `import.meta.glob` — the installed `convex-test` version's `modules` parameter requires lazy loader functions, and every test file in this repo already uses `import.meta.glob("./**/*.*s")` with no options.
- **`npx convex codegen` does not deploy code** — only `npx convex dev` (interactive or `--once`) actually pushes to the deployment. Use `npx vitest run` as the correctness signal during development; if you need to verify against the live dev deployment, run `npx convex dev --once` first.

## File Structure

**Created:**
- `convex/lib/admin.ts` — `requireAdmin`
- `convex/claims.ts` — `getMyClaim`, `generateDocumentUploadUrl`, `registerUploadedDocument`, `submitClaimDocuments`
- `convex/claims.test.ts`
- `convex/admin.ts` — `listPendingClaims`, `getClaimDetail`, `approveClaim`, `rejectClaim`, `purgeClaimDocuments`
- `convex/admin.test.ts`
- `convex/winners.ts` — `listWinners`
- `convex/winners.test.ts`
- `app/admin/page.tsx` — pending-claims list
- `app/admin/claims/[claimId]/page.tsx` — claim detail/review

**Modified:**
- `convex/schema.ts` — add `claimDocuments`, `winnerArchive` tables; add `legalName`, `publicDisplayName`, `eligibilityAffidavitAcceptedAt` to `claims`
- `app/claim/[reference]/page.tsx` — becomes a client component with a live upload form
- `app/winners/page.tsx` — becomes query-backed

---

### Task 1: Schema and the admin helper

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/lib/admin.ts`, `convex/lib/admin.test.ts`

**Interfaces:**
- Consumes: `requireUser` from `convex/users.ts`
- Produces: `claimDocuments` table (index `by_claim`, `by_claim_type`); `winnerArchive` table (index `by_campaign`); `claims.legalName`/`publicDisplayName`/`eligibilityAffidavitAcceptedAt`; `requireAdmin(ctx): Promise<Doc<"users">>` from `convex/lib/admin.ts`, throwing `"NOT_ADMIN"` for a signed-in non-admin and `"NOT_AUTHENTICATED"` for a signed-out caller (via `requireUser`).

- [ ] **Step 1: Write the failing test**

Create `convex/lib/admin.test.ts`:

```typescript
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.*s");

describe("requireAdmin", () => {
  it("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.listPendingClaims, {})).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
  });

  it("rejects a signed-in user who is not an admin", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.query(api.admin.listPendingClaims, {})).rejects.toThrow(
      "NOT_ADMIN",
    );
  });

  it("allows a user whose role is admin", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
    const userId = await as.mutation(api.users.ensureUser, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { role: "admin" });
    });
    await expect(as.query(api.admin.listPendingClaims, {})).resolves.toEqual([]);
  });
});
```

This test references `api.admin.listPendingClaims`, which does not exist yet — that is deliberate, it is the simplest real caller of `requireAdmin` and this test file exercises the helper through it rather than duplicating a fake caller. Task 3 implements the actual query; for this task, create a minimal stub so the test can run:

Create `convex/admin.ts` with just enough to compile:

```typescript
import { query } from "./_generated/server";
import { requireAdmin } from "./lib/admin.ts";

export const listPendingClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return [];
  },
});
```

(Task 3 replaces this file's body entirely with the real implementation — this stub exists only so Task 1's test has something real to call.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/lib/admin.test.ts`
Expected: FAIL — `Cannot find module '../lib/admin'` (or similar; `requireAdmin` does not exist yet).

- [ ] **Step 3: Extend the schema**

Add to `convex/schema.ts`, after the existing `claims` table definition, inside the same `claims: defineTable({ ... })` object (add these three fields alongside the existing ones — do not remove or reorder anything already there):

```typescript
    legalName: v.optional(v.string()),
    publicDisplayName: v.optional(v.string()),
    eligibilityAffidavitAcceptedAt: v.optional(v.number()),
```

Then add these two new tables after `claims` (and after whatever table currently follows it — append at the end of the `defineSchema({ ... })` object, do not insert in the middle):

```typescript
  claimDocuments: defineTable({
    claimId: v.id("claims"),
    userId: v.id("users"), // denormalized owner check, avoids a join on every access
    type: v.union(
      v.literal("photo_id"),
      v.literal("proof_of_address"),
      v.literal("winner_photo"),
    ),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_type", ["claimId", "type"]),

  winnerArchive: defineTable({
    campaignId: v.id("campaigns"),
    claimId: v.id("claims"),
    legalName: v.string(),
    publicDisplayName: v.string(),
    photoStorageId: v.id("_storage"),
    region: v.string(),
    prizeTitle: v.string(),
    awardedAt: v.number(),
    revealedTarget: v.string(), // "<winningShard>:<winningCount>"
    revealedNonce: v.string(),
    commitmentHash: v.string(),
  }).index("by_campaign", ["campaignId"]),
```

- [ ] **Step 4: Write `requireAdmin`**

Create `convex/lib/admin.ts`:

```typescript
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireUser } from "../users.ts";

/**
 * Every admin-only function starts here. A signed-in user who isn't an admin
 * gets the same treatment as a signed-out one would from requireUser: a typed
 * error, never a silent null or an empty result that could be mistaken for
 * "you're an admin, there's just nothing to see."
 */
export async function requireAdmin(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin" && user.role !== "superadmin") {
    throw new Error("NOT_ADMIN");
  }
  return user;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run convex/lib/admin.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: all existing tests still pass (the schema change is additive, and `convex/admin.ts` is a stub Task 3 will replace).

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/lib/admin.ts convex/lib/admin.test.ts convex/admin.ts
git commit -m "feat: add claim verification schema and the admin role gate"
```

---

### Task 2: Claimant-side backend — upload, registration, submission

**Files:**
- Create: `convex/claims.ts`, `convex/claims.test.ts`

**Interfaces:**
- Consumes: `requireUser` (`convex/users.ts`); `writeAudit` (`convex/lib/audit.ts`)
- Produces: `api.claims.getMyClaim({ reference }) → { claim: Doc<"claims">, documents: Doc<"claimDocuments">[] } | null`; `api.claims.generateDocumentUploadUrl({ reference }) → string`; `api.claims.registerUploadedDocument({ reference, type, storageId }) → null`; `api.claims.submitClaimDocuments({ reference, legalName, publicDisplayName?, affidavitAccepted, publicityReleaseAccepted }) → null`

- [ ] **Step 1: Write the failing tests**

Create `convex/claims.test.ts`:

```typescript
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

/**
 * Seeds a campaign, creates a user, and inserts a spins row + a claims row
 * directly — reaching "this user has a potential-winner claim" without
 * running the actual sealed-shard lottery, which is unrelated to what this
 * file tests.
 */
async function makeClaimant(t: ReturnType<typeof convexTest>, clerkId = "clerk_ada") {
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

async function uploadFile(
  as: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  reference: string,
  contentType: string,
  bytes: Uint8Array,
) {
  const url = await as.mutation(api.claims.generateDocumentUploadUrl, { reference });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  const { storageId } = await response.json();
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
  });

  describe("upload and registration", () => {
    it("registers a valid PNG and it appears in getMyClaim", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const storageId = await uploadFile(as, reference, "image/png", pngBytes);
      await as.mutation(api.claims.registerUploadedDocument, {
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
      const storageId = await uploadFile(as, reference, "text/plain", new TextEncoder().encode("hi"));
      await expect(
        as.mutation(api.claims.registerUploadedDocument, {
          reference,
          type: "photo_id",
          storageId: storageId as never,
        }),
      ).rejects.toThrow("UNSUPPORTED_FILE_TYPE");
    });

    it("rejects a file over 10MB", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const big = new Uint8Array(10 * 1024 * 1024 + 1);
      const storageId = await uploadFile(as, reference, "image/png", big);
      await expect(
        as.mutation(api.claims.registerUploadedDocument, {
          reference,
          type: "winner_photo",
          storageId: storageId as never,
        }),
      ).rejects.toThrow("FILE_TOO_LARGE");
    });

    it("replaces an existing document of the same type rather than accumulating", async () => {
      const t = convexTest(schema, modules);
      const { as, reference } = await makeClaimant(t);
      const first = await uploadFile(as, reference, "image/png", pngBytes);
      await as.mutation(api.claims.registerUploadedDocument, {
        reference,
        type: "winner_photo",
        storageId: first as never,
      });
      const second = await uploadFile(as, reference, "image/png", pngBytes);
      await as.mutation(api.claims.registerUploadedDocument, {
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
      const storageId = await uploadFile(asEve, reference, "image/png", pngBytes).catch(() => null);
      // generateDocumentUploadUrl itself must refuse Eve before she ever gets a storage id
      expect(storageId).toBeNull();
    });
  });

  describe("submitClaimDocuments", () => {
    async function withAllDocuments(t: ReturnType<typeof convexTest>, clerkId = "clerk_ada") {
      const ctx = await makeClaimant(t, clerkId);
      for (const type of ["photo_id", "proof_of_address", "winner_photo"] as const) {
        const storageId = await uploadFile(ctx.as, ctx.reference, "image/png", pngBytes);
        await ctx.as.mutation(api.claims.registerUploadedDocument, {
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
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/claims.test.ts`
Expected: FAIL — `Cannot find module './claims'`.

- [ ] **Step 3: Write `convex/claims.ts`**

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./users.ts";
import { writeAudit } from "./lib/audit.ts";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_BYTES = 10 * 1024 * 1024;
const ID_AND_ADDRESS_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);

const documentType = v.union(
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
  const claim = await ctx.db
    .query("claims")
    .withIndex("by_reference", (q) => q.eq("claimReference", reference))
    .unique();
  if (claim === null || claim.userId !== user._id) return null;
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
    return { claim: owned.claim, documents };
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

export const registerUploadedDocument = mutation({
  args: { reference: v.string(), type: documentType, storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const owned = await requireOwnedClaim(ctx, args.reference);
    if (owned === null) {
      await ctx.storage.delete(args.storageId);
      throw new Error("CLAIM_NOT_FOUND");
    }

    const metadata = await ctx.db.system.get(args.storageId);
    if (metadata === null) throw new Error("UPLOAD_NOT_FOUND");

    const allowed = args.type === "winner_photo" ? PHOTO_TYPES : ID_AND_ADDRESS_TYPES;
    if (metadata.contentType === undefined || !allowed.has(metadata.contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("UNSUPPORTED_FILE_TYPE");
    }
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

    const now = Date.now();
    await ctx.db.patch(owned.claim._id, {
      legalName: args.legalName,
      publicDisplayName: args.publicDisplayName ?? args.legalName,
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
```

This uses a `by_reference` index (`["claimReference"]`) on `claims` — already present from the original spin-loop plan (`convex/schema.ts`), so there's nothing to add here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/claims.test.ts`
Expected: PASS, 12 tests. If `generateUploadUrl()`/`fetch` upload doesn't work under `convex-test` in this Convex version, check `convex-test`'s own documentation/source for its storage-testing helper (`convexTest(...).storage` or similar) — adapt the `uploadFile` helper to whatever mechanism that version actually provides, keeping the test's intent (upload a real file, get a real storage id, then call `registerUploadedDocument`) unchanged.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add convex/claims.ts convex/claims.test.ts convex/schema.ts
git commit -m "feat: add claimant-side document upload, registration and submission"
```

---

### Task 3: Admin-side backend — review, approve, reject, purge

**Files:**
- Modify: `convex/admin.ts` (replace Task 1's stub entirely)
- Create: `convex/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`convex/lib/admin.ts`); `commitmentFor` (`convex/winnerEngine.ts`); `writeAudit` (`convex/lib/audit.ts`)
- Produces: `api.admin.listPendingClaims() → Array<{ claim, region, birthDate, prizeTitle }>`; `api.admin.getClaimDetail({ claimId }) → { claim, documents: Array<{ type, url }> }`; `api.admin.approveClaim({ claimId }) → null`; `api.admin.rejectClaim({ claimId, reason }) → null`; `api.admin.purgeClaimDocuments({ claimId }) → null`

- [ ] **Step 1: Write the failing tests**

Create `convex/admin.test.ts`:

```typescript
/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { commitmentFor } from "./winnerEngine";

const modules = import.meta.glob("./**/*.*s");

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function uploadFile(
  as: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  reference: string,
) {
  const url = await as.mutation(api.claims.generateDocumentUploadUrl, { reference });
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: pngBytes,
  });
  const { storageId } = await response.json();
  return storageId as string;
}

/**
 * A full pipeline up to under_review: seed a campaign, seal a real target,
 * force a claimant to win it, submit all three documents. Everything this
 * file tests happens after this point.
 */
async function readyClaim(t: ReturnType<typeof convexTest>) {
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

  const as = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com" });
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
    const storageId = await uploadFile(as, reference);
    await as.mutation(api.claims.registerUploadedDocument, { reference, type, storageId: storageId as never });
  }
  await as.mutation(api.claims.submitClaimDocuments, {
    reference,
    legalName: "Ada Lovelace",
    affidavitAccepted: true,
    publicityReleaseAccepted: true,
  });

  const claim = await t.run((ctx) =>
    ctx.db
      .query("claims")
      .withIndex("by_reference", (q) => q.eq("claimReference", reference))
      .unique(),
  );
  return { t, as, userId, campaignId: campaign!._id, claim: claim!, reference };
}

async function asAdmin(t: ReturnType<typeof convexTest>) {
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
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/admin.test.ts`
Expected: FAIL — `listPendingClaims` from Task 1's stub returns `[]` unconditionally and none of `getClaimDetail`/`approveClaim`/`rejectClaim`/`purgeClaimDocuments` exist.

- [ ] **Step 3: Replace `convex/admin.ts`**

Replace the entire file (removing Task 1's stub) with:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin.ts";
import { writeAudit } from "./lib/audit.ts";
import { commitmentFor } from "./winnerEngine.ts";

export const listPendingClaims = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const claims = await ctx.db
      .query("claims")
      .filter((q) => q.eq(q.field("status"), "under_review"))
      .collect();

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
    const documents = await Promise.all(
      documentRows.map(async (doc) => ({
        type: doc.type,
        url: await ctx.storage.getUrl(doc.storageId),
      })),
    );
    return {
      claim,
      region: user?.region ?? null,
      birthDate: user?.birthDate ?? null,
      documents,
    };
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
      legalName: claim.legalName ?? "",
      publicDisplayName: claim.publicDisplayName ?? claim.legalName ?? "",
      photoStorageId: photo.storageId,
      region: user.region ?? "",
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

    for (const doc of documents) {
      // The winner photo's storage object is kept if winnerArchive references
      // it independently — the archive copy is intentionally permanent and
      // public; deleting the underlying file would break it.
      if (archive !== null && doc.storageId === archive.photoStorageId) continue;
      await ctx.storage.delete(doc.storageId);
      await ctx.db.delete(doc._id);
    }

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "claim.documents_purged",
      entityType: "claims",
      entityId: claim._id,
    });
    return null;
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/admin.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add convex/admin.ts convex/admin.test.ts
git commit -m "feat: add admin claim review, approval, rejection and document purging"
```

---

### Task 4: The public winners query

**Files:**
- Create: `convex/winners.ts`, `convex/winners.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `api.winners.listWinners() → Array<{ publicDisplayName, photoUrl, region, prizeTitle, awardedAt, revealedTarget, revealedNonce, commitmentHash }>`, newest first

- [ ] **Step 1: Write the failing test**

Create `convex/winners.test.ts`:

```typescript
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

describe("listWinners", () => {
  it("returns an empty array when nobody has won yet", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.winners.listWinners, {})).toEqual([]);
  });

  it("returns published winners newest first, with a resolvable photo URL", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const photoStorageId = await ctx.storage.store(
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      );

      const sponsorId = await ctx.db.insert("sponsors", {
        name: "s",
        slug: "s",
        websiteUrl: "https://example.invalid",
        ctaLabel: "",
        ctaUrl: "https://example.invalid",
        description: "",
        contactName: "",
        contactEmail: "",
        status: "active",
      });
      const prizeId = await ctx.db.insert("prizes", {
        title: "$100 gift card",
        description: "",
        estimatedRetailValue: 10_000,
        currency: "USD",
        quantity: 1,
        imageStorageIds: [],
        fulfillmentType: "digital",
        fulfillmentNotes: "",
        sponsorId,
      });
      const campaignId = await ctx.db.insert("campaigns", {
        slug: "c1",
        title: "t",
        description: "d",
        sponsorId,
        prizeId,
        status: "completed",
        startAt: 0,
        dailySpins: 10,
        resetTimezone: "UTC",
        resetHour: 0,
        reelColumns: 3,
        projectedVolume: 1000,
        oddsDenominator: 1000,
        shardCount: 16,
        commitmentHash: "abc",
        eligibleCountries: ["US"],
        eligibleRegions: ["NY"],
        minimumAge: 18,
        requireEmailVerification: true,
        activeRulesVersion: 1,
        disqualificationPolicy: "resume_campaign",
      });
      const userId = await ctx.db.insert("users", {
        clerkId: "x",
        email: "x@example.com",
        emailVerified: true,
        ageVerified: false,
        accountStatus: "active",
        role: "user",
        fraudRiskScore: 0,
        marketingConsent: false,
        dailyReminderConsent: false,
        totalSpins: 0,
        totalPotentialWins: 0,
      });
      const spinId = await ctx.db.insert("spins", {
        userId,
        campaignId,
        idempotencyKey: "k",
        shard: 0,
        shardSequence: 1,
        symbols: ["SEVEN", "SEVEN", "SEVEN"],
        isPotentialWinner: true,
        isValid: true,
        riskScore: 0,
        riskFlags: [],
        ipHash: "",
        deviceHash: "d",
        engineVersion: "e",
        rulesVersion: 1,
      });
      const claimId = await ctx.db.insert("claims", {
        campaignId,
        spinId,
        userId,
        claimReference: "CLAIM-1",
        status: "approved",
        claimDeadline: 0,
      });
      await ctx.db.insert("winnerArchive", {
        campaignId,
        claimId,
        legalName: "Ada Lovelace",
        publicDisplayName: "Ada Lovelace",
        photoStorageId,
        region: "NY",
        prizeTitle: "$100 gift card",
        awardedAt: 1000,
        revealedTarget: "0:1",
        revealedNonce: "nonce",
        commitmentHash: "abc",
      });
    });

    const winners = await t.query(api.winners.listWinners, {});
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({
      publicDisplayName: "Ada Lovelace", region: "NY", prizeTitle: "$100 gift card",
      revealedTarget: "0:1", revealedNonce: "nonce", commitmentHash: "abc",
    });
    expect(typeof winners[0].photoUrl).toBe("string");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/winners.test.ts`
Expected: FAIL — `Cannot find module './winners'`.

- [ ] **Step 3: Write `convex/winners.ts`**

```typescript
import { query } from "./_generated/server";

/**
 * The one public read `/winners` needs. Everything on `winnerArchive` is
 * already exactly what the product is allowed to publish, so this returns
 * the whole row (plus a resolved photo URL) rather than picking fields —
 * unlike `getActiveCampaign`, there is no sealed secret anywhere near this
 * table to accidentally leak.
 */
export const listWinners = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("winnerArchive").order("desc").collect();
    return await Promise.all(
      rows.map(async (row) => ({
        publicDisplayName: row.publicDisplayName,
        photoUrl: await ctx.storage.getUrl(row.photoStorageId),
        region: row.region,
        prizeTitle: row.prizeTitle,
        awardedAt: row.awardedAt,
        revealedTarget: row.revealedTarget,
        revealedNonce: row.revealedNonce,
        commitmentHash: row.commitmentHash,
      })),
    );
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run convex/winners.test.ts`
Expected: PASS, 2 tests. If `ctx.storage.store(...)` isn't the right call for this installed `convex-test` version, check its documentation/source for the actual storage-testing helper and adapt — the test's intent (a real stored file whose id round-trips through `ctx.storage.getUrl`) is what matters, not this exact call.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add convex/winners.ts convex/winners.test.ts
git commit -m "feat: add the public winner archive query"
```

---

### Task 5: The claim page becomes a real upload form

**Files:**
- Modify: `app/claim/[reference]/page.tsx`

**Interfaces:**
- Consumes: `api.claims.getMyClaim`, `api.claims.generateDocumentUploadUrl`, `api.claims.registerUploadedDocument`, `api.claims.submitClaimDocuments`
- Produces: nothing downstream

- [ ] **Step 1: Rewrite the page as a client component**

Replace `app/claim/[reference]/page.tsx` in full. The static educational sections (steps, "nobody will ever ask you to pay", support) are preserved unchanged from the current file — only the top imports, the component signature, and what replaces the old "Reference in this link" section change:

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DocumentShell } from "@/app/components/DocumentShell";
import { BRAND } from "@/app/lib/brand.ts";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Confirm you control this account",
    body: "You sign in to the account that produced the winning entry. A claim cannot be transferred to another account or another person.",
  },
  {
    title: "Verify who you are",
    body: "Government-issued photo identification, your legal first and last name, and your date of birth. We check that you meet the minimum age and that the details match the account.",
  },
  {
    title: "Verify where you live",
    body: "Proof of address in an eligible jurisdiction. Eligibility is decided by where you live, so this cannot be skipped.",
  },
  {
    title: "Sign the affidavit and publicity release",
    body: "An eligibility affidavit confirming you meet the rules, and a publicity release. Accepting the prize requires the release, because winners are published by name and photograph.",
  },
  {
    title: "Provide a photograph",
    body: "A photograph of you for the winner archive, published alongside your name and your city or region.",
  },
  {
    title: "Tax paperwork, only if the prize requires it",
    body: "For prizes of $600 or more, a completed W-9 carrying your SSN or ITIN. Below that threshold no tax form is requested, and none should be sent. The number itself is never stored in our database.",
  },
  {
    title: "Review, then fulfilment",
    body: "We check everything against the Official Rules and tell you the outcome. Once approved, the prize is arranged and its progress is shown here.",
  },
];

type DocType = "photo_id" | "proof_of_address" | "winner_photo";
const DOC_LABELS: Record<DocType, string> = {
  photo_id: "Government photo ID",
  proof_of_address: "Proof of address",
  winner_photo: "Photo for the winner archive",
};

/**
 * One file input that uploads and registers itself the moment a file is
 * picked. No completion callback: `claim` in the parent comes from a
 * reactive `useQuery`, so the moment `registerDocument` commits, the query
 * re-fires and `registeredTypes` updates on its own — an explicit callback
 * here would just be a second, redundant way of learning the same thing.
 */
function DocumentField({
  reference,
  type,
  registered,
}: {
  reference: string;
  type: DocType;
  registered: boolean;
}) {
  const generateUploadUrl = useMutation(api.claims.generateDocumentUploadUrl);
  const registerDocument = useMutation(api.claims.registerUploadedDocument);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const url = await generateUploadUrl({ reference });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await response.json();
      await registerDocument({ reference, type, storageId });
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Could not upload that file. Check it is a JPEG, PNG or PDF under 10MB and try again.");
    }
  };

  return (
    <div className="mt-3.5">
      <label className="block text-sm font-semibold text-ink">
        {DOC_LABELS[type]} {registered && <span className="text-ink-soft">— received</span>}
      </label>
      <input
        type="file"
        accept={type === "winner_photo" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
        onChange={onChange}
        disabled={status === "uploading"}
        className="mt-1.5 text-sm"
      />
      {status === "uploading" && <p className="mt-1 text-sm text-ink-soft">Uploading…</p>}
      {error && <p role="alert" className="mt-1 text-sm text-ink-soft">{error}</p>}
    </div>
  );
}

function ClaimForm({ reference }: { reference: string }) {
  const claim = useQuery(api.claims.getMyClaim, { reference });
  const submit = useMutation(api.claims.submitClaimDocuments);
  const [legalName, setLegalName] = useState("");
  const [publicDisplayName, setPublicDisplayName] = useState("");
  const [affidavitAccepted, setAffidavitAccepted] = useState(false);
  const [publicityReleaseAccepted, setPublicityReleaseAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (claim === undefined) return <p className="mt-3.5">Loading your claim…</p>;
  if (claim === null) {
    return (
      <p className="mt-3.5">
        We could not find a claim matching this link for your signed-in account. If you believe
        this is wrong, contact{" "}
        <Link href="/legal/contact" className="underline">
          support
        </Link>
        .
      </p>
    );
  }

  const registeredTypes = new Set(claim.documents.map((d) => d.type));
  const allDocumentsIn =
    registeredTypes.has("photo_id") &&
    registeredTypes.has("proof_of_address") &&
    registeredTypes.has("winner_photo");

  if (claim.claim.status !== "potential_winner") {
    return (
      <p className="mt-3.5">
        Your claim's current status is <strong>{claim.claim.status.replace(/_/g, " ")}</strong>.
      </p>
    );
  }

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submit({
        reference,
        legalName,
        publicDisplayName: publicDisplayName || undefined,
        affidavitAccepted,
        publicityReleaseAccepted,
      });
    } catch {
      setError("Something went wrong submitting your claim. Nothing was lost — try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3.5">
      <label className="block text-sm font-semibold text-ink">Legal first and last name</label>
      <input
        type="text"
        value={legalName}
        onChange={(e) => setLegalName(e.target.value)}
        className="mt-1.5 w-full max-w-[28rem] border border-ink/25 px-2 py-1.5 text-sm"
      />

      <label className="mt-3.5 block text-sm font-semibold text-ink">
        Name as you'd like it published (optional — leave blank to use your legal name)
      </label>
      <input
        type="text"
        value={publicDisplayName}
        onChange={(e) => setPublicDisplayName(e.target.value)}
        className="mt-1.5 w-full max-w-[28rem] border border-ink/25 px-2 py-1.5 text-sm"
      />

      {(["photo_id", "proof_of_address", "winner_photo"] as const).map((type) => (
        <DocumentField
          key={type}
          reference={reference}
          type={type}
          registered={registeredTypes.has(type)}
        />
      ))}

      <label className="mt-3.5 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={affidavitAccepted}
          onChange={(e) => setAffidavitAccepted(e.target.checked)}
          className="mt-0.5"
        />
        I confirm, under penalty of perjury, that I meet the eligibility requirements in the{" "}
        <Link href="/rules" className="underline">
          Official Rules
        </Link>
        .
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={publicityReleaseAccepted}
          onChange={(e) => setPublicityReleaseAccepted(e.target.checked)}
          className="mt-0.5"
        />
        I agree to the publicity release: my name and photograph may be published as a winner.
      </label>

      {error && <p role="alert" className="mt-2 text-sm text-ink-soft">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || !allDocumentsIn || !legalName || !affidavitAccepted || !publicityReleaseAccepted}
        className="btn-primary mt-3.5"
      >
        {submitting ? "Submitting…" : "Submit claim"}
      </button>
    </div>
  );
}

export default function ClaimPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const shown = decodeURIComponent(reference).toUpperCase().slice(0, 32);
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <DocumentShell
      title="Your claim"
      standfirst="If you have reached a winning result, this is the process that follows. Nothing here is automatic, and nothing is decided until verification is complete."
    >
      <section>
        <h2>Reference in this link</h2>
        <p>
          <span className="font-display tracking-[0.06em]">{shown}</span>
        </p>
        {isLoading ? (
          <p className="mt-3.5">Checking your account…</p>
        ) : !isAuthenticated ? (
          <p className="mt-3.5">
            <Link href="/sign-in" className="underline">
              Sign in
            </Link>{" "}
            with the account that produced this result to continue your claim.
          </p>
        ) : (
          <ClaimForm reference={reference} />
        )}
      </section>

      <section>
        <h2>What a winning result actually means</h2>
        <p>
          A winning result makes you a <strong>potential winner</strong>. It does not
          mean you have won. The campaign pauses while your eligibility is verified,
          and the prize is only awarded once that verification is complete.
        </p>
      </section>

      <section>
        <h2>The steps</h2>
        <ol className="mt-3 list-decimal pl-5">
          {STEPS.map((step) => (
            <li key={step.title} className="mt-3">
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>How your documents are handled</h2>
        <p>
          Verification documents are held in restricted storage, are never publicly
          accessible, and are reachable only by you and by a reviewer. They are used to
          confirm eligibility and fulfil the prize, and for nothing else.
        </p>
        <p>
          What gets published is your name (or the name you choose to publish), your
          region, the prize, and your photograph. Your date of birth, identification
          documents, address, and tax information are never published.
        </p>
      </section>

      <section>
        <h2>Nobody will ever ask you to pay</h2>
        <p>
          There is no fee, no deposit, no shipping charge and no tax payment to us at
          any stage. If anyone contacts you asking for money to release a {BRAND.name}
          prize, it is a fraud and not from us. Please{" "}
          <Link href="/legal/abuse" className="underline">
            report it
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Support</h2>
        <p>
          Questions about a claim go to support, and the{" "}
          <Link href="/rules" className="underline">
            Official Rules
          </Link>{" "}
          govern anything this page summarises.
        </p>
      </section>
    </DocumentShell>
  );
}
```

Note: this file drops its `export const metadata` (a `"use client"` file cannot export metadata, the same constraint `app/rules/page.tsx` worked around with a Server Component — this page needs live per-user queries immediately on load, which the rules page didn't, so it takes the client-component side of that trade-off instead). Page title falls back to the root layout's default; that's an accepted, minor regression, not silently dropped — note it in your task report.

- [ ] **Step 2: Run the type checker and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no new errors beyond the known pre-existing stale-codegen category, if any.

- [ ] **Step 3: Manually verify in a browser**

Start the dev server, seed a campaign, force a win the same way `convex/admin.test.ts`'s `readyClaim` helper does (via `npx convex run` calls or the Convex dashboard), and walk through: sign in, visit `/claim/<reference>`, upload three files, check both boxes, submit, confirm the status readout updates.

- [ ] **Step 4: Commit**

```bash
git add app/claim/[reference]/page.tsx
git commit -m "feat: wire the claim page to real document upload and submission"
```

---

### Task 6: Admin review UI

**Files:**
- Create: `app/admin/page.tsx`, `app/admin/claims/[claimId]/page.tsx`

**Interfaces:**
- Consumes: `api.admin.listPendingClaims`, `api.admin.getClaimDetail`, `api.admin.approveClaim`, `api.admin.rejectClaim`, `api.admin.purgeClaimDocuments`
- Produces: nothing downstream

Deliberately unstyled beyond what's needed for usability — this is an internal tool, not a public surface, per the design's explicit polish decision.

- [ ] **Step 1: Write the pending-claims list**

Create `app/admin/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function AdminClaimsPage() {
  const rows = useQuery(api.admin.listPendingClaims, {});

  if (rows === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Claims under review ({rows.length})</h1>
      {rows.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Reference</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Prize</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Region</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Birthdate</th>
              <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.claim._id}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.claim.claimReference}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.prizeTitle}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.region}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.birthDate}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  <Link href={`/admin/claims/${row.claim._id}`}>Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

`NOT_ADMIN`/`NOT_AUTHENTICATED` thrown by the query surfaces through Convex React's error boundary behavior as an unhandled query error by default; wrap the query read defensively so a non-admin sees a plain message instead of a broken page:

Revise the component body to catch this via a simple try state — replace the top of the function with:

```tsx
export default function AdminClaimsPage() {
  const rows = useQuery(api.admin.listPendingClaims, {});
```

stays as-is for the loading/empty/table cases; Convex's `useQuery` throws synchronously on a query error, so wrap the page in a minimal error boundary. Add this above the component:

```tsx
import { Component, type ReactNode } from "react";

class AdminGate extends Component<{ children: ReactNode }, { errored: boolean }> {
  state = { errored: false };
  static getDerivedStateFromError() {
    return { errored: true };
  }
  render() {
    if (this.state.errored) {
      return <p style={{ padding: 24 }}>Not authorized.</p>;
    }
    return this.props.children;
  }
}
```

And export the page wrapped:

```tsx
export default function AdminClaimsPageRoute() {
  return (
    <AdminGate>
      <AdminClaimsPage />
    </AdminGate>
  );
}
```

(Rename the original default export to `AdminClaimsPage`, a named, non-default function, and keep the new wrapped component as the file's default export.)

- [ ] **Step 2: Write the claim detail/review page**

Create `app/admin/claims/[claimId]/page.tsx`:

```tsx
"use client";

import { use, useState, Component, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

class AdminGate extends Component<{ children: ReactNode }, { errored: boolean }> {
  state = { errored: false };
  static getDerivedStateFromError() {
    return { errored: true };
  }
  render() {
    if (this.state.errored) return <p style={{ padding: 24 }}>Not authorized.</p>;
    return this.props.children;
  }
}

function ClaimDetail({ claimId }: { claimId: Id<"claims"> }) {
  const detail = useQuery(api.admin.getClaimDetail, { claimId });
  const approve = useMutation(api.admin.approveClaim);
  const reject = useMutation(api.admin.rejectClaim);
  const purge = useMutation(api.admin.purgeClaimDocuments);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (detail === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  const onApprove = async () => {
    setBusy(true);
    try {
      await approve({ claimId });
      router.push("/admin");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approval failed.");
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!reason) {
      setMessage("A rejection reason is required.");
      return;
    }
    setBusy(true);
    try {
      await reject({ claimId, reason });
      router.push("/admin");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Rejection failed.");
      setBusy(false);
    }
  };

  const onPurge = async () => {
    setBusy(true);
    try {
      await purge({ claimId });
      setMessage("Documents purged.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Purge failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>Claim {detail.claim.claimReference}</h1>
      <p>Status: {detail.claim.status}</p>
      <p>Legal name: {detail.claim.legalName}</p>
      <p>Self-certified region: {detail.region}</p>
      <p>Self-certified birthdate: {detail.birthDate}</p>

      <h2>Documents</h2>
      <ul>
        {detail.documents.map((doc) => (
          <li key={doc.type}>
            {doc.type}:{" "}
            {doc.url ? (
              <a href={doc.url} target="_blank" rel="noreferrer">
                view
              </a>
            ) : (
              "unavailable"
            )}
          </li>
        ))}
      </ul>

      {message && <p role="alert">{message}</p>}

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={onApprove} disabled={busy}>
          Approve
        </button>
        <input
          type="text"
          placeholder="Rejection reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="button" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={onPurge} disabled={busy}>
          Purge documents
        </button>
      </div>
    </div>
  );
}

export default function ClaimDetailPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);
  return (
    <AdminGate>
      <ClaimDetail claimId={claimId as Id<"claims">} />
    </AdminGate>
  );
}
```

- [ ] **Step 3: Run the type checker and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no new errors.

- [ ] **Step 4: Manually verify in a browser**

As a non-admin (or signed out), visiting `/admin` shows "Not authorized." As an admin (flip a user's `role` via the Convex dashboard), it lists claims created by Task 5's manual test, and Approve/Reject/Purge each work and reflect in `/winners` (once Task 7... — there is no Task 7; verify against `npx convex run winners:listWinners '{}'` from the CLI instead, since the frontend read of it is this same task's sibling, already built in Task 4's backend and wired in the next step).

- [ ] **Step 5: Commit**

```bash
git add app/admin
git commit -m "feat: add the admin claim review UI"
```

---

### Task 7: The winners page becomes real

**Files:**
- Modify: `app/winners/page.tsx`

**Interfaces:**
- Consumes: `api.winners.listWinners`
- Produces: nothing downstream

- [ ] **Step 1: Replace the static list with a live query**

`app/winners/page.tsx` currently renders a single static "no draw has been won yet" block. Replace just that block — keep the "What gets published" and "How you can check a draw was fair" sections unchanged — by converting the page to fetch winners server-side via `fetchQuery` (the same pattern `app/rules/page.tsx` already uses for a public, unauthenticated read that still needs to keep `export const metadata`):

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { DocumentShell } from "@/app/components/DocumentShell";
import { BRAND } from "@/app/lib/brand.ts";
import { api } from "@/convex/_generated/api";

export const metadata: Metadata = {
  title: `Winners — ${BRAND.name}`,
  description:
    `Every confirmed ${BRAND.name} winner. The archive is empty until the first draw is won.`,
};

export default async function WinnersPage() {
  const winners = await fetchQuery(api.winners.listWinners, {});

  return (
    <DocumentShell
      title="Winners"
      standfirst="Every confirmed winner appears here, by name and photograph, with the prize they won."
    >
      <section>
        {winners.length === 0 ? (
          <div className="mt-2 border border-dashed border-ink/25 px-5 py-8 text-center">
            <p className="font-display text-sm uppercase tracking-[0.14em] text-ink">
              No draw has been won yet
            </p>
            <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-ink-soft">
              {BRAND.name} has not yet awarded a prize. When the first draw is won and the
              winner is verified, they will be published here — and this page will
              never contain anyone who was not.
            </p>
            <p className="mt-4">
              <Link href="/" className="text-sm underline">
                Go and spin
              </Link>
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-5">
            {winners.map((winner) => (
              <li key={winner.commitmentHash + winner.awardedAt} className="border border-ink/15 p-4">
                {winner.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={winner.photoUrl} alt={winner.publicDisplayName} width={96} height={96} />
                )}
                <p className="font-display text-sm uppercase tracking-[0.1em] text-ink">
                  {winner.publicDisplayName} — {winner.region}
                </p>
                <p className="text-sm text-ink-soft">{winner.prizeTitle}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Revealed target: {winner.revealedTarget} · nonce: {winner.revealedNonce} ·
                  commitment: {winner.commitmentHash}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>What gets published</h2>
        <p>
          Accepting a prize requires a publicity release, so winners are not
          anonymous. For each winner we publish their name (or their chosen public
          display name), their region, the prize they won, the date, and their
          photograph.
        </p>
        <p>
          We never publish a date of birth, an address, identification documents,
          tax information, or any contact detail. Verification records are stored
          separately from this archive so that unpublishable information has no path
          to this page.
        </p>
      </section>

      <section>
        <h2>How you can check a draw was fair</h2>
        <p>
          Each campaign&rsquo;s winning entry number is drawn and sealed before the
          first entry, and a cryptographic commitment to it is published when the
          campaign opens. When a campaign ends, the number and its nonce are
          revealed here alongside the winner.
        </p>
        <p>
          Anyone can then recompute the commitment from the revealed values and
          confirm it matches what was published beforehand — which is what makes
          &ldquo;the winner was decided in advance and could not be changed&rdquo; a
          checkable statement rather than a promise. See the{" "}
          <Link href="/rules" className="underline">
            Official Rules
          </Link>{" "}
          for the full mechanism.
        </p>
      </section>
    </DocumentShell>
  );
}
```

Using a plain `<img>` here (not `next/image`) matches this being a Convex-hosted URL with no configured Next.js image domain — `next/image` would need `next.config.ts` updated to allow `*.convex.cloud`, which is out of scope for this task; the eslint-disable comment is honest about why, not a silent workaround.

- [ ] **Step 2: Run the type checker and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no new errors.

- [ ] **Step 3: Manually verify in a browser**

Visit `/winners` with an empty archive (unchanged empty state), then again after approving a claim via Task 6's admin UI — confirm the winner renders with a working photo URL and the revealed target/nonce/commitment values.

- [ ] **Step 4: Commit**

```bash
git add app/winners/page.tsx
git commit -m "feat: publish approved winners to /winners"
```
