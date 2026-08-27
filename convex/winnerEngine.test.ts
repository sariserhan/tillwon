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
});
