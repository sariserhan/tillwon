/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

describe("campaigns", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("returns null when no campaign is live", async () => {
    expect(await t.query(api.campaigns.getActiveCampaign, {})).toBeNull();
  });

  it("exposes the seeded campaign with its tier and odds", async () => {
    await t.mutation(internal.seed.seedCampaign, {});
    const active = await t.query(api.campaigns.getActiveCampaign, {});

    expect(active).not.toBeNull();
    expect(active!.campaign.status).toBe("live");
    expect(active!.prize.estimatedRetailValue).toBe(10_000);
    expect(active!.tier.tier).toBe(1);
    expect(active!.tier.columns).toBe(3);
    expect(active!.oddsDenominator).toBe(1_000);
    expect(active!.campaign.projectedVolume).toBe(active!.oddsDenominator);
    expect(active!.sponsor.name).toBe("TillWon");
    expect(active!.rules.noPurchaseStatement).toContain("No purchase necessary");
  });

  it("never exposes internal campaign fields, including a potential winner", async () => {
    await t.mutation(internal.seed.seedCampaign, {});

    // winner_pending is exactly the state this query still serves AND the state
    // where the internal fields are populated, so it is the case worth asserting.
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        clerkId: "clerk_winner",
        email: "winner@example.com",
        emailVerified: true,
        ageVerified: true,
        accountStatus: "active",
        role: "user",
        fraudRiskScore: 0,
        marketingConsent: false,
        dailyReminderConsent: false,
        totalSpins: 1,
        totalPotentialWins: 1,
      });
      const campaign = (await ctx.db.query("campaigns").first())!;
      await ctx.db.patch(campaign._id, {
        status: "winner_pending",
        potentialWinnerUserId: id,
        revealedTarget: "3:7",
        revealedNonce: "deadbeef",
      });
      return id;
    });

    const active = await t.query(api.campaigns.getActiveCampaign, {});
    expect(active).not.toBeNull();
    expect(active!.campaign.status).toBe("winner_pending");

    const body = JSON.stringify(active);
    expect(body).not.toContain(userId);
    expect(body).not.toContain("potentialWinnerUserId");
    expect(body).not.toContain("winningSpinId");
    expect(body).not.toContain("revealedTarget");
    expect(body).not.toContain("deadbeef");
  });

  it("exposes the winning spin's visual symbols and timestamp as public proof, once winningSpinId is set", async () => {
    await t.mutation(internal.seed.seedCampaign, {});

    const spinId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "clerk_winner",
        email: "winner@example.com",
        emailVerified: true,
        ageVerified: true,
        accountStatus: "active",
        role: "user",
        fraudRiskScore: 0,
        marketingConsent: false,
        dailyReminderConsent: false,
        totalSpins: 1,
        totalPotentialWins: 1,
      });
      const campaign = (await ctx.db.query("campaigns").first())!;
      const spinId = await ctx.db.insert("spins", {
        userId,
        campaignId: campaign._id,
        idempotencyKey: "win-1",
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
      await ctx.db.patch(campaign._id, {
        status: "winner_pending",
        winningSpinId: spinId,
        potentialWinnerUserId: userId,
      });
      return spinId;
    });

    const active = await t.query(api.campaigns.getActiveCampaign, {});
    expect(active!.winningReveal).toMatchObject({ symbols: ["SEVEN", "SEVEN", "SEVEN"] });
    expect(active!.winningReveal!.wonAt).toBeTypeOf("number");

    // Still never the sealed target itself, or the spin/user ids — only the
    // visual outcome (which is always the same for a jackpot by construction)
    // and when it happened.
    const body = JSON.stringify(active);
    expect(body).not.toContain(spinId);
    expect(body).not.toContain("winningSpinId");
  });

  it("returns winningReveal: null while the campaign is live (no winner yet)", async () => {
    await t.mutation(internal.seed.seedCampaign, {});
    const active = await t.query(api.campaigns.getActiveCampaign, {});
    expect(active!.winningReveal).toBeNull();
  });

  it("seeds an eligibility set of 46 states plus DC", async () => {
    await t.mutation(internal.seed.seedCampaign, {});
    const active = await t.query(api.campaigns.getActiveCampaign, {});
    expect(active!.campaign.eligibleRegions).toHaveLength(47);
    expect(active!.campaign.eligibleRegions).not.toContain("TN");
    expect(active!.campaign.minimumAge).toBe(18);
  });
});
