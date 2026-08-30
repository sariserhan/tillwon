/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { commitmentFor } from "./winnerEngine";

const modules = import.meta.glob("./**/*.*s");

describe("commitmentFor", () => {
  it("is reproducible from the revealed target and nonce", async () => {
    const a = await commitmentFor(3, 41, "abc123");
    const b = await commitmentFor(3, 41, "abc123");
    expect(a).toEqual(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes if any component changes", async () => {
    const base = await commitmentFor(3, 41, "abc123");
    expect(await commitmentFor(4, 41, "abc123")).not.toEqual(base);
    expect(await commitmentFor(3, 42, "abc123")).not.toEqual(base);
    expect(await commitmentFor(3, 41, "abc124")).not.toEqual(base);
  });
});

describe("sealTarget", () => {
  let t: ReturnType<typeof convexTest>;
  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedCampaign, {});
  });

  it("creates one shard row per shard and a target inside range", async () => {
    const campaignId = await t.run(async (ctx) => {
      const c = await ctx.db.query("campaigns").first();
      return c!._id;
    });

    await t.mutation(internal.winnerEngine.sealTarget, {
      campaignId,
      winningShard: 3,
      winningCount: 7,
      nonce: "deadbeef",
      commitmentHash: await commitmentFor(3, 7, "deadbeef"),
    });

    const { shards, secret, campaign } = await t.run(async (ctx) => ({
      shards: await ctx.db.query("spinShards").collect(),
      secret: await ctx.db.query("campaignSecrets").first(),
      campaign: await ctx.db.get(campaignId),
    }));

    expect(shards).toHaveLength(16);
    expect(shards.every((s) => s.count === 0)).toBe(true);
    expect(secret).toMatchObject({ winningShard: 3, winningCount: 7 });
    expect(campaign!.commitmentHash).toEqual(
      await commitmentFor(3, 7, "deadbeef"),
    );
  });

  it("refuses a target outside the shard range the campaign actually assigns", async () => {
    const campaignId = await t.run(async (ctx) => {
      const c = await ctx.db.query("campaigns").first();
      return c!._id;
    });

    // 16 shards, so shard 16 is one past the end — spinExecute could never
    // assign it, and sealing it would produce a campaign nobody can win.
    await expect(
      t.mutation(internal.winnerEngine.sealTarget, {
        campaignId,
        winningShard: 16,
        winningCount: 7,
        nonce: "deadbeef",
        commitmentHash: await commitmentFor(16, 7, "deadbeef"),
      }),
    ).rejects.toThrow("WINNING_SHARD_OUT_OF_RANGE");

    // shardSequence starts at 1, so count 0 is unreachable too.
    await expect(
      t.mutation(internal.winnerEngine.sealTarget, {
        campaignId,
        winningShard: 3,
        winningCount: 0,
        nonce: "deadbeef",
        commitmentHash: await commitmentFor(3, 0, "deadbeef"),
      }),
    ).rejects.toThrow("WINNING_COUNT_OUT_OF_RANGE");

    // Nothing was written: a rejected seal must leave the campaign sealable.
    const { secrets, shards } = await t.run(async (ctx) => ({
      secrets: await ctx.db.query("campaignSecrets").collect(),
      shards: await ctx.db.query("spinShards").collect(),
    }));
    expect(secrets).toHaveLength(0);
    expect(shards).toHaveLength(0);
  });

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
});

describe("activateCampaign", () => {
  let t: ReturnType<typeof convexTest>;
  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedCampaign, {});
  });

  it("draws the target from the campaign's own shardCount, not from a caller", async () => {
    const campaignId = await t.run(async (ctx) => {
      const c = await ctx.db.query("campaigns").first();
      return c!._id;
    });

    const commitmentHash = await t.action(internal.winnerEngine.activateCampaign, {
      campaignId,
    });

    const { secret, campaign, shards } = await t.run(async (ctx) => ({
      secret: await ctx.db.query("campaignSecrets").first(),
      campaign: await ctx.db.get(campaignId),
      shards: await ctx.db.query("spinShards").collect(),
    }));

    expect(shards).toHaveLength(campaign!.shardCount);
    expect(secret!.winningShard).toBeGreaterThanOrEqual(0);
    expect(secret!.winningShard).toBeLessThan(campaign!.shardCount);
    expect(secret!.winningCount).toBeGreaterThanOrEqual(1);
    expect(campaign!.commitmentHash).toEqual(commitmentHash);
    expect(commitmentHash).toEqual(
      await commitmentFor(secret!.winningShard, secret!.winningCount, secret!.nonce),
    );
  });
});
