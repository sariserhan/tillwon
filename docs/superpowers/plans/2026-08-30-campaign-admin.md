# Campaign Admin (Launch a New Campaign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin a real way to launch a new campaign through the app — create a
sponsor/prize/campaign/rules atomically as a `draft`, then explicitly activate it
(sealing the cryptographic commitment) — replacing the current CLI-only,
developer-only path.

**Architecture:** One new backend file (`convex/campaignAdmin.ts`) holding one atomic
creation mutation, two read queries, and an admin-facing activation action; one small
modification to `convex/winnerEngine.ts`'s existing `sealTarget` to add the
`draft → live` transition and the single-active-campaign guarantee as part of its own
transaction; three frontend surfaces under `app/admin/campaigns/`.

**Tech Stack:** Next.js App Router, Convex (mutations/actions/queries), TypeScript,
`convex-test`/vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-campaign-admin-design.md` (read this too —
it has the full reasoning behind every decision below, including three real issues
the user found reviewing the first draft and how each was fixed).

## Global Constraints

- **Node 22**, `allowImportingTsExtensions: true` — keep explicit `.ts` extensions on
  relative imports inside `convex/` non-test files (test files omit them, matching
  every existing `convex/*.test.ts`).
- **`npx convex codegen` does not deploy code** — only `npx convex dev` (interactive
  or `--once`) actually pushes to the deployment and regenerates
  `convex/_generated/*` against the live schema. Run `npx convex dev --once` after
  adding new exported functions, before assuming a stale-type error is a real bug.
  This repo commits `convex/_generated/*` to git.
- **Monetary values are integer cents.** `prizes.estimatedRetailValue` is cents; the
  frontend's dollar-denominated inputs must convert (`Math.round(dollars * 100)`)
  before sending to the mutation.
- **A reference alone is never authorization; a foreign key is never trusted without
  confirming what it points to.** Every `sponsorId`/`prizeId` used in this plan is
  looked up and checked for existence before being written into a new row.
- **Every mutation that changes state writes an audit entry** via `writeAudit`
  (`convex/lib/audit.ts`).
- **The admin UI (`app/admin/*`) is deliberately unstyled** — inline `style={{}}`,
  no Tailwind classes, no design-system investment. This is a plan-mandated,
  already-approved decision from the original claim-verification plan, not an
  oversight — do not flag it in review.
- **No client-supplied numeric/string field is trusted without a positive-integer or
  format check** where the schema expects one — mirrors `winnerEngine.ts`'s
  `sealTarget`'s existing `Number.isInteger(...) && ... > 0` style.
- **A plan-level addition not in the spec, flagged here so it isn't mistaken for
  scope creep:** the spec's Frontend section describes a campaign detail page
  showing "every field the campaign was created with," but the spec's Backend
  section never defines a single-campaign detail query (only `listCampaigns`, a
  list/summary shape). Task 3 below adds `getCampaignDetail` to close that gap —
  small, necessary, and exactly the kind of implementation-precision task the
  spec's own "Resolved during spec self-review" section already models.

---

### Task 1: `sealTarget` gains the `draft → live` transition and the single-active-campaign guarantee

**Files:**
- Modify: `convex/winnerEngine.ts`
- Modify: `convex/winnerEngine.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sealTarget` now also transitions `status` to `"live"` on success, and
  throws `"ANOTHER_CAMPAIGN_ACTIVE"` if any campaign other than the one being sealed
  already has `status: "live"` or `"winner_pending"`. Both are new, load-bearing
  behaviors every later task in this plan depends on.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("sealTarget", ...)` block in `convex/winnerEngine.test.ts`,
right after the existing `"refuses a target outside the shard range..."` test
(before its closing `});`):

```typescript
  it("flips a draft campaign to live when sealing it", async () => {
    const campaignId = await t.run(async (ctx) => {
      const c = await ctx.db.query("campaigns").first();
      await ctx.db.patch(c!._id, { status: "draft" });
      return c!._id;
    });

    await t.mutation(internal.winnerEngine.sealTarget, {
      campaignId,
      winningShard: 3,
      winningCount: 7,
      nonce: "deadbeef",
      commitmentHash: await commitmentFor(3, 7, "deadbeef"),
    });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign!.status).toBe("live");
  });

  it("refuses to seal a second campaign while another is already live or winner_pending, and writes nothing", async () => {
    const firstCampaignId = await t.run(async (ctx) => {
      const c = await ctx.db.query("campaigns").first();
      return c!._id;
    });

    await t.mutation(internal.winnerEngine.sealTarget, {
      campaignId: firstCampaignId,
      winningShard: 3,
      winningCount: 7,
      nonce: "deadbeef",
      commitmentHash: await commitmentFor(3, 7, "deadbeef"),
    });

    const secondCampaignId = await t.run(async (ctx) => {
      const first = (await ctx.db.get(firstCampaignId))!;
      return await ctx.db.insert("campaigns", {
        slug: "second-campaign",
        title: "Second campaign",
        description: "d",
        sponsorId: first.sponsorId,
        prizeId: first.prizeId,
        status: "draft",
        startAt: Date.now(),
        dailySpins: 10,
        resetTimezone: "UTC",
        resetHour: 0,
        reelColumns: 3,
        projectedVolume: 1000,
        oddsDenominator: 1000,
        shardCount: 16,
        commitmentHash: "PENDING_ACTIVATION",
        eligibleCountries: ["US"],
        eligibleRegions: ["NY"],
        minimumAge: 18,
        requireEmailVerification: true,
        activeRulesVersion: 1,
        disqualificationPolicy: "resume_campaign",
      });
    });

    await expect(
      t.mutation(internal.winnerEngine.sealTarget, {
        campaignId: secondCampaignId,
        winningShard: 1,
        winningCount: 1,
        nonce: "cafebabe",
        commitmentHash: await commitmentFor(1, 1, "cafebabe"),
      }),
    ).rejects.toThrow("ANOTHER_CAMPAIGN_ACTIVE");

    const { secondCampaign, secrets } = await t.run(async (ctx) => ({
      secondCampaign: await ctx.db.get(secondCampaignId),
      secrets: await ctx.db.query("campaignSecrets").collect(),
    }));
    expect(secondCampaign!.status).toBe("draft");
    // Only the first campaign's secret exists — the second seal attempt wrote nothing.
    expect(secrets).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/winnerEngine.test.ts`
Expected: FAIL — the first new test fails because `campaign!.status` is still
`"draft"` (nothing patches it yet); the second fails because nothing throws
`ANOTHER_CAMPAIGN_ACTIVE` (the second seal currently succeeds).

- [ ] **Step 3: Modify `sealTarget`**

In `convex/winnerEngine.ts`, `sealTarget`'s handler currently reads (existing
code, shown for context — do not duplicate, this is what's already there):

```typescript
    // Sealing twice would let a second target replace the committed one, which is
    // exactly the tampering the commitment exists to prevent.
    const existing = await ctx.db
      .query("campaignSecrets")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .unique();
    if (existing !== null) throw new Error("TARGET_ALREADY_SEALED");

    await ctx.db.insert("campaignSecrets", {
```

Insert this new block between the `TARGET_ALREADY_SEALED` check and the
`campaignSecrets` insert:

```typescript
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
```

Then change the existing commitment-hash patch line, near the bottom of the
handler, from:

```typescript
    await ctx.db.patch(args.campaignId, { commitmentHash: args.commitmentHash });
```

to:

```typescript
    // Sealed, therefore exclusively playable — both belong in the one transaction
    // that actually enforces them, not split across a pre-check and a separate
    // write. Backward-compatible with the existing CLI flow: seedCampaign already
    // sets status "live" before this runs, so re-patching it to "live" is a no-op.
    await ctx.db.patch(args.campaignId, {
      commitmentHash: args.commitmentHash,
      status: "live",
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/winnerEngine.test.ts`
Expected: PASS, all tests in the file (the two new ones plus every pre-existing
one — confirming this change is backward-compatible with the existing
seed-then-activate CLI flow, since every existing test in this file goes through
`seedCampaign` first, which already sets `status: "live"`).

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass (this touches shared, heavily-depended-on code — confirm
nothing elsewhere broke).

- [ ] **Step 6: Commit**

```bash
git add convex/winnerEngine.ts convex/winnerEngine.test.ts
git commit -m "feat: seal a target atomically flips the campaign live and enforces single-active-campaign"
```

---

### Task 2: `convex/campaignAdmin.ts` — `createDraftCampaign`

**Files:**
- Create: `convex/campaignAdmin.ts`
- Create: `convex/campaignAdmin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`convex/lib/admin.ts`); `writeAudit`
  (`convex/lib/audit.ts`); `resolveTier` (`convex/lib/tiers.ts`);
  `ELIGIBLE_JURISDICTIONS`, `MINIMUM_AGE` (`convex/lib/jurisdictions.ts`).
- Produces: `api.campaignAdmin.createDraftCampaign(args) → Id<"campaigns">` — the
  exact args shape is given in Step 3 below. Later tasks in this plan call this
  function by that exact signature.

- [ ] **Step 1: Write the failing tests**

Create `convex/campaignAdmin.test.ts`:

```typescript
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { ELIGIBLE_JURISDICTIONS } from "./lib/jurisdictions.ts";

const modules = import.meta.glob("./**/*.*s");

