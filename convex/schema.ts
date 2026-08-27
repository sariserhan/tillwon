import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const accountStatus = v.union(
  v.literal("active"),
  v.literal("verification_required"),
  v.literal("restricted"),
  v.literal("suspended"),
  v.literal("banned"),
  v.literal("deleted"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    displayName: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    ageVerified: v.boolean(),
    accountStatus,
    role: v.union(v.literal("user"), v.literal("admin"), v.literal("superadmin")),
    fraudRiskScore: v.number(),
    marketingConsent: v.boolean(),
    dailyReminderConsent: v.boolean(),
    termsAcceptedAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    totalSpins: v.number(),
    totalPotentialWins: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_email", ["email"]),
});
