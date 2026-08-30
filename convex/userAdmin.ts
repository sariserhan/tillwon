import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/admin.ts";
import { writeAudit } from "./lib/audit.ts";
import { accountStatus } from "./schema.ts";

export const searchUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (user === null) return null;
    return {
      _id: user._id,
      email: user.email,
      displayName: user.displayName ?? null,
      accountStatus: user.accountStatus,
      role: user.role,
      fraudRiskScore: user.fraudRiskScore,
      totalSpins: user.totalSpins,
      totalPotentialWins: user.totalPotentialWins,
    };
  },
});

/**
 * The lever eligibility.ts's ACCOUNT_RESTRICTED check actually gates on.
 * Nothing else in this codebase ever writes accountStatus past account
 * creation (always "active") — this is the only way to flag a user at all.
 */
export const setAccountStatus = mutation({
  args: {
    userId: v.id("users"),
    status: accountStatus,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (user === null) throw new Error("USER_NOT_FOUND");

    await ctx.db.patch(args.userId, { accountStatus: args.status });

    await writeAudit(ctx, {
      actorType: "admin",
      actorId: admin._id,
      action: "user.account_status_changed",
      entityType: "users",
      entityId: args.userId,
      before: { accountStatus: user.accountStatus },
      after: { accountStatus: args.status },
      metadata: args.reason !== undefined ? { reason: args.reason } : undefined,
    });

    return null;
  },
});
