/// <reference types="vite/client" />
import { describe, it, expect, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seedCampaign, {});
  return t;
}

async function makeUser(
  t: ReturnType<typeof convexTest>,
  patch: Record<string, unknown> = {},
) {
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
      ...patch,
    });
  });
  return { as, userId };
}

describe("eligibility", () => {
  let t: ReturnType<typeof convexTest>;
  beforeEach(async () => {
    t = await setup();
  });

  it("reports RULES_NOT_ACCEPTED before the user accepts", async () => {
    const { as } = await makeUser(t);
    const status = await as.query(api.eligibility.getEligibilityStatus, {});
    expect(status).toEqual({ eligible: false, reason: "RULES_NOT_ACCEPTED" });
  });

  it("becomes eligible once the current rules version is accepted", async () => {
    const { as } = await makeUser(t);
    await as.mutation(api.rules.acceptRules, {});
    expect(await as.query(api.eligibility.getEligibilityStatus, {})).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it("rejects an excluded region", async () => {
    const { as } = await makeUser(t, { region: "TN" });
    await as.mutation(api.rules.acceptRules, {});
    const status = await as.query(api.eligibility.getEligibilityStatus, {});
    expect(status.reason).toBe("INELIGIBLE_REGION");
  });

  it("rejects an under-age entrant", async () => {
    const { as } = await makeUser(t, { birthDate: "2015-01-01" });
    await as.mutation(api.rules.acceptRules, {});
    const status = await as.query(api.eligibility.getEligibilityStatus, {});
    expect(status.reason).toBe("UNDERAGE");
  });

  it("rejects an unverified email", async () => {
    const { as, userId } = await makeUser(t);
    await as.mutation(api.rules.acceptRules, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { emailVerified: false });
    });
    const status = await as.query(api.eligibility.getEligibilityStatus, {});
    expect(status.reason).toBe("EMAIL_UNVERIFIED");
  });

  it("rejects a restricted account", async () => {
    const { as, userId } = await makeUser(t);
    await as.mutation(api.rules.acceptRules, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { accountStatus: "suspended" });
    });
    const status = await as.query(api.eligibility.getEligibilityStatus, {});
    expect(status.reason).toBe("ACCOUNT_RESTRICTED");
  });

  it("records acceptance against a specific rules version", async () => {
    const { as, userId } = await makeUser(t);
    await as.mutation(api.rules.acceptRules, {});
    const rows = await t.run(async (ctx) =>
      ctx.db.query("rulesAcceptances").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId, rulesVersion: 1 });
  });
});