async function asAdmin(t: ReturnType<typeof convexTest>) {
  const as = t.withIdentity({ subject: "clerk_admin", email: "admin@example.com" });
  const userId = await as.mutation(api.users.ensureUser, {});
  await t.run((ctx) => ctx.db.patch(userId, { role: "admin" }));
  return as;
}

const NEW_PRIZE_ARGS = {
  kind: "new" as const,
  sponsor: {
    name: "Acme Corp",
    websiteUrl: "https://acme.example",
    ctaLabel: "Visit Acme",
    ctaUrl: "https://acme.example",
    description: "A sponsor",
    contactName: "Jane Admin",
    contactEmail: "jane@acme.example",
  },
  title: "$100 Gift Card",
  description: "A gift card",
  estimatedRetailValueCents: 10_000,
  fulfillmentType: "digital" as const,
  fulfillmentNotes: "Emailed after approval",
};

const CAMPAIGN_ARGS = {
  title: "Fall Giveaway",
  description: "A fall giveaway",
  dailySpins: 10,
  resetTimezone: "America/New_York",
  resetHour: 0,
  targetVolume: 1000,
  disqualificationPolicy: "resume_campaign" as const,
  rulesContent: "Official rules text.",
};

describe("createDraftCampaign", () => {
  it("creates a new sponsor, prize, campaign and rules row, all as draft", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);

    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });

    const { campaign, prize, sponsor, rules } = await t.run(async (ctx) => {
      const campaign = (await ctx.db.get(campaignId))!;
      const prize = (await ctx.db.get(campaign.prizeId))!;
      const sponsor = (await ctx.db.get(campaign.sponsorId))!;
      const rules = await ctx.db
        .query("campaignRules")
        .withIndex("by_campaign_version", (q) => q.eq("campaignId", campaignId).eq("version", 1))
        .unique();
      return { campaign, prize, sponsor, rules };
    });

    expect(campaign.status).toBe("draft");
    expect(campaign.commitmentHash).toBe("PENDING_ACTIVATION");
    expect(campaign.projectedVolume).toBe(1000);
    expect(campaign.oddsDenominator).toBe(1000);
    expect(campaign.shardCount).toBe(16);
    expect(campaign.eligibleRegions).toHaveLength(ELIGIBLE_JURISDICTIONS.length);
    expect(campaign.minimumAge).toBe(18);
    expect(campaign.reelColumns).toBe(3); // $100 is tier 1

    expect(prize.title).toBe("$100 Gift Card");
    expect(prize.sponsorId).toBe(sponsor._id);
    expect(sponsor.name).toBe("Acme Corp");
    expect(sponsor.status).toBe("active");

    expect(rules).not.toBeNull();
    expect(rules!.noPurchaseStatement).toContain("No purchase necessary");
    expect(rules!.content).toBe("Official rules text.");
  });

  it("computes reelColumns from the prize's tier, not a fixed default", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);

    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: { ...NEW_PRIZE_ARGS, estimatedRetailValueCents: 20_000 }, // $200, tier 2
    });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign!.reelColumns).toBe(4);
  });

  it("reuses an existing prize and its sponsor, creating no new sponsor row", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);

    const firstCampaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const firstCampaign = (await t.run((ctx) => ctx.db.get(firstCampaignId)))!;
    const sponsorCountBefore = await t.run((ctx) => ctx.db.query("sponsors").collect());

    const secondCampaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      title: "Second Giveaway",
      prize: { kind: "existing", prizeId: firstCampaign.prizeId },
    });

    const [secondCampaign, sponsorCountAfter] = await t.run(async (ctx) => [
      await ctx.db.get(secondCampaignId),
      await ctx.db.query("sponsors").collect(),
    ]);
    expect(secondCampaign!.prizeId).toBe(firstCampaign.prizeId);
    expect(secondCampaign!.sponsorId).toBe(firstCampaign.sponsorId);
    expect(sponsorCountAfter).toHaveLength(sponsorCountBefore.length);
  });

  it("throws PRIZE_NOT_FOUND for a prize id that doesn't exist", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const bogusId = await t.run(async (ctx) => {
      const sponsorId = await ctx.db.insert("sponsors", {
        name: "temp",
        slug: "temp",
        websiteUrl: "https://example.invalid",
        ctaLabel: "",
        ctaUrl: "https://example.invalid",
        description: "",
        contactName: "",
        contactEmail: "",
        status: "active",
      });
      const id = await ctx.db.insert("prizes", {
        title: "temp",
        description: "d",
        estimatedRetailValue: 100,
        currency: "USD",
        quantity: 1,
        imageStorageIds: [],
        fulfillmentType: "digital",
        fulfillmentNotes: "",
        sponsorId,
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      admin.mutation(api.campaignAdmin.createDraftCampaign, {
        ...CAMPAIGN_ARGS,
        prize: { kind: "existing", prizeId: bogusId },
      }),
    ).rejects.toThrow("PRIZE_NOT_FOUND");
  });

  it("throws CAMPAIGN_TITLE_REQUIRED for a blank title", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.campaignAdmin.createDraftCampaign, {
        ...CAMPAIGN_ARGS,
        title: "   ",
        prize: NEW_PRIZE_ARGS,
      }),
    ).rejects.toThrow("CAMPAIGN_TITLE_REQUIRED");
  });

  it("throws PRIZE_VALUE_INVALID for a non-positive prize value", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.campaignAdmin.createDraftCampaign, {
        ...CAMPAIGN_ARGS,
        prize: { ...NEW_PRIZE_ARGS, estimatedRetailValueCents: 0 },
      }),
    ).rejects.toThrow("PRIZE_VALUE_INVALID");
  });

  it("throws TARGET_VOLUME_INVALID for a non-positive target volume", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.campaignAdmin.createDraftCampaign, {
        ...CAMPAIGN_ARGS,
        targetVolume: 0,
        prize: NEW_PRIZE_ARGS,
      }),
    ).rejects.toThrow("TARGET_VOLUME_INVALID");
  });

  it("throws INVALID_TIMEZONE for a made-up timezone name", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.campaignAdmin.createDraftCampaign, {
        ...CAMPAIGN_ARGS,
        resetTimezone: "Not/A_Real_Zone",
        prize: NEW_PRIZE_ARGS,
      }),
    ).rejects.toThrow("INVALID_TIMEZONE");
  });

  it("de-duplicates campaign and sponsor slugs when names collide", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);

    const firstId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const secondId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });

    const [first, second, sponsors] = await t.run(async (ctx) => [
      await ctx.db.get(firstId),
      await ctx.db.get(secondId),
      await ctx.db.query("sponsors").collect(),
    ]);
    expect(first!.slug).toBe("fall-giveaway");
    expect(second!.slug).toBe("fall-giveaway-2");
    // Both calls use the same title AND the same sponsor name ("Acme Corp"),
    // since each creates its own new sponsor — the sponsor slug must dedupe too.
    expect(sponsors.map((s) => s.slug).sort()).toEqual(["acme-corp", "acme-corp-2"]);
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(
      as.mutation(api.campaignAdmin.createDraftCampaign, {
        ...CAMPAIGN_ARGS,
        prize: NEW_PRIZE_ARGS,
      }),
    ).rejects.toThrow("NOT_ADMIN");
  });

  it("writes an audit entry for the created campaign", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const entries = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
        .collect(),
    );
    expect(entries.some((e) => e.action === "campaign.created")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/campaignAdmin.test.ts`
Expected: FAIL — `Cannot find module './campaignAdmin'` (the file doesn't exist yet).

- [ ] **Step 3: Write `convex/campaignAdmin.ts`**

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin.ts";
import { writeAudit } from "./lib/audit.ts";
import { resolveTier, formatOdds } from "./lib/tiers.ts";
import { ELIGIBLE_JURISDICTIONS, MINIMUM_AGE } from "./lib/jurisdictions.ts";
import type { MutationCtx } from "./_generated/server";

const MAX_NAME_LENGTH = 120;
const DEFAULT_SHARD_COUNT = 16;
const NO_PURCHASE_STATEMENT =
  "No purchase necessary. A purchase will not increase your chances of winning. Eligibility restrictions apply. See Official Rules.";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueCampaignSlug(ctx: MutationCtx, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (
    (await ctx.db.query("campaigns").withIndex("by_slug", (q) => q.eq("slug", candidate)).unique()) !== null
  ) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

async function uniqueSponsorSlug(ctx: MutationCtx, base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  while (
    (await ctx.db.query("sponsors").withIndex("by_slug", (q) => q.eq("slug", candidate)).unique()) !== null
  ) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

const prizeArg = v.union(
  v.object({
    kind: v.literal("existing"),
    prizeId: v.id("prizes"),
  }),
  v.object({
    kind: v.literal("new"),
    sponsor: v.object({
      name: v.string(),
      websiteUrl: v.string(),
      ctaLabel: v.string(),
      ctaUrl: v.string(),
      description: v.string(),
      contactName: v.string(),
      contactEmail: v.string(),
    }),
    title: v.string(),
    description: v.string(),
    estimatedRetailValueCents: v.number(),
    currency: v.optional(v.string()),
    quantity: v.optional(v.number()),
    fulfillmentType: v.union(
      v.literal("physical"),
      v.literal("digital"),
      v.literal("experience"),
    ),
    fulfillmentNotes: v.string(),
  }),
);

/**
 * One mutation, one transaction: sponsor (if new), prize (if new), campaign, and
 * its Official Rules all get created together, or none of them do. A prize
 * belongs to exactly one sponsor (prizes.sponsorId), so reusing a prize reuses
 * its sponsor too — there is no combination that creates a new sponsor for a
 * reused prize.
 */
export const createDraftCampaign = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    prize: prizeArg,
    dailySpins: v.number(),
    resetTimezone: v.string(),
    resetHour: v.number(),
    targetVolume: v.number(),
    shardCount: v.optional(v.number()),
    disqualificationPolicy: v.union(
      v.literal("resume_campaign"),
      v.literal("select_alternate"),
      v.literal("end_campaign"),
    ),
    rulesContent: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const title = args.title.trim();
    if (title.length === 0) throw new Error("CAMPAIGN_TITLE_REQUIRED");
    if (title.length > MAX_NAME_LENGTH) throw new Error("CAMPAIGN_TITLE_TOO_LONG");

    let sponsorId;
    let prizeId;
    let prizeValueCents: number;

    if (args.prize.kind === "existing") {
      const prize = await ctx.db.get(args.prize.prizeId);
      if (prize === null) throw new Error("PRIZE_NOT_FOUND");
      const sponsor = await ctx.db.get(prize.sponsorId);
      if (sponsor === null) throw new Error("SPONSOR_NOT_FOUND");
      sponsorId = sponsor._id;
      prizeId = prize._id;
      prizeValueCents = prize.estimatedRetailValue;
    } else {
      const sponsorName = args.prize.sponsor.name.trim();
      if (sponsorName.length === 0) throw new Error("SPONSOR_NAME_REQUIRED");
      if (sponsorName.length > MAX_NAME_LENGTH) throw new Error("SPONSOR_NAME_TOO_LONG");

      const prizeTitle = args.prize.title.trim();
      if (prizeTitle.length === 0) throw new Error("PRIZE_TITLE_REQUIRED");
      if (prizeTitle.length > MAX_NAME_LENGTH) throw new Error("PRIZE_TITLE_TOO_LONG");

      if (
        !Number.isInteger(args.prize.estimatedRetailValueCents) ||
        args.prize.estimatedRetailValueCents <= 0
      ) {
        throw new Error("PRIZE_VALUE_INVALID");
      }
      const quantity = args.prize.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("PRIZE_QUANTITY_INVALID");

      const sponsorSlug = await uniqueSponsorSlug(ctx, slugify(sponsorName));
      sponsorId = await ctx.db.insert("sponsors", {
        name: sponsorName,
        slug: sponsorSlug,
        websiteUrl: args.prize.sponsor.websiteUrl,
        ctaLabel: args.prize.sponsor.ctaLabel,
        ctaUrl: args.prize.sponsor.ctaUrl,
        description: args.prize.sponsor.description,
        contactName: args.prize.sponsor.contactName,
        contactEmail: args.prize.sponsor.contactEmail,
        status: "active",
      });

      prizeId = await ctx.db.insert("prizes", {
        title: prizeTitle,
        description: args.prize.description,
        estimatedRetailValue: args.prize.estimatedRetailValueCents,
        currency: args.prize.currency ?? "USD",
        quantity,
        imageStorageIds: [],
        fulfillmentType: args.prize.fulfillmentType,
        fulfillmentNotes: args.prize.fulfillmentNotes,
        sponsorId,
      });
      prizeValueCents = args.prize.estimatedRetailValueCents;
    }

    if (!Number.isInteger(args.dailySpins) || args.dailySpins <= 0) {
      throw new Error("DAILY_SPINS_INVALID");
    }
    if (!Number.isInteger(args.resetHour) || args.resetHour < 0 || args.resetHour > 23) {
      throw new Error("RESET_HOUR_INVALID");
    }
    // resetDate.ts's resetDateKey already assumes a valid IANA name on every
    // single spin — catching a bad one here, once, is much cheaper than letting
    // it crash the first spin on the campaign instead.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: args.resetTimezone });
    } catch {
      throw new Error("INVALID_TIMEZONE");
    }

    if (!Number.isInteger(args.targetVolume) || args.targetVolume <= 0) {
      throw new Error("TARGET_VOLUME_INVALID");
    }
    const shardCount = args.shardCount ?? DEFAULT_SHARD_COUNT;
    if (!Number.isInteger(shardCount) || shardCount <= 0) {
      throw new Error("SHARD_COUNT_INVALID");
    }

    const reelColumns = resolveTier(prizeValueCents).columns;
    const campaignSlug = await uniqueCampaignSlug(ctx, slugify(title));

    const campaignId = await ctx.db.insert("campaigns", {
      slug: campaignSlug,
      title,
      description: args.description,
      sponsorId,
      prizeId,
      status: "draft",
      startAt: Date.now(),
      dailySpins: args.dailySpins,
      resetTimezone: args.resetTimezone,
      resetHour: args.resetHour,
      reelColumns,
      projectedVolume: args.targetVolume,
      oddsDenominator: args.targetVolume,
      shardCount,
      commitmentHash: "PENDING_ACTIVATION",
      eligibleCountries: ["US"],
      eligibleRegions: [...ELIGIBLE_JURISDICTIONS],
      minimumAge: MINIMUM_AGE,
      requireEmailVerification: true,
      activeRulesVersion: 1,
      disqualificationPolicy: args.disqualificationPolicy,
    });

    await ctx.db.insert("campaignRules", {
      campaignId,
      version: 1,
      title: "Official Rules",
      content: args.rulesContent,
      noPurchaseStatement: NO_PURCHASE_STATEMENT,
      oddsStatement: `Stated odds of ${formatOdds(args.targetVolume)} are based on the expected number of eligible entries; actual odds depend on the total entries received.`,
      effectiveAt: Date.now(),
    });

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.created",
      entityType: "campaigns",
      entityId: campaignId,
      after: { slug: campaignSlug, title, sponsorId, prizeId, targetVolume: args.targetVolume },
    });

    return campaignId;
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/campaignAdmin.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add convex/campaignAdmin.ts convex/campaignAdmin.test.ts
git commit -m "feat: add the atomic campaign-creation mutation"
```

---

### Task 3: Read queries — `listPrizes`, `listCampaigns`, `getCampaignDetail`

**Files:**
- Modify: `convex/campaignAdmin.ts`
- Modify: `convex/campaignAdmin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`.
- Produces: `api.campaignAdmin.listPrizes() → Array<{ _id, title, estimatedRetailValue, sponsorName }>`;
  `api.campaignAdmin.listCampaigns() → Array<{ _id, slug, title, status, sponsorName, prizeTitle }>`,
  newest first; `api.campaignAdmin.getCampaignDetail({ campaignId }) → { campaign, sponsorName, prizeTitle, prizeValueCents }`.

- [ ] **Step 1: Write the failing tests**

Append to `convex/campaignAdmin.test.ts`, after the `describe("createDraftCampaign", ...)` block's closing `});`:

```typescript
describe("listPrizes", () => {
  it("lists prizes with their sponsor name", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const prizes = await admin.query(api.campaignAdmin.listPrizes, {});
    expect(prizes).toHaveLength(1);
    expect(prizes[0]).toMatchObject({ title: "$100 Gift Card", sponsorName: "Acme Corp" });
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.query(api.campaignAdmin.listPrizes, {})).rejects.toThrow("NOT_ADMIN");
  });
});

describe("listCampaigns", () => {
  it("lists campaigns newest first with sponsor/prize display fields", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const firstId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const first = (await t.run((ctx) => ctx.db.get(firstId)))!;
    const secondId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      title: "Second Giveaway",
      prize: { kind: "existing", prizeId: first.prizeId },
    });

    const rows = await admin.query(api.campaignAdmin.listCampaigns, {});
    expect(rows).toHaveLength(2);
    expect(rows[0]._id).toBe(secondId);
    expect(rows[0]).toMatchObject({
      status: "draft",
      sponsorName: "Acme Corp",
      prizeTitle: "$100 Gift Card",
    });
  });
});

describe("getCampaignDetail", () => {
  it("returns the full campaign plus sponsor/prize display fields", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });

    const detail = await admin.query(api.campaignAdmin.getCampaignDetail, { campaignId });
    expect(detail.campaign.title).toBe("Fall Giveaway");
    expect(detail.sponsorName).toBe("Acme Corp");
    expect(detail.prizeTitle).toBe("$100 Gift Card");
    expect(detail.prizeValueCents).toBe(10_000);
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(
      as.query(api.campaignAdmin.getCampaignDetail, { campaignId }),
    ).rejects.toThrow("NOT_ADMIN");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/campaignAdmin.test.ts`
Expected: FAIL — `listPrizes`/`listCampaigns`/`getCampaignDetail` don't exist yet.

- [ ] **Step 3: Add the three queries to `convex/campaignAdmin.ts`**

Add `query` to the existing `import { mutation } from "./_generated/server";` line
(making it `import { mutation, query } from "./_generated/server";`), then append:

```typescript
export const listPrizes = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const prizes = await ctx.db.query("prizes").collect();
    return await Promise.all(
      prizes.map(async (prize) => {
        const sponsor = await ctx.db.get(prize.sponsorId);
        return {
          _id: prize._id,
          title: prize.title,
          estimatedRetailValue: prize.estimatedRetailValue,
          sponsorName: sponsor?.name ?? null,
        };
      }),
    );
  },
});

export const listCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const campaigns = await ctx.db.query("campaigns").collect();
    const sorted = campaigns.sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(
      sorted.map(async (campaign) => {
        const [sponsor, prize] = await Promise.all([
          ctx.db.get(campaign.sponsorId),
          ctx.db.get(campaign.prizeId),
        ]);
        return {
          _id: campaign._id,
          slug: campaign.slug,
          title: campaign.title,
          status: campaign.status,
          sponsorName: sponsor?.name ?? null,
          prizeTitle: prize?.title ?? null,
        };
      }),
    );
  },
});

export const getCampaignDetail = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    const [sponsor, prize] = await Promise.all([
      ctx.db.get(campaign.sponsorId),
      ctx.db.get(campaign.prizeId),
    ]);
    return {
      campaign,
      sponsorName: sponsor?.name ?? null,
      prizeTitle: prize?.title ?? null,
      prizeValueCents: prize?.estimatedRetailValue ?? null,
    };
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/campaignAdmin.test.ts`
Expected: PASS, 15 tests total (11 from Task 2 plus 4 new).

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add convex/campaignAdmin.ts convex/campaignAdmin.test.ts
git commit -m "feat: add campaign/prize listing and detail queries"
```

---

### Task 4: `campaignAdmin.activate` (admin-facing activation)

**Files:**
- Modify: `convex/campaignAdmin.ts`
- Modify: `convex/campaignAdmin.test.ts`
- Modify: `convex/winnerEngine.ts` (doc comment only)

**Interfaces:**
- Consumes: `internal.winnerEngine.activateCampaign` (`convex/winnerEngine.ts`,
  already exists); `sealTarget`'s new `ANOTHER_CAMPAIGN_ACTIVE`/`status: "live"`
  behavior from Task 1.
- Produces: `api.campaignAdmin.activate({ campaignId }) → null`.

- [ ] **Step 1: Write the failing tests**

Append to `convex/campaignAdmin.test.ts`:

```typescript
describe("activate", () => {
  it("seals the target and flips the campaign to live", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });

    await admin.action(api.campaignAdmin.activate, { campaignId });

    const [campaign, secret] = await t.run(async (ctx) => [
      await ctx.db.get(campaignId),
      await ctx.db
        .query("campaignSecrets")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
        .unique(),
    ]);
    expect(campaign!.status).toBe("live");
    expect(campaign!.commitmentHash).not.toBe("PENDING_ACTIVATION");
    expect(secret).not.toBeNull();
  });

  it("refuses to activate a campaign that isn't a draft", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    await admin.action(api.campaignAdmin.activate, { campaignId });

    await expect(admin.action(api.campaignAdmin.activate, { campaignId })).rejects.toThrow(
      "CAMPAIGN_NOT_DRAFT",
    );
  });

  it("refuses activation while another campaign is already live, end to end", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const firstId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    await admin.action(api.campaignAdmin.activate, { campaignId: firstId });
    const first = (await t.run((ctx) => ctx.db.get(firstId)))!;

    const secondId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      title: "Second Giveaway",
      prize: { kind: "existing", prizeId: first.prizeId },
    });

    await expect(admin.action(api.campaignAdmin.activate, { campaignId: secondId })).rejects.toThrow(
      "ANOTHER_CAMPAIGN_ACTIVE",
    );

    const second = await t.run((ctx) => ctx.db.get(secondId));
    expect(second!.status).toBe("draft");
  });

  it("writes an audit entry only on a successful activation, never on a failed attempt", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    await admin.action(api.campaignAdmin.activate, { campaignId });
    await expect(admin.action(api.campaignAdmin.activate, { campaignId })).rejects.toThrow();

    const entries = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
        .collect(),
    );
    expect(entries.filter((e) => e.action === "campaign.activated")).toHaveLength(1);
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.action(api.campaignAdmin.activate, { campaignId })).rejects.toThrow("NOT_ADMIN");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/campaignAdmin.test.ts`
Expected: FAIL — `api.campaignAdmin.activate` doesn't exist yet.

- [ ] **Step 3: Add `activate` to `convex/campaignAdmin.ts`**

Change the top import line from
`import { mutation, query } from "./_generated/server";` to
`import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";`,
and add `import { internal } from "./_generated/api";` alongside the other
imports. Then append:

