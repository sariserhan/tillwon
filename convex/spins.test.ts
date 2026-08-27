import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { isJackpot, type SymbolKey } from "./lib/symbols";
import { commitmentFor } from "./winnerEngine";

const modules = import.meta.glob("./**/*.*s");

// spinExecute spreads writes across `campaign.shardCount` (16) shards via
// Math.random() specifically so concurrent requests rarely conflict on the same
// row. That's correct for production, but it means a test that seals a target on
// a single shard and fires only 10 concurrent spins has no guarantee any of them
// land on that shard — P(miss) = (15/16)^10 ≈ 53%, so the brief's literal test
// would fail roughly half the time. Pinning Math.random to 0 forces every spin in
// this file onto shard 0, which removes that flakiness AND is the correct stress
// scenario for the guarantee under test: all ten transactions now race the exact
// same shard row, so the "exactly one winner" assertion is proven under maximum
// write contention rather than by chance dispersal.
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function ready(opts: { winningCount?: number } = {}) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seedCampaign, {});
  const campaignId = await t.run(async (ctx) => {
    const c = await ctx.db.query("campaigns").first();
    return c!._id;
  });
  // The seed leaves a campaign unsealed on purpose, so each test can choose a
  // target: a high one to guarantee losses, or 1 to force the winning entry.
  const winningCount = opts.winningCount ?? 999_999;
  await t.mutation(internal.winnerEngine.sealTarget, {
    campaignId,
    winningShard: 0,
    winningCount,
    nonce: "testnonce",
    commitmentHash: await commitmentFor(0, winningCount, "testnonce"),
  });

  const as = t.withIdentity({
    subject: "clerk_ada",
    email: "ada@example.com",
    emailVerified: true,
  });
  const userId = await as.mutation(api.users.ensureUser, {});
  await t.run(async (ctx) => {
    await ctx.db.patch(userId, { country: "US", region: "NY", birthDate: "1990-01-01" });
  });
  await as.mutation(api.rules.acceptRules, {});
  return { t, as, campaignId, userId };
}

const key = (n: number) => `key-${n}`;

describe("spinExecute", () => {
  it("returns the spec's response shape", async () => {
    const { as } = await ready();
    const result = await as.mutation(api.spins.spinExecute, {
      idempotencyKey: key(1),
      deviceHash: "dev",
    });
    expect(result).toMatchObject({
      isPotentialWinner: false,
      remainingSpins: 9,
      campaignStatus: "live",
    });
    expect(result.symbols).toHaveLength(3);
    expect(isJackpot(result.symbols)).toBe(false);
  });

  it("allows ten spins and refuses the eleventh", async () => {
    const { as } = await ready();
    for (let i = 0; i < 10; i++) {
      await as.mutation(api.spins.spinExecute, { idempotencyKey: key(i), deviceHash: "dev" });
    }
    await expect(
      as.mutation(api.spins.spinExecute, { idempotencyKey: key(99), deviceHash: "dev" }),
    ).rejects.toThrow("NO_SPINS_REMAINING");
  });

  it("replays an identical result for a repeated idempotency key", async () => {
    const { as, t } = await ready();
    const first = await as.mutation(api.spins.spinExecute, {
      idempotencyKey: key(1),
      deviceHash: "dev",
    });
    const second = await as.mutation(api.spins.spinExecute, {
      idempotencyKey: key(1),
      deviceHash: "dev",
    });
    expect(second).toEqual(first);
    const rows = await t.run(async (ctx) => ctx.db.query("spins").collect());
    expect(rows).toHaveLength(1);
  });

  it("never writes more spins than the balance allows under concurrency", async () => {
    const { as, t } = await ready();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        as
          .mutation(api.spins.spinExecute, { idempotencyKey: key(i), deviceHash: "dev" })
          .catch(() => null),
      ),
    );
    const rows = await t.run(async (ctx) => ctx.db.query("spins").collect());
    expect(rows).toHaveLength(10);
  });

  it("awards exactly one potential winner and locks the campaign", async () => {
    // The single most important test in the codebase: the winning entry is
    // reached by many parallel requests and must produce one winner, one claim.
    const { as, t } = await ready({ winningCount: 1 });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        as
          .mutation(api.spins.spinExecute, { idempotencyKey: key(i), deviceHash: "dev" })
          .catch(() => null),
      ),
    );

    const { winners, claims, campaign } = await t.run(async (ctx) => ({
      winners: (await ctx.db.query("spins").collect()).filter((s) => s.isPotentialWinner),
      claims: await ctx.db.query("claims").collect(),
      campaign: await ctx.db.query("campaigns").first(),
    }));

    expect(winners).toHaveLength(1);
    expect(isJackpot(winners[0].symbols as SymbolKey[])).toBe(true);
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe("potential_winner");
    expect(campaign!.status).toBe("winner_pending");
    expect(campaign!.winningSpinId).toEqual(winners[0]._id);
  });

  it("refuses further spins once a winner is pending", async () => {
    const { as } = await ready({ winningCount: 1 });
    await as.mutation(api.spins.spinExecute, { idempotencyKey: key(1), deviceHash: "dev" });
    await expect(
      as.mutation(api.spins.spinExecute, { idempotencyKey: key(2), deviceHash: "dev" }),
    ).rejects.toThrow("CAMPAIGN_NOT_LIVE");
  });

  it("refuses a caller who has not accepted the rules", async () => {
    const { t } = await ready();
    const asBob = t.withIdentity({
      subject: "clerk_bob",
      email: "bob@example.com",
      emailVerified: true,
    });
    const bobId = await asBob.mutation(api.users.ensureUser, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(bobId, { country: "US", region: "NY", birthDate: "1990-01-01" });
    });
    await expect(
      asBob.mutation(api.spins.spinExecute, { idempotencyKey: key(1), deviceHash: "dev" }),
    ).rejects.toThrow("RULES_NOT_ACCEPTED");

    // Nothing was consumed: a rejected spin must not decrement a balance.
    const rows = await t.run(async (ctx) => ctx.db.query("spinBalances").collect());
    expect(rows).toHaveLength(0);
  });

  it("refuses to spin a campaign whose target was never sealed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedCampaign, {});
    const as = t.withIdentity({
      subject: "clerk_ada",
      email: "ada@example.com",
      emailVerified: true,
    });
    const userId = await as.mutation(api.users.ensureUser, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        country: "US",
        region: "NY",
        birthDate: "1990-01-01",
      });
    });
    await as.mutation(api.rules.acceptRules, {});

    await expect(
      as.mutation(api.spins.spinExecute, { idempotencyKey: key(1), deviceHash: "dev" }),
    ).rejects.toThrow("CAMPAIGN_NOT_ACTIVATED");
  });
});
