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

  it("never exposes the sealed target through the public query", async () => {
    await t.mutation(internal.seed.seedCampaign, {});
    const active = await t.query(api.campaigns.getActiveCampaign, {});
    expect(JSON.stringify(active)).not.toContain("winningShard");
    expect(JSON.stringify(active)).not.toContain("winningCount");
  });

  it("seeds an eligibility set of 46 states plus DC", async () => {
    await t.mutation(internal.seed.seedCampaign, {});
    const active = await t.query(api.campaigns.getActiveCampaign, {});
    expect(active!.campaign.eligibleRegions).toHaveLength(47);
    expect(active!.campaign.eligibleRegions).not.toContain("TN");
    expect(active!.campaign.minimumAge).toBe(18);
  });
});
