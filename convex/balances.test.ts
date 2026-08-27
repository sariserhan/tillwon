/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

describe("balances", () => {
  let t: ReturnType<typeof convexTest>;
  let as: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedCampaign, {});
    as = t.withIdentity({ subject: "clerk_ada", email: "ada@example.com", emailVerified: true });
    await as.mutation(api.users.ensureUser, {});
  });

  it("reports the full allocation before any spin, without writing a row", async () => {
    const balance = await as.query(api.balances.getDailySpinBalance, {});
    expect(balance).toMatchObject({ allocated: 10, used: 0, remaining: 10 });

    // Lazily created: no cron fans rows out to every registered user at midnight.
    const rows = await t.run(async (ctx) => ctx.db.query("spinBalances").collect());
    expect(rows).toHaveLength(0);
  });

  it("derives remaining rather than storing it", async () => {
    const balance = await as.query(api.balances.getDailySpinBalance, {});
    expect(balance).not.toHaveProperty("remaining_stored");
    expect(balance!.remaining).toBe(balance!.allocated - balance!.used);
  });
});