```typescript
export const checkActivatable = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "draft") throw new Error("CAMPAIGN_NOT_DRAFT");
    return null;
  },
});

export const recordActivationAudit = internalMutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.activated",
      entityType: "campaigns",
      entityId: args.campaignId,
      before: { status: "draft" },
      after: { status: "live", commitmentHash: "sealed" },
    });
    return null;
  },
});

/**
 * The admin-facing entry point. Named `activate`, not `activateCampaign` —
 * winnerEngine.ts already exports an internalAction called activateCampaign, and
 * this calls straight into it rather than duplicating its randomness-drawing
 * logic. checkActivatable is a fast-fail UX nicety only, not the exclusivity
 * guarantee — that's sealTarget's own authoritative, transactional check (Task 1).
 * A request that passes checkActivatable can still legitimately fail inside
 * activateCampaign/sealTarget if another activation won the race in between —
 * that's the guarantee working as intended, not a bug to route around here.
 */
export const activate = action({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(internal.campaignAdmin.checkActivatable, { campaignId: args.campaignId });
    await ctx.runAction(internal.winnerEngine.activateCampaign, { campaignId: args.campaignId });
    await ctx.runMutation(internal.campaignAdmin.recordActivationAudit, {
      campaignId: args.campaignId,
    });
    return null;
  },
});
```

