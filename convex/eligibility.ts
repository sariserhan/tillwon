import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./users.ts";
import { isEligibleJurisdiction } from "./lib/jurisdictions.ts";

export type IneligibleReason =
  | "ACCOUNT_RESTRICTED"
  | "EMAIL_UNVERIFIED"
  | "INELIGIBLE_REGION"
  | "UNDERAGE"
  | "RULES_NOT_ACCEPTED";

function ageOn(birthDate: string, now: number): number {
  const born = new Date(birthDate);
  const today = new Date(now);
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Returns the first failing reason, or null. Order matters: account status is
 * checked before anything a user could fix, so a suspended account is never told
 * to verify an email instead.
 */
export async function eligibilityReason(
  ctx: MutationCtx | QueryCtx,
  user: Doc<"users">,
  campaign: Doc<"campaigns">,
): Promise<IneligibleReason | null> {
  if (user.accountStatus !== "active") return "ACCOUNT_RESTRICTED";
  if (campaign.requireEmailVerification && !user.emailVerified) {
    return "EMAIL_UNVERIFIED";
  }

  const region = user.region ?? "";
  if (
    !campaign.eligibleCountries.includes(user.country ?? "") ||
    !campaign.eligibleRegions.includes(region) ||
    !isEligibleJurisdiction(region)
  ) {
    return "INELIGIBLE_REGION";
  }

  if (
    user.birthDate === undefined ||
    ageOn(user.birthDate, Date.now()) < campaign.minimumAge
  ) {
    return "UNDERAGE";
  }

  const acceptance = await ctx.db
    .query("rulesAcceptances")
    .withIndex("by_user_campaign", (q) =>
      q.eq("userId", user._id).eq("campaignId", campaign._id),
    )
    .order("desc")
    .first();
  if (acceptance === null || acceptance.rulesVersion !== campaign.activeRulesVersion) {
    return "RULES_NOT_ACCEPTED";
  }

  return null;
}

/** Throws the reason as a typed code. Used by every write path. */
export async function assertEligible(
  ctx: MutationCtx,
  user: Doc<"users">,
  campaign: Doc<"campaigns">,
): Promise<void> {
  const reason = await eligibilityReason(ctx, user, campaign);
  if (reason !== null) throw new Error(reason);
}

export const getEligibilityStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .first();
    if (campaign === null) return { eligible: false, reason: "CAMPAIGN_NOT_LIVE" };

    const reason = await eligibilityReason(ctx, user, campaign);
    return { eligible: reason === null, reason };
  },
});
