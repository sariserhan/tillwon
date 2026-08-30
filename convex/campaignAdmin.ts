import { mutation, query } from "./_generated/server";
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
