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
