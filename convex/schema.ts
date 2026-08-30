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
    /** Client-reported and unverified — see the note on `spins.ipHash`. */
    ipHash: v.string(),
  }).index("by_user_campaign", ["userId", "campaignId"]),

  spinBalances: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    resetDate: v.string(),
    allocated: v.number(),
    used: v.number(),
  }).index("by_user_campaign_date", ["userId", "campaignId", "resetDate"]),

  /**
   * Isolated so that NO query function anywhere returns it. The commitment hash
   * on the campaign — not encryption — is what makes the target tamper-evident,
   * because it defends against a privileged insider changing the target after
   * watching traffic rather than against someone reading the database.
   */
  campaignSecrets: defineTable({
    campaignId: v.id("campaigns"),
    winningShard: v.number(),
    winningCount: v.number(),
    nonce: v.string(),
  }).index("by_campaign", ["campaignId"]),

  spinShards: defineTable({
    campaignId: v.id("campaigns"),
    shard: v.number(),
    count: v.number(),
  }).index("by_campaign_shard", ["campaignId", "shard"]),

  spins: defineTable({
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    idempotencyKey: v.string(),
    shard: v.number(),
    shardSequence: v.number(),
    symbols: v.array(v.string()),
    isPotentialWinner: v.boolean(),
    isValid: v.boolean(),
    invalidReason: v.optional(v.string()),
    riskScore: v.number(),
    riskFlags: v.array(v.string()),
    /**
     * CLIENT-REPORTED AND UNVERIFIED. Both arrive as plain mutation arguments, so
     * whatever the browser sends is what lands here — today spinExecute's only
     * caller sends the literal string "browser" as deviceHash. They are fraud
     * signals to correlate against each other, never attested identity: a value
     * here proves nothing about who spun or from where, and no eligibility,
     * disqualification or claim decision may rest on one. Server-side capture
     * (an HTTP action that hashes the real request IP) is the fix, and until it
     * exists these fields must not be read as evidence.
     */
    ipHash: v.string(),
    deviceHash: v.string(),
    engineVersion: v.string(),
    rulesVersion: v.number(),
  })
    .index("by_user_idempotency", ["userId", "idempotencyKey"])
    .index("by_user_campaign", ["userId", "campaignId"])
    .index("by_campaign_winner", ["campaignId", "isPotentialWinner"]),

  claims: defineTable({
    campaignId: v.id("campaigns"),
    spinId: v.id("spins"),
    userId: v.id("users"),
    claimReference: v.string(),
    status: v.union(
      v.literal("potential_winner"),
      v.literal("notification_sent"),
      v.literal("claim_started"),
      v.literal("documents_requested"),
      v.literal("under_review"),
      v.literal("more_info_required"),
      v.literal("approved"),
      v.literal("disqualified"),
      v.literal("prize_processing"),
      v.literal("prize_shipped"),
      v.literal("prize_delivered"),
      v.literal("completed"),
    ),
    claimDeadline: v.number(),
    publicityReleaseAcceptedAt: v.optional(v.number()),
    legalName: v.optional(v.string()),
    publicDisplayName: v.optional(v.string()),
    eligibilityAffidavitAcceptedAt: v.optional(v.number()),
  })
    .index("by_reference", ["claimReference"])
    .index("by_user", ["userId"])
    .index("by_campaign", ["campaignId"])
    .index("by_spin", ["spinId"]),

  claimDocuments: defineTable({
    claimId: v.id("claims"),
    userId: v.id("users"), // denormalized owner check, avoids a join on every access
    type: v.union(
      v.literal("photo_id"),
      v.literal("proof_of_address"),
      v.literal("winner_photo"),
    ),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
    // The type identified from the file's own bytes at registration time
    // (convex/lib/fileSniff.ts), not the client-declared upload
    // Content-Type header. This, not `_storage`'s own (attacker-controlled)
    // metadata, is what the /documents HTTP action serves the file as —
    // serving a client-chosen Content-Type back verbatim is a stored-XSS
    // path (a file sniffed as a valid PNG could still be uploaded with
    // `Content-Type: text/html`). Optional only for schema additivity —
    // every row inserted by finalizeDocumentRegistration sets it.
    sniffedType: v.optional(v.string()),
  })
    .index("by_claim", ["claimId"])
    .index("by_claim_type", ["claimId", "type"])
    .index("by_storage", ["storageId"]),

  winnerArchive: defineTable({
    campaignId: v.id("campaigns"),
    claimId: v.id("claims"),
    legalName: v.string(),
    publicDisplayName: v.string(),
    photoStorageId: v.id("_storage"),
    region: v.string(),
    prizeTitle: v.string(),
    awardedAt: v.number(),
    revealedTarget: v.string(), // "<winningShard>:<winningCount>"
    revealedNonce: v.string(),
    commitmentHash: v.string(),
  }).index("by_campaign", ["campaignId"]),
});
