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
