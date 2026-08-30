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

async function createAndActivate(
  t: ReturnType<typeof convexTest>,
  admin: Awaited<ReturnType<typeof asAdmin>>,
  overrides: Partial<typeof CAMPAIGN_ARGS> = {},
) {
  const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
    ...CAMPAIGN_ARGS,
    ...overrides,
    prize: NEW_PRIZE_ARGS,
  });
  await admin.action(api.campaignAdmin.activate, { campaignId });
  return campaignId;
}

describe("suspendCampaign", () => {
  it("suspends a live campaign", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);

    await admin.mutation(api.campaignAdmin.suspendCampaign, { campaignId });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign!.status).toBe("suspended");
  });

  it("refuses to suspend a campaign that isn't live", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });

    await expect(
      admin.mutation(api.campaignAdmin.suspendCampaign, { campaignId }),
    ).rejects.toThrow("CAMPAIGN_NOT_LIVE");
  });

  it("writes an audit entry with the reason in metadata", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);

    await admin.mutation(api.campaignAdmin.suspendCampaign, {
      campaignId,
      reason: "Sponsor requested a pause",
    });

    const entries = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityType", "campaigns").eq("entityId", campaignId))
        .collect(),
    );
    const entry = entries.find((e) => e.action === "campaign.suspended");
    expect(entry).toBeDefined();
    expect(entry!.metadata).toMatchObject({ reason: "Sponsor requested a pause" });
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.mutation(api.campaignAdmin.suspendCampaign, { campaignId })).rejects.toThrow(
      "NOT_ADMIN",
    );
  });
});

describe("resumeCampaign", () => {
  it("resumes a suspended campaign back to live", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);
    await admin.mutation(api.campaignAdmin.suspendCampaign, { campaignId });

    await admin.mutation(api.campaignAdmin.resumeCampaign, { campaignId });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign!.status).toBe("live");
  });

  it("refuses to resume a campaign that isn't suspended", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);

    await expect(
      admin.mutation(api.campaignAdmin.resumeCampaign, { campaignId }),
    ).rejects.toThrow("CAMPAIGN_NOT_SUSPENDED");
  });

  it("refuses to resume while another campaign is already live, and leaves it suspended", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const firstId = await createAndActivate(t, admin);
    await admin.mutation(api.campaignAdmin.suspendCampaign, { campaignId: firstId });

    await createAndActivate(t, admin, {
      title: "Second Giveaway",
    });

    await expect(
      admin.mutation(api.campaignAdmin.resumeCampaign, { campaignId: firstId }),
    ).rejects.toThrow("ANOTHER_CAMPAIGN_ACTIVE");

    const stillSuspended = await t.run((ctx) => ctx.db.get(firstId));
    expect(stillSuspended!.status).toBe("suspended");
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);
    await admin.mutation(api.campaignAdmin.suspendCampaign, { campaignId });
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.mutation(api.campaignAdmin.resumeCampaign, { campaignId })).rejects.toThrow(
      "NOT_ADMIN",
    );
  });
});

describe("cancelCampaign", () => {
  it("cancels a live campaign", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);

    await admin.mutation(api.campaignAdmin.cancelCampaign, { campaignId });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign!.status).toBe("cancelled");
  });

  it("cancels a suspended campaign", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);
    await admin.mutation(api.campaignAdmin.suspendCampaign, { campaignId });

    await admin.mutation(api.campaignAdmin.cancelCampaign, { campaignId });

    const campaign = await t.run((ctx) => ctx.db.get(campaignId));
    expect(campaign!.status).toBe("cancelled");
  });

  it("refuses to cancel a draft campaign", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await admin.mutation(api.campaignAdmin.createDraftCampaign, {
      ...CAMPAIGN_ARGS,
      prize: NEW_PRIZE_ARGS,
    });

    await expect(
      admin.mutation(api.campaignAdmin.cancelCampaign, { campaignId }),
    ).rejects.toThrow("CAMPAIGN_NOT_CANCELLABLE");
  });

  it("refuses a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const admin = await asAdmin(t);
    const campaignId = await createAndActivate(t, admin);
    const as = t.withIdentity({ subject: "clerk_user", email: "user@example.com" });
    await as.mutation(api.users.ensureUser, {});
    await expect(as.mutation(api.campaignAdmin.cancelCampaign, { campaignId })).rejects.toThrow(
      "NOT_ADMIN",
    );
  });
});
