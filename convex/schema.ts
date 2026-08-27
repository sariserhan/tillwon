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

  sponsors: defineTable({
    name: v.string(),
    slug: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    websiteUrl: v.string(),
    ctaLabel: v.string(),
    ctaUrl: v.string(),
    description: v.string(),
    brandColor: v.optional(v.string()),
    contactName: v.string(),
    contactEmail: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  }).index("by_slug", ["slug"]),

  prizes: defineTable({
    title: v.string(),
    description: v.string(),
    estimatedRetailValue: v.number(), // integer cents
    currency: v.string(),
    quantity: v.number(),
    imageStorageIds: v.array(v.id("_storage")),
    fulfillmentType: v.union(
      v.literal("physical"),
      v.literal("digital"),
      v.literal("experience"),
    ),
    fulfillmentNotes: v.string(),
    sponsorId: v.id("sponsors"),
  }),

  campaigns: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    sponsorId: v.id("sponsors"),
    prizeId: v.id("prizes"),
    status: v.union(
      v.literal("draft"),
      v.literal("upcoming"),
      v.literal("live"),
      v.literal("winner_pending"),
      v.literal("completed"),
      v.literal("suspended"),
      v.literal("cancelled"),
    ),
    startAt: v.number(),
    endAt: v.optional(v.number()), // absent = runs until a winner is confirmed
    dailySpins: v.number(),
    resetTimezone: v.string(),
    resetHour: v.number(),
    reelColumns: v.number(),
    projectedVolume: v.number(), // must equal oddsDenominator
    oddsDenominator: v.number(),
    shardCount: v.number(),
    commitmentHash: v.string(),
    eligibleCountries: v.array(v.string()),
    eligibleRegions: v.array(v.string()),
    minimumAge: v.number(),
    requireEmailVerification: v.boolean(),
    activeRulesVersion: v.number(),
    disqualificationPolicy: v.union(
      v.literal("resume_campaign"),
      v.literal("select_alternate"),
      v.literal("end_campaign"),
    ),
    winningSpinId: v.optional(v.id("spins")),
    potentialWinnerUserId: v.optional(v.id("users")),
    activatedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    revealedTarget: v.optional(v.string()),
    revealedNonce: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_slug", ["slug"]),

  campaignRules: defineTable({
    campaignId: v.id("campaigns"),
    version: v.number(),
    title: v.string(),
    content: v.string(),
    noPurchaseStatement: v.string(),
    oddsStatement: v.string(),
    effectiveAt: v.number(),
  }).index("by_campaign_version", ["campaignId", "version"]),

  auditLogs: defineTable({
    actorType: v.union(
      v.literal("user"),
      v.literal("admin"),
      v.literal("sponsor"),
      v.literal("system"),
    ),
    actorId: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_action", ["action"]),

  rulesAcceptances: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    rulesVersion: v.number(),
    acceptedAt: v.number(),
    ipHash: v.string(),
  }).index("by_user_campaign", ["userId", "campaignId"]),

  spinBalances: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    resetDate: v.string(),
    allocated: v.number(),
    used: v.number(),
  }).index("by_user_campaign_date", ["userId", "campaignId", "resetDate"]),
});