- [ ] **Step 4: Update the stale doc comment on `internalAction activateCampaign`**

In `convex/winnerEngine.ts`, `activateCampaign`'s doc comment currently says:

```
 * Internal, and it takes no odds parameters. A caller-supplied shardCount would
 * let anyone seal a campaign at odds of their choosing (`shardCount: 1` makes the
 * next spin win) or seal a target outside the range spinExecute assigns, making
 * the campaign unwinnable. Both come from the campaign document instead. There is
 * no admin UI yet, so activation happens through `npx convex run`, which reaches
 * internal functions with deploy credentials — the right trust level for sealing
 * a prize.
```

Replace the last two sentences (from `There is no admin UI yet` through the end)
with:

```
 * The admin-facing entry point is campaignAdmin.activate, which requireAdmin-gates
 * the caller before reaching here — this function itself stays internal-only and
 * trusts its caller completely, the same way every other internalAction/internalMutation
 * in this codebase does.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run convex/campaignAdmin.test.ts`
Expected: PASS, 20 tests total.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add convex/campaignAdmin.ts convex/campaignAdmin.test.ts convex/winnerEngine.ts
git commit -m "feat: add the admin-facing campaign activation action"
```

---

### Task 5: Frontend — `app/admin/campaigns/new/page.tsx`

**Files:**
- Create: `app/admin/campaigns/new/page.tsx`

**Interfaces:**
- Consumes: `api.campaignAdmin.createDraftCampaign`, `api.campaignAdmin.listPrizes`
  (both from Tasks 2-3); `AuthErrorBoundary` (`app/components/AuthErrorBoundary.tsx`);
  `friendlyErrorMessage` (`app/lib/convexError.ts`); `resolveTier`,
  `defaultOddsDenominator` (`convex/lib/tiers.ts`).
- Produces: nothing downstream except the route itself.

- [ ] **Step 1: Write the page**

Create `app/admin/campaigns/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";
import { resolveTier, defaultOddsDenominator } from "@/convex/lib/tiers.ts";

