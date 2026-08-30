import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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

function validateCampaignTitle(rawTitle: string): string {
  const title = rawTitle.trim();
  if (title.length === 0) throw new Error("CAMPAIGN_TITLE_REQUIRED");
  if (title.length > MAX_NAME_LENGTH) throw new Error("CAMPAIGN_TITLE_TOO_LONG");
  return title;
}

/** Shared by createDraftCampaign and updateDraftCampaign — returns the resolved shardCount. */
function validateCampaignSchedule(args: {
  dailySpins: number;
  resetHour: number;
  resetTimezone: string;
  targetVolume: number;
  shardCount?: number;
}): number {
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
  return shardCount;
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

    const title = validateCampaignTitle(args.title);

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

    const shardCount = validateCampaignSchedule(args);

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

/**
 * Only fields that can't affect an already-sealed target or a prize the admin
 * may have picked deliberately: prize/sponsor selection stays fixed once set —
 * changing it mid-draft is rare enough that delete-and-recreate covers it
 * without this mutation needing to re-derive reelColumns or reassign a prize.
 * The slug is likewise left alone; nothing has linked to it yet since the
 * campaign was never live, so there's nothing to keep stable, but regenerating
 * it here would just add a slug-collision case with no benefit.
 */
export const updateDraftCampaign = mutation({
  args: {
    campaignId: v.id("campaigns"),
    title: v.string(),
    description: v.string(),
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
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "draft") throw new Error("CAMPAIGN_NOT_DRAFT");

    const title = validateCampaignTitle(args.title);
    const shardCount = validateCampaignSchedule(args);

    await ctx.db.patch(args.campaignId, {
      title,
      description: args.description,
      dailySpins: args.dailySpins,
      resetTimezone: args.resetTimezone,
      resetHour: args.resetHour,
      projectedVolume: args.targetVolume,
      oddsDenominator: args.targetVolume,
      shardCount,
      disqualificationPolicy: args.disqualificationPolicy,
    });

    const rules = await ctx.db
      .query("campaignRules")
      .withIndex("by_campaign_version", (q) => q.eq("campaignId", args.campaignId).eq("version", 1))
      .unique();
    if (rules !== null) {
      await ctx.db.patch(rules._id, {
        content: args.rulesContent,
        oddsStatement: `Stated odds of ${formatOdds(args.targetVolume)} are based on the expected number of eligible entries; actual odds depend on the total entries received.`,
      });
    }

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.updated",
      entityType: "campaigns",
      entityId: args.campaignId,
      before: { title: campaign.title, targetVolume: campaign.projectedVolume },
      after: { title, targetVolume: args.targetVolume },
    });

    return null;
  },
});

export const deleteDraftCampaign = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "draft") throw new Error("CAMPAIGN_NOT_DRAFT");

    const rules = await ctx.db
      .query("campaignRules")
      .withIndex("by_campaign_version", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    for (const rule of rules) {
      await ctx.db.delete(rule._id);
    }
    await ctx.db.delete(args.campaignId);

    // sponsorId/prizeId deliberately left alone — either may be reused by
    // another campaign (createDraftCampaign's "existing" prize path).
    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.deleted",
      entityType: "campaigns",
      entityId: args.campaignId,
      before: { title: campaign.title, status: campaign.status },
    });

    return null;
  },
});

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

/** True if some other campaign already holds the one "playable" slot. Mirrors
 * winnerEngine.ts's sealTarget check — resumeCampaign needs the same guarantee,
 * since a campaign can go live→suspended→live without ever re-sealing. */
async function anotherCampaignIsActive(ctx: MutationCtx, excludingId: string): Promise<boolean> {
  const liveCampaigns = await ctx.db
    .query("campaigns")
    .withIndex("by_status", (q) => q.eq("status", "live"))
    .collect();
  const pendingCampaigns = await ctx.db
    .query("campaigns")
    .withIndex("by_status", (q) => q.eq("status", "winner_pending"))
    .collect();
  return [...liveCampaigns, ...pendingCampaigns].some((c) => c._id !== excludingId);
}

export const suspendCampaign = mutation({
  args: { campaignId: v.id("campaigns"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "live") throw new Error("CAMPAIGN_NOT_LIVE");

    await ctx.db.patch(args.campaignId, { status: "suspended" });

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.suspended",
      entityType: "campaigns",
      entityId: args.campaignId,
      before: { status: "live" },
      after: { status: "suspended" },
      metadata: args.reason !== undefined ? { reason: args.reason } : undefined,
    });

    return null;
  },
});

export const resumeCampaign = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "suspended") throw new Error("CAMPAIGN_NOT_SUSPENDED");

    // A second campaign could have been activated while this one sat
    // suspended — the single-active-campaign guarantee has to hold here too,
    // not just at the original activation.
    if (await anotherCampaignIsActive(ctx, args.campaignId)) {
      throw new Error("ANOTHER_CAMPAIGN_ACTIVE");
    }

    await ctx.db.patch(args.campaignId, { status: "live" });

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.resumed",
      entityType: "campaigns",
      entityId: args.campaignId,
      before: { status: "suspended" },
      after: { status: "live" },
    });

    return null;
  },
});

export const cancelCampaign = mutation({
  args: { campaignId: v.id("campaigns"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (campaign === null) throw new Error("CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "live" && campaign.status !== "suspended") {
      throw new Error("CAMPAIGN_NOT_CANCELLABLE");
    }

    await ctx.db.patch(args.campaignId, { status: "cancelled" });

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "campaign.cancelled",
      entityType: "campaigns",
      entityId: args.campaignId,
      before: { status: campaign.status },
      after: { status: "cancelled" },
      metadata: args.reason !== undefined ? { reason: args.reason } : undefined,
    });

    return null;
  },
});
