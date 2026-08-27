import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Every gated function starts here. Returning null is never acceptable for a
 * write path — callers throw a typed code the UI maps to fixed copy.
 */
export async function requireUser(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("NOT_AUTHENTICATED");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (user === null) throw new Error("NOT_AUTHENTICATED");
  return user;
}

export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("NOT_AUTHENTICATED");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, { lastLoginAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email ?? "",
      emailVerified: identity.emailVerified === true,
      displayName: identity.name ?? undefined,
      ageVerified: false,
      accountStatus: "active",
      role: "user",
      fraudRiskScore: 0,
      marketingConsent: false,
      dailyReminderConsent: false,
      lastLoginAt: Date.now(),
      totalSpins: 0,
      totalPotentialWins: 0,
    });
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});