type FulfillmentType = "physical" | "digital" | "experience";
type DisqualificationPolicy = "resume_campaign" | "select_alternate" | "end_campaign";

function NewCampaignForm() {
  const prizes = useQuery(api.campaignAdmin.listPrizes, {});
  const createDraftCampaign = useMutation(api.campaignAdmin.createDraftCampaign);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dailySpins, setDailySpins] = useState("10");
  const [resetTimezone, setResetTimezone] = useState("UTC");
  const [resetHour, setResetHour] = useState("0");
  const [targetVolume, setTargetVolume] = useState("1000");
  const [disqualificationPolicy, setDisqualificationPolicy] =
    useState<DisqualificationPolicy>("resume_campaign");
  const [rulesContent, setRulesContent] = useState("");

  const [prizeMode, setPrizeMode] = useState<"existing" | "new">("new");
  const [existingPrizeId, setExistingPrizeId] = useState("");

  const [sponsorName, setSponsorName] = useState("");
  const [sponsorWebsiteUrl, setSponsorWebsiteUrl] = useState("");
  const [sponsorCtaLabel, setSponsorCtaLabel] = useState("");
  const [sponsorCtaUrl, setSponsorCtaUrl] = useState("");
  const [sponsorDescription, setSponsorDescription] = useState("");
  const [sponsorContactName, setSponsorContactName] = useState("");
  const [sponsorContactEmail, setSponsorContactEmail] = useState("");
  const [prizeTitle, setPrizeTitle] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [prizeValueDollars, setPrizeValueDollars] = useState("100");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("digital");
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A live hint, not an auto-fill — an admin who already typed a value
  // shouldn't have it silently overwritten as the prize value changes.
  const suggestedVolume =
    prizeMode === "new" && prizeValueDollars
      ? defaultOddsDenominator(resolveTier(Math.round(Number(prizeValueDollars) * 100)))
      : null;

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const campaignId = await createDraftCampaign({
        title,
        description,
        dailySpins: Number(dailySpins),
        resetTimezone,
        resetHour: Number(resetHour),
        targetVolume: Number(targetVolume),
        disqualificationPolicy,
        rulesContent,
        prize:
          prizeMode === "existing"
            ? { kind: "existing" as const, prizeId: existingPrizeId as Id<"prizes"> }
            : {
                kind: "new" as const,
                sponsor: {
                  name: sponsorName,
                  websiteUrl: sponsorWebsiteUrl,
                  ctaLabel: sponsorCtaLabel,
                  ctaUrl: sponsorCtaUrl,
                  description: sponsorDescription,
                  contactName: sponsorContactName,
                  contactEmail: sponsorContactEmail,
                },
                title: prizeTitle,
                description: prizeDescription,
                estimatedRetailValueCents: Math.round(Number(prizeValueDollars) * 100),
                fulfillmentType,
                fulfillmentNotes,
              },
      });
      router.push(`/admin/campaigns/${campaignId}`);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not create the campaign."));
      setBusy(false);
    }
  };

  if (prizes === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>New campaign</h1>

      <h2>Campaign</h2>
      <label style={{ display: "block", marginTop: 12 }}>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Daily spins
        <input
          type="number"
          value={dailySpins}
          onChange={(e) => setDailySpins(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Reset timezone (IANA name, e.g. America/New_York)
        <input
          type="text"
          value={resetTimezone}
          onChange={(e) => setResetTimezone(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Reset hour (0-23, local to the timezone above)
        <input
          type="number"
          value={resetHour}
          onChange={(e) => setResetHour(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Target volume (stated odds denominator — the campaign is designed to
        produce a winner around this many total spins)
        <input
          type="number"
          value={targetVolume}
          onChange={(e) => setTargetVolume(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      {suggestedVolume !== null && (
        <p style={{ marginTop: 4 }}>Suggested starting point for this prize&rsquo;s tier: {suggestedVolume}</p>
      )}
      <label style={{ display: "block", marginTop: 12 }}>
        Disqualification policy
        <select
          value={disqualificationPolicy}
          onChange={(e) => setDisqualificationPolicy(e.target.value as DisqualificationPolicy)}
          style={{ display: "block" }}
        >
          <option value="resume_campaign">Resume campaign (target unchanged)</option>
          <option value="select_alternate">Select an alternate winner (re-seal)</option>
          <option value="end_campaign">End the campaign</option>
        </select>
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Official Rules text
        <textarea
          value={rulesContent}
          onChange={(e) => setRulesContent(e.target.value)}
          rows={8}
          style={{ display: "block", width: "100%" }}
        />
      </label>

      <h2 style={{ marginTop: 24 }}>Prize</h2>
      <label style={{ display: "block" }}>
        <input
          type="radio"
          checked={prizeMode === "existing"}
          onChange={() => setPrizeMode("existing")}
        />{" "}
        Use an existing prize
      </label>
      <label style={{ display: "block" }}>
        <input type="radio" checked={prizeMode === "new"} onChange={() => setPrizeMode("new")} /> Create
        a new prize
      </label>

      {prizeMode === "existing" ? (
        <label style={{ display: "block", marginTop: 12 }}>
          Prize
          <select
            value={existingPrizeId}
            onChange={(e) => setExistingPrizeId(e.target.value)}
            style={{ display: "block" }}
          >
            <option value="">Select a prize…</option>
            {prizes.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title} ({p.sponsorName})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <h3 style={{ marginTop: 12 }}>Sponsor</h3>
          <label style={{ display: "block" }}>
            Name
            <input
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Website URL
            <input
              type="text"
              value={sponsorWebsiteUrl}
              onChange={(e) => setSponsorWebsiteUrl(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            CTA label
            <input
              type="text"
              value={sponsorCtaLabel}
              onChange={(e) => setSponsorCtaLabel(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            CTA URL
            <input
              type="text"
              value={sponsorCtaUrl}
              onChange={(e) => setSponsorCtaUrl(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Description
            <input
              type="text"
              value={sponsorDescription}
              onChange={(e) => setSponsorDescription(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Contact name
            <input
              type="text"
              value={sponsorContactName}
              onChange={(e) => setSponsorContactName(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Contact email
            <input
              type="email"
              value={sponsorContactEmail}
              onChange={(e) => setSponsorContactEmail(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <h3 style={{ marginTop: 12 }}>Prize</h3>
          <label style={{ display: "block" }}>
            Title
            <input
              type="text"
              value={prizeTitle}
              onChange={(e) => setPrizeTitle(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Description
            <input
              type="text"
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Estimated retail value (USD)
            <input
              type="number"
              value={prizeValueDollars}
              onChange={(e) => setPrizeValueDollars(e.target.value)}
              style={{ display: "block" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Fulfillment type
            <select
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value as FulfillmentType)}
              style={{ display: "block" }}
            >
              <option value="digital">Digital</option>
              <option value="physical">Physical</option>
              <option value="experience">Experience</option>
            </select>
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Fulfillment notes
            <input
              type="text"
              value={fulfillmentNotes}
              onChange={(e) => setFulfillmentNotes(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
        </>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || (prizeMode === "existing" && !existingPrizeId)}
        style={{ marginTop: 24 }}
      >
        {busy ? "Creating…" : "Create draft campaign"}
      </button>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <AuthErrorBoundary>
      <NewCampaignForm />
    </AuthErrorBoundary>
  );
}
```

- [ ] **Step 2: Run the type checker and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no new errors.

- [ ] **Step 3: Manually verify in a browser**

Sign in as an admin (flip a user's `role` via the Convex dashboard, matching how
earlier claim-verification tasks did this), visit `/admin/campaigns/new`, fill in
the form with "Create a new prize" selected, submit, and confirm it redirects to
`/admin/campaigns/<id>`. Then visit `/admin/campaigns/new` again, switch to "Use
an existing prize," confirm the prize just created appears in the dropdown, and
submit a second campaign reusing it.

- [ ] **Step 4: Commit**

```bash
git add app/admin/campaigns/new/page.tsx
git commit -m "feat: add the new-campaign admin form"
```

---

### Task 6: Frontend — `app/admin/campaigns/[campaignId]/page.tsx`

**Files:**
- Create: `app/admin/campaigns/[campaignId]/page.tsx`

**Interfaces:**
- Consumes: `api.campaignAdmin.getCampaignDetail`, `api.campaignAdmin.activate`
  (Tasks 3-4); `AuthErrorBoundary`; `friendlyErrorMessage`.
- Produces: nothing downstream.

- [ ] **Step 1: Write the page**

Create `app/admin/campaigns/[campaignId]/page.tsx`:

```tsx
"use client";

import { use, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";

const REGISTRATION_THRESHOLD_CENTS = 500_000;

function CampaignDetail({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const detail = useQuery(api.campaignAdmin.getCampaignDetail, { campaignId });
  const activate = useAction(api.campaignAdmin.activate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (detail === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  const { campaign, sponsorName, prizeTitle, prizeValueCents } = detail;
  const isTier5Or6 = (prizeValueCents ?? 0) >= REGISTRATION_THRESHOLD_CENTS;

  const onActivate = async () => {
    if (
      !window.confirm(
        "Activate this campaign? This seals the cryptographic commitment and makes the campaign live immediately. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await activate({ campaignId });
      router.push("/admin");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Activation failed."));
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>{campaign.title}</h1>
      <p>Status: {campaign.status}</p>
      <p>Slug: {campaign.slug}</p>
      <p>Sponsor: {sponsorName}</p>
      <p>Prize: {prizeTitle}</p>
      <p>Daily spins: {campaign.dailySpins}</p>
      <p>
        Reset: {campaign.resetHour}:00 {campaign.resetTimezone}
      </p>
      <p>Target volume / stated odds: 1 in {campaign.oddsDenominator}</p>
      <p>Shard count: {campaign.shardCount}</p>
      <p>Reel columns: {campaign.reelColumns}</p>
      <p>Disqualification policy: {campaign.disqualificationPolicy}</p>

      {isTier5Or6 && (
        <p style={{ padding: 12, border: "1px solid #900", marginTop: 16 }}>
          This prize is $5,000 or more — NY/FL registration and bonding apply, and
          this system does not yet enforce a hard end date for that requirement
          (see ROADMAP.md). Confirm this has been handled outside the app before
          activating.
        </p>
      )}

      {message && <p role="alert">{message}</p>}

      {campaign.status === "draft" && (
        <button type="button" onClick={onActivate} disabled={busy} style={{ marginTop: 16 }}>
          {busy ? "Activating…" : "Activate"}
        </button>
      )}
    </div>
  );
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  return (
    <AuthErrorBoundary>
      <CampaignDetail campaignId={campaignId as Id<"campaigns">} />
    </AuthErrorBoundary>
  );
}
```

- [ ] **Step 2: Run the type checker and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no new errors.

- [ ] **Step 3: Manually verify in a browser**

As an admin, visit the detail page for the draft campaign created in Task 5's
verification, confirm every field renders, confirm the tier 5-6 warning does
**not** show (the seeded prize is $100), click Activate, confirm the
`window.confirm()` prompt, confirm it redirects to `/admin` and the campaign now
shows as `live`. Then create one more draft campaign with a prize valued at
$6,000 and confirm the warning banner appears on its detail page.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/campaigns/[campaignId]/page.tsx"
git commit -m "feat: add the campaign detail and activation admin page"
```

---

### Task 7: `app/admin/page.tsx` — surface campaigns and a "New campaign" link

**Files:**
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `api.campaignAdmin.listCampaigns` (Task 3).
- Produces: nothing downstream.

- [ ] **Step 1: Modify the page**

Replace `app/admin/page.tsx` in full:

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";

function CampaignsSection() {
  const campaigns = useQuery(api.campaignAdmin.listCampaigns, {});
  if (campaigns === undefined) return <p>Loading campaigns…</p>;

  return (
    <div style={{ marginBottom: 32 }}>
      <h1>
        Campaigns{" "}
        <Link href="/admin/campaigns/new" style={{ fontSize: "0.6em" }}>
          + New campaign
        </Link>
      </h1>
      {campaigns.length === 0 ? (
        <p>No campaigns yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Title</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Status</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Sponsor</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Prize</th>
              <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c._id}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.title}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.status}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.sponsorName}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.prizeTitle}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  <Link href={`/admin/campaigns/${c._id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AdminClaimsPage() {
  const rows = useQuery(api.admin.listPendingClaims, {});

  if (rows === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <CampaignsSection />

      <h2>Claims pending ({rows.length})</h2>
      {rows.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Reference</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Status</th>
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
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {row.claim.status.replace(/_/g, " ")}
                </td>
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

export default function AdminClaimsPageRoute() {
  return (
    <AuthErrorBoundary>
      <AdminClaimsPage />
    </AuthErrorBoundary>
  );
}
```

- [ ] **Step 2: Run the type checker and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no new errors.

- [ ] **Step 3: Manually verify in a browser**

As an admin, visit `/admin` and confirm the campaigns list appears above the
claims table, showing both campaigns created during Tasks 5-6's verification with
correct statuses, and that "+ New campaign" navigates to `/admin/campaigns/new`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: surface campaigns and a new-campaign link on the admin home page"
```
