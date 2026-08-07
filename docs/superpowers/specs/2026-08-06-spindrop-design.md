# SpinDrop — Full Platform Design Spec

**Date:** 2026-08-06
**Status:** awaiting review
**Product truth:** [PRODUCT.md](../../../PRODUCT.md)

> **Scope note, recorded once.** This spec covers the entire brief in one document at the user's
> explicit request, after I raised that a single spec of this size is hard to verify in one pass.
> §14 gives an internal build order with checkpoints so it remains executable. Open product decisions
> from PRODUCT.md that block specific sections are marked **[BLOCKED]** at the point they bite.

---

## 1. Architecture

```
Browser (Next.js App Router, RSC + client islands)
   │
   ├── Convex React client ──── queries (reactive)   ── campaign state, balance, claim status
   │                       └── mutations (txn)       ── spinExecute, acceptRules, admin writes
   │
   └── Convex actions (non-txn, network-capable)     ── Turnstile verify, email, PostHog,
                                                        R2 uploads, target generation
Convex database (serializable OCC transactions)
Cloudflare R2 ── claim documents only
```

**Why Convex carries this product.** Mutations are serializable transactions with automatic conflict
retry. The whole apparatus in brief §7.2 — user-level spin locks, campaign winner locks, server
request IDs, a Redis coordination layer — is a Postgres-shaped solution to a problem Convex does not
have. One mutation reads the balance, decrements, writes the spin, and conditionally flips campaign
status; two concurrent spins cannot both win because they cannot both commit.

**The three-runtime split matters and is not cosmetic:**

| Runtime | Transactional | Network | Used for |
|---|---|---|---|
| Query | yes (read-only) | no | Campaign state, balance, winner archive, claim status |
| Mutation | yes | no | Every state change. The spin. All admin writes. |
| Action | **no** | yes | Turnstile, email, analytics, R2, random target generation |

Actions are not transactional, so anything an action does may run twice. Everything an action triggers
must be idempotent. This is the reason idempotency keys survive in this design even though the
locking layer does not.

**Framework:** Next.js App Router. Public pages (landing, campaign, rules, winners, sponsor, legal)
render as RSC for SEO and first paint. The spin surface is a client island subscribed to Convex.

**Auth:** Clerk. It is the only option in the brief's list that delivers all four requirements
without extra work: email magic link, Google, Apple, and **enforced MFA for admin accounts** (brief
§26). Convex Auth would require building admin MFA by hand.

---

## 2. Data Model

Convex supplies `_id` and `_creationTime` on every document, so the brief's `id` and `createdAt`
fields are dropped as redundant. Every access path below has a named index; unindexed table scans are
a correctness risk at spin volume, not just a performance one.

### users

```ts
users: defineTable({
  clerkId: v.string(),
  email: v.string(),
  emailVerified: v.boolean(),
  displayName: v.optional(v.string()),
  country: v.optional(v.string()),          // ISO 3166-1 alpha-2
  region: v.optional(v.string()),           // ISO 3166-2 subdivision
  birthDate: v.optional(v.string()),        // ISO date, self-declared
  ageVerified: v.boolean(),                 // true only after document verification
  accountStatus: v.union(
    v.literal("active"), v.literal("verification_required"),
    v.literal("restricted"), v.literal("suspended"),
    v.literal("banned"), v.literal("deleted"),
  ),
  role: v.union(v.literal("user"), v.literal("admin"), v.literal("superadmin")),
  fraudRiskScore: v.number(),               // 0-100, additive, see §9
  marketingConsent: v.boolean(),
  dailyReminderConsent: v.boolean(),        // separate from marketing, brief §18
  termsAcceptedAt: v.optional(v.number()),
  lastLoginAt: v.optional(v.number()),
  totalSpins: v.number(),
  totalPotentialWins: v.number(),
})
  .index("by_clerk", ["clerkId"])
  .index("by_email", ["email"])
  .index("by_status", ["accountStatus"])
```

`role` lives on the user rather than in a separate table because there are three values and no
foreseeable fourth. Sponsor access is *not* a role here — see `sponsorUsers`.

Rules acceptance is deliberately **not** a user field. It is per campaign *and* per rules version, so
it lives in `rulesAcceptances`.

### campaigns

```ts
campaigns: defineTable({
  slug: v.string(),
  title: v.string(),
  description: v.string(),
  sponsorId: v.id("sponsors"),
  prizeId: v.id("prizes"),
  status: v.union(
    v.literal("draft"), v.literal("upcoming"), v.literal("live"),
    v.literal("winner_pending"), v.literal("completed"),
    v.literal("suspended"), v.literal("cancelled"),
  ),
  startAt: v.number(),
  endAt: v.optional(v.number()),            // absent = runs until a winner is confirmed
  dailySpins: v.number(),                   // default 10
  resetTimezone: v.string(),                // IANA, default "UTC"
  resetHour: v.number(),                    // 0-23, default 0
  // prize tier — derived from prize value, decides the reel count (3–8)
  reelColumns: v.number(),
  // winner engine
  projectedVolume: v.number(),              // == oddsDenominator; the sealed target's range
  oddsDenominator: v.number(),              // the PUBLISHED odds; defaults to 10^reelColumns
  shardCount: v.number(),                   // default 16, see §4
  commitmentHash: v.string(),               // SHA-256(target || nonce), publishable
  // eligibility
  eligibleCountries: v.array(v.string()),
  eligibleRegions: v.optional(v.array(v.string())),
  excludedRegions: v.optional(v.array(v.string())),
  minimumAge: v.number(),
  requireEmailVerification: v.boolean(),
  maxSpinsPerDevice: v.optional(v.number()),
  // rules + outcome
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
  revealedTarget: v.optional(v.number()),   // written only at completion, for public verification
  revealedNonce: v.optional(v.string()),
})
  .index("by_status", ["status"])
  .index("by_slug", ["slug"])
```

> **[RESOLVED 2026-08-06 — no end date.]** Campaigns run until a valid winner is confirmed. `endAt`
> is optional and left unset. This is unproblematic below the ~$5,000 prize threshold that triggers
> New York and Florida registration and bonding, so it is correct for the seed campaign. It becomes a
> real constraint the first time a campaign carries a prize above that threshold, because those
> filings assume a stated promotion period. The field exists so a future high-value campaign can set
> one without a migration; the Official Rules template must accommodate both shapes.

`fixedProbability` is **absent by design.** See §4.

### campaignSecrets

```ts
campaignSecrets: defineTable({
  campaignId: v.id("campaigns"),
  winningShard: v.number(),                 // which shard holds the winning target
  winningCount: v.number(),                 // the count within that shard that wins
  nonce: v.string(),                        // 32 random bytes, hex
}).index("by_campaign", ["campaignId"])
```

Isolated in its own table so that **no query function anywhere returns it.** The brief asks for this
to be encrypted and invisible to ordinary admins. Encryption at rest is the weaker half of that
requirement — it defends against a database reader while doing nothing about the actual threat, which
is a privileged insider changing the target after seeing traffic. The `commitmentHash` on the
campaign is what defends against that, and it does so publicly and verifiably. See §4.

### spinShards

```ts
spinShards: defineTable({
  campaignId: v.id("campaigns"),
  shard: v.number(),
  count: v.number(),
}).index("by_campaign_shard", ["campaignId", "shard"])
```

Exists to solve the hot-document problem in §4. Created at campaign activation, `shardCount` rows.

### sponsors, prizes

```ts
sponsors: defineTable({
  name: v.string(), slug: v.string(),
  logoStorageId: v.optional(v.id("_storage")),
  websiteUrl: v.string(),
  ctaLabel: v.string(), ctaUrl: v.string(),
  description: v.string(),
  backgroundStorageId: v.optional(v.id("_storage")),
  brandColor: v.optional(v.string()),
  contactName: v.string(), contactEmail: v.string(),
  status: v.union(v.literal("active"), v.literal("inactive")),
}).index("by_slug", ["slug"])

prizes: defineTable({
  title: v.string(), description: v.string(),
  estimatedRetailValue: v.number(),         // minor units (cents)
  currency: v.string(),
  quantity: v.number(),
  imageStorageIds: v.array(v.id("_storage")),
  fulfillmentType: v.union(
    v.literal("physical"), v.literal("digital"), v.literal("experience"),
  ),
  fulfillmentNotes: v.string(),
  sponsorId: v.id("sponsors"),
})
```

Monetary values are integers in minor units. A Tesla's value in float dollars is exactly the kind of
number that renders as `54990.000000001` on a public page.

### campaignRules, rulesAcceptances

```ts
campaignRules: defineTable({
  campaignId: v.id("campaigns"),
  version: v.number(),
  title: v.string(),
  content: v.string(),                      // markdown
  noPurchaseStatement: v.string(),           // the near-game statement, per-campaign
  oddsStatement: v.string(),                 // human-readable odds disclosure
  effectiveAt: v.number(),
  publishedBy: v.id("users"),
}).index("by_campaign_version", ["campaignId", "version"])

rulesAcceptances: defineTable({
  userId: v.id("users"),
  campaignId: v.id("campaigns"),
  rulesVersion: v.number(),
  acceptedAt: v.number(),
  ipHash: v.string(),
}).index("by_user_campaign", ["userId", "campaignId"])
```

Rules are append-only. A new version never mutates an old row, because the old row is the evidence of
what a given user actually agreed to.

### spinBalances

```ts
spinBalances: defineTable({
  userId: v.id("users"),
  campaignId: v.id("campaigns"),
  resetDate: v.string(),                    // "YYYY-MM-DD" in campaign timezone, see §3
  allocated: v.number(),
  used: v.number(),
}).index("by_user_campaign_date", ["userId", "campaignId", "resetDate"])
```

`remaining` is derived (`allocated - used`), never stored. Two fields that must agree are two fields
that will eventually disagree.

### spins

```ts
spins: defineTable({
  userId: v.id("users"),
  campaignId: v.id("campaigns"),
  idempotencyKey: v.string(),
  shard: v.number(),
  shardSequence: v.number(),                // this spin's count within its shard
  symbols: v.array(v.string()),             // exactly 3
  isPotentialWinner: v.boolean(),
  isValid: v.boolean(),
  invalidReason: v.optional(v.string()),
  riskScore: v.number(),
  riskFlags: v.array(v.string()),
  ipHash: v.string(),
  deviceHash: v.string(),
  engineVersion: v.string(),
  rulesVersion: v.number(),
})
  .index("by_user_idempotency", ["userId", "idempotencyKey"])
  .index("by_user_campaign", ["userId", "campaignId"])
  .index("by_campaign_winner", ["campaignId", "isPotentialWinner"])
```

Immutable after insert. Nothing in the codebase patches a spin — enforced by review, and by the fact
that no mutation takes a spin id as a write target. `rulesVersion` is denormalized onto the spin
because the audit question is always "which rules governed *this* entry."

### claims, claimDocuments

```ts
claims: defineTable({
  campaignId: v.id("campaigns"),
  spinId: v.id("spins"),
  userId: v.id("users"),
  claimReference: v.string(),               // "CLAIM-X8P4K2", user-facing
  status: v.union(
    v.literal("potential_winner"), v.literal("notification_sent"),
    v.literal("claim_started"), v.literal("documents_requested"),
    v.literal("under_review"), v.literal("more_info_required"),
    v.literal("approved"), v.literal("disqualified"),
    v.literal("prize_processing"), v.literal("prize_shipped"),
    v.literal("prize_delivered"), v.literal("completed"),
  ),
  notificationSentAt: v.optional(v.number()),
  claimDeadline: v.number(),
  // each verification track moves independently; claim.status is the roll-up
  identityStatus: verificationTrack, eligibilityStatus: verificationTrack,
  addressStatus: verificationTrack, taxStatus: verificationTrack,
  //   const verificationTrack = v.union(
  //     v.literal("not_required"), v.literal("pending"),
  //     v.literal("submitted"), v.literal("verified"), v.literal("rejected"),
  //   )
  disqualificationReason: v.optional(v.string()),
  publicityReleaseAcceptedAt: v.optional(v.number()),   // required to accept the prize, see §7
  approvedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
  .index("by_reference", ["claimReference"])
  .index("by_user", ["userId"])
  .index("by_campaign", ["campaignId"])
  .index("by_status", ["status"])

claimDocuments: defineTable({
  claimId: v.id("claims"),
  kind: v.union(
    v.literal("government_id"), v.literal("proof_of_address"),
    v.literal("tax_form"),                  // W-9; the TIN stays inside the file, see §7
    v.literal("affidavit"), v.literal("publicity_photo"), v.literal("other"),
  ),
  r2Key: v.string(),                        // R2, not Convex storage — see §7
  originalFilename: v.string(),             // sanitized
  contentType: v.string(),
  sizeBytes: v.number(),
  scanStatus: v.union(
    v.literal("pending"), v.literal("clean"), v.literal("infected"),
  ),
  reviewNote: v.optional(v.string()),
}).index("by_claim", ["claimId"])
```

Admin notes live in `auditLogs`, not on the claim. A free-text field that accumulates decisions is an
audit trail with no timestamps and no actor.

### winnerArchive

```ts
winnerArchive: defineTable({
  campaignId: v.id("campaigns"),
  fullName: v.string(),                     // real first + last name, per 2026-08-06 decision
  regionOrCountry: v.string(),
  city: v.optional(v.string()),
  prizeTitle: v.string(),
  sponsorName: v.string(),
  wonAt: v.number(),
  prizeImageStorageId: v.optional(v.id("_storage")),
  winnerPhotoStorageId: v.id("_storage"),   // required — winners are not anonymous
  testimonial: v.optional(v.string()),
}).index("by_won_at", ["wonAt"])
```

**A separate table, not a view over claims and users.** This remains the most valuable structural
decision in the model even though publication is now mandatory rather than opt-in, and the reason
shifts rather than disappears. The public query reads a table that physically contains *only* the
fields intended for publication. Name and photo are published by decision; date of birth, SSN or
ITIN, government ID, and address are not, and they live in `claims` and `claimDocuments` where no
public code path reaches them. A single table holding both would put a winner's DOB one forgotten
filter away from a public page.

Publishing stays an explicit admin mutation that copies values across, so the act of making a person
public is a recorded event with an actor and a timestamp.

### auditLogs, devices, notifications, sponsorUsers, riskEvents

```ts
auditLogs: defineTable({
  actorType: v.union(
    v.literal("user"), v.literal("admin"), v.literal("sponsor"), v.literal("system"),
  ),
  actorId: v.optional(v.string()),
  action: v.string(),                       // "campaign.activate", "claim.disqualify", …
  entityType: v.string(),
  entityId: v.string(),
  before: v.optional(v.any()),
  after: v.optional(v.any()),
  metadata: v.optional(v.any()),
}).index("by_entity", ["entityType", "entityId"]).index("by_action", ["action"])

devices: defineTable({
  deviceHash: v.string(),
  userIds: v.array(v.id("users")),          // >1 is itself a signal
  firstSeenAt: v.number(), lastSeenAt: v.number(),
  riskFlags: v.array(v.string()),
  status: v.union(v.literal("ok"), v.literal("watch"), v.literal("blocked")),
}).index("by_hash", ["deviceHash"])

notifications: defineTable({
  userId: v.id("users"),
  type: v.string(), channel: v.literal("email"),
  status: v.union(
    v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("suppressed"),
  ),
  dedupeKey: v.string(),                    // actions can run twice; this is the guard
  sentAt: v.optional(v.number()),
  providerId: v.optional(v.string()),
  metadata: v.optional(v.any()),
}).index("by_dedupe", ["dedupeKey"]).index("by_user", ["userId"])

sponsorUsers: defineTable({
  clerkId: v.string(),
  sponsorId: v.id("sponsors"),
  email: v.string(),
}).index("by_clerk", ["clerkId"])

riskEvents: defineTable({
  userId: v.optional(v.id("users")),
  ipHash: v.string(), deviceHash: v.optional(v.string()),
  kind: v.string(),                         // "velocity", "vpn", "disposable_email", …
  score: v.number(),
  resolved: v.boolean(),
}).index("by_user", ["userId"]).index("by_unresolved", ["resolved"])
```

`sponsorUsers` is a separate table from `users` so that sponsor authentication cannot accidentally
satisfy a `role === "admin"` check. Brief §26 requires separating sponsor access from admin access;
separate tables make the separation structural rather than conditional.

**14 tables.** Every one is load-bearing for something the brief requires.

---

## 3. Daily Spin Allocation

The reset key is a string, `"YYYY-MM-DD"`, computed in the campaign's timezone with the reset hour
subtracted:

```ts
function resetDateKey(now: number, timezone: string, resetHour: number): string {
  const shifted = new Date(now - resetHour * 3_600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(shifted);                       // en-CA gives ISO order
}
```

A string key rather than a timestamp range, because the balance lookup then becomes an exact index
hit instead of a range scan, and because "which campaign day is this" is a question with one right
answer that should be computed in one place.

Balance rows are created lazily on first spin of a day. No cron fans out rows to every user at
midnight — that is a scheduled job whose cost scales with total registered users rather than with
daily active ones, and whose failure mode is that nobody can play.

Unused spins expire implicitly: yesterday's row is simply never read again.

**Non-obvious consequence worth naming:** a user who travels across timezones sees their reset time
move, because reset is anchored to the campaign timezone, not theirs. This is correct — every entrant
must face the same daily window, or the window itself becomes an eligibility difference. The UI
displays the next reset converted to the visitor's local time so it never *looks* wrong.

---

## 4. Winner Engine

**One engine: predetermined winning entry.** Fixed probability is deliberately not built.

At 1-in-5,000,000 per spin, 1,000 daily users spending 10 spins each reach an expected winner in
roughly 500 days; 10,000 users in roughly 50. Campaign duration becomes a random variable spanning
an order of magnitude, and an advertising flight with an unknown end date is not a sellable product.
Predetermined entry sets the winner's position from projected volume, so the win lands inside the
flight by construction. It also audits better: the win is a specific identifiable entry rather than a
statistical claim about a random number generator.

### The hot-document problem, and the sharded counter

The obvious implementation gives each eligible spin a global sequence number and wins when it equals
the target. That requires every spin to increment one counter on one document. Under Convex's
optimistic concurrency, every concurrent spin then conflicts on that document, retries, and the
platform serializes to roughly one spin at a time globally. This is the scalability trap in the
design, and it appears exactly when a campaign succeeds.

**Sharded counters, with one winning shard:**

- At activation, generate `shardCount` (default 16) rows in `spinShards`, each at zero.
- Draw `winningShard` uniformly from `[0, shardCount)`.
- Draw `winningCount` uniformly from `[1, projectedVolume / shardCount]`.
- Each spin picks its shard uniformly at random, increments only that shard, and wins if
  `shard === winningShard && newCount === winningCount`.

Because shard assignment is uniform, the winning shard reaches count *t* after roughly
`shardCount × t` total spins, so the expected win position is still ≈ the intended target. Write
contention drops by the shard count. Exactly one spin can ever satisfy the condition, and it does so
inside a transaction, so a duplicate winner is impossible rather than unlikely.

`shardCount: 1` reproduces exact global sequence numbering, for a low-traffic campaign that prefers
the simpler story in its Official Rules.

**Why shard now rather than when traffic demands it:** the winner mechanism is described in published
Official Rules that are near-immutable after launch. Changing it later is not a refactor, it is
republishing a legal document mid-promotion. Getting it right once is the cheaper path.

### Randomness

Targets are drawn in a **Convex action** using `crypto.getRandomValues`, at campaign activation, and
handed to an internal mutation to store. Actions are the only runtime here with real cryptographic
randomness, and this draw happens exactly once per campaign, so the non-transactional nature of
actions costs nothing.

**In this mode the spin mutation needs no cryptographic randomness at all.** The win is an integer
comparison. Only the decorative symbols on a losing spin are random, and those may use the
mutation's seeded randomness because they carry no outcome. This is a real auditability win: the
function that decides who wins a car contains no random number generator.

### Public verifiability

At activation, publish `commitmentHash = SHA256(winningShard || winningCount || nonce)` in the
Official Rules. At completion, write `revealedTarget` and `revealedNonce` to the campaign. Anyone can
then recompute the hash and confirm the target was fixed before the first spin, and check that the
winning spin's `shard` and `shardSequence` match.

This is what actually satisfies "admins cannot manually pick a winner." Encrypting the target in the
database — which the brief asks for — defends against someone reading the database, while doing
nothing about the real threat, which is a privileged insider changing the target after watching
traffic. The commitment makes that tampering publicly detectable. The brief files this under §9
"optional future feature"; it costs one hash to do at launch and is the strongest single control in
the system.

### Prize tiers

Prize value decides the tier, and the tier decides the reel count. Table and
resolution live in `app/lib/tiers.ts`, asserted by `npm run check:spin`.

| Tier | Value | Reels | Default odds | EV per entry |
|---|---|---|---|---|
| 1 | ≤ $100 | 3 | 1 in 1,000 | $0.100 |
| 2 | $100–500 | 4 | 1 in 10,000 | $0.050 |
| 3 | $500–1,000 | 5 | 1 in 100,000 | $0.010 |
| 4 | $1,000–5,000 | 6 | 1 in 1,000,000 | $0.005 |
| 5 | $5,000–10,000 | 7 | 1 in 10,000,000 | $0.001 |
| 6 | $10,000+ | 8 | 1 in 100,000,000 | $0.0005 |

`projectedVolume` **must equal** `oddsDenominator`, because the sealed target is
drawn from that range and the published figure has to describe the mechanism that
actually runs. Publishing one number and sealing against another would be a false
odds disclosure.

> **Economic hazard, recorded rather than silently shipped.** The odds ladder
> spans five orders of magnitude; prize value spans about two. Expected value per
> entry therefore *falls* about 200× from tier 1 to tier 6, and tier 6 at 10,000
> entries a day needs roughly 27 years to produce a winner — the most exciting
> prizes are the ones that never pay. `oddsDenominator` is a campaign field
> precisely so this can be decoupled: deriving it from a target campaign length
> (expected daily entries × intended days) keeps duration predictable and EV flat
> across tiers, and requires no engine or UI change. The default is what was
> specified; the override is the escape hatch.

Bounds are exclusive-low / inclusive-high: $100 is tier 1, $100.01 is tier 2.

### Losing symbols

Draw three symbols from the set excluding any combination that forms `7-7-7`. Simplest correct
approach: draw freely, and if the result is `7-7-7` on a non-winning spin, re-roll the third reel to
any non-`7`. Near-miss combinations (`7-7-star`) will occur naturally at their honest frequency and
are never engineered — brief §4.4 bans near-miss *framing*, and deliberately over-generating
near-misses would violate that ban in the engine rather than the copy.

---

## 5. The Spin Mutation

One mutation, one transaction. Pseudocode with the ordering that matters:

```
spinExecute({ idempotencyKey, deviceHash, challengeToken? })

 1  identity ← ctx.auth.getUserIdentity()          → NOT_AUTHENTICATED
 2  user ← by_clerk(identity.subject)              → NOT_AUTHENTICATED
 3  replay ← by_user_idempotency(user, key)
      if replay: return stored result              ← retries are free, before any write
 4  user.accountStatus === "active"                → ACCOUNT_RESTRICTED
 5  campaign ← by_status("live")                   → CAMPAIGN_NOT_LIVE
 6  campaign.requireEmailVerification ⇒ verified   → EMAIL_UNVERIFIED
 7  eligibility(user, campaign)                    → INELIGIBLE_REGION | UNDERAGE
 8  rulesAcceptance(user, campaign, activeVersion) → RULES_NOT_ACCEPTED
 9  risk(user, deviceHash) needs challenge?        → CHALLENGE_REQUIRED
10  key ← resetDateKey(now, tz, resetHour)
11  balance ← by_user_campaign_date(...) ?? insert(allocated: dailySpins, used: 0)
12  balance.used < balance.allocated               → NO_SPINS_REMAINING
13  patch balance.used += 1
14  shard ← randomInt(shardCount)
15  patch spinShards[shard].count += 1  → seq
16  secrets ← by_campaign(campaign)
17  isWinner ← shard === secrets.winningShard && seq === secrets.winningCount
18  symbols ← isWinner ? [7,7,7] : nonJackpotTriple()
19  spinId ← insert spins{ ... }
20  if isWinner:
      patch campaign{ status: "winner_pending", winningSpinId, potentialWinnerUserId }
      insert claims{ status: "potential_winner", claimReference, claimDeadline }
      insert auditLogs{ actorType: "system", action: "campaign.winner_pending" }
      scheduler.runAfter(0, notifyPotentialWinner)
      scheduler.runAfter(0, alertAdmins)
21  patch user.totalSpins += 1
22  scheduler.runAfter(0, trackSpinAnalytics)
23  return { spinId, symbols, isPotentialWinner, remainingSpins, campaignStatus, claimReference? }
```

**Ordering rationale.** The idempotency check is step 3, before any validation, so a retried request
returns the original result even if the user has since become ineligible or run out of spins — the
alternative silently converts a network retry into a different answer than the first attempt gave.
Balance decrement precedes shard increment so that a conflict retry cannot consume a shard sequence
without consuming a spin, which would drift the entry count away from the spins that produced it.

**Why this is safe under concurrency.** All 23 steps are one serializable transaction. Two parallel
requests from one user both attempt to patch the same balance row; one commits, the other conflicts
and re-executes from step 1, where it now reads `used` already incremented. If it was a genuine
duplicate it hits the idempotency replay at step 3. If it was a distinct second spin it either
proceeds or fails with `NO_SPINS_REMAINING`. Neither path can double-spend, and neither can produce a
second winner, because the winning shard count is reached exactly once across all committed
transactions.

**Challenge flow.** Turnstile verification requires a network call, which a mutation cannot make. The
mutation therefore *throws* `CHALLENGE_REQUIRED` rather than trying to verify. The client solves the
challenge and retries through an action, which verifies with Cloudflare and then calls the same
mutation via `ctx.runMutation` — still one transaction. Because the action itself may run twice on
retry, the idempotency key is what keeps that safe. This is the concrete reason keys stay in the
design.

**Response shape** is exactly the brief's §25 contract, plus a `claimReference` on a potential win.

---

## 6. Campaign State Machine

```
draft → upcoming → live ⇄ suspended
                    │
                    ├─→ winner_pending ─→ completed
                    │         │
                    │         └─→ (disqualified) ─→ per disqualificationPolicy:
                    │                                resume_campaign → live
                    │                                select_alternate → winner_pending
                    │                                end_campaign → completed
                    └─→ cancelled
```

Transitions are individual mutations, each writing an audit log entry. Illegal transitions throw
rather than no-op, so a bug surfaces as an error instead of a silently ignored click.

`suspended` is the emergency pause (brief §26). It rejects spins while leaving the campaign page
readable, because a promotion that vanishes mid-flight looks exactly like a scam.

`disqualificationPolicy` is captured on the campaign **at draft time** and mirrored into the Official
Rules, because the brief (§8.3) requires the behavior be documented before launch. Deciding it after
a disqualification is deciding it with a known outcome in view.

> **[RESOLVED by implication 2026-08-06 — `resume_campaign`.]** With no end date and the promise that
> the prize stays live until someone wins, `resume_campaign` is the only policy consistent with the
> product. A disqualified claimant returns the campaign to `live`, the winning shard target is left
> untouched, and the next spin to reach it wins. `select_alternate` would need a second pre-committed
> target and `end_campaign` would contradict the headline promise. **Confirm explicitly before
> launch**, since this text goes into the Official Rules verbatim.

---

## 7. Claims

The claimant sees `/claim/[claimReference]`: prize, reference, required steps, deadline, uploaded
documents, verification status, support contact, Official Rules link. Access requires being the
authenticated claimant; the reference is not itself a credential.

### Winner verification requirements — decided 2026-08-06

A potential winner must provide, before the prize is released:

| Requirement | Track | Stored as |
|---|---|---|
| Government-issued photo ID | `identityStatus` | R2 document |
| Legal first and last name | `identityStatus` | `claims` fields |
| Date of birth | `identityStatus` | `claims` field, never published |
| Photograph for publication | `eligibilityStatus` | R2, copied to `winnerArchive` on publish |
| Signed publicity release | `eligibilityStatus` | R2 document + `publicityReleaseAcceptedAt` |
| Signed eligibility affidavit | `eligibilityStatus` | R2 document |
| Address verification | `addressStatus` | R2 document |
| SSN or ITIN on a W-9 | `taxStatus` | **see below** |

**Winners are not anonymous.** Accepting the prize requires the publicity release, and name and photo
are published to the winner archive. Two consequences the Official Rules must carry from day one:

- The publicity release must be a **stated condition of entry in the Official Rules before the first
  spin**. It cannot be introduced once a winner exists. At least one US state restricts conditioning
  prize receipt on a publicity release, so the jurisdiction list and this requirement must be reviewed
  together, not separately.
- The archive publishes name, city or region, and photo. It never publishes date of birth, ID
  documents, address, or tax data, which is why `winnerArchive` is a separate table (§2).

### The SSN rule: it never enters the database

Tax reporting (1099-MISC) applies at **$600 and above**, so the seed campaign's $100 gift card needs
no TIN at all — collecting one there is pure liability with no legal benefit. The `taxStatus` track
starts as `not_required` and is only engaged when prize value crosses the threshold.

When it is required, the SSN or ITIN lives **only inside the W-9 document in restricted R2 storage.**
There is no Convex field for it, at any point, in any table.

The application never needs to read the number — it needs to know a W-9 was received and reviewed,
which `taxStatus` records. A TIN in a database field is queryable, appears in logs and error traces,
is replicated into every backup, and places the platform under state breach-notification statutes
that generally require encryption at rest for exactly this identifier. The same value inside a
presigned-URL-gated document carries a fraction of that exposure for none of the functionality.
Admin review of tax documents is therefore a document view, never a form field.

**Claim documents go to R2, not Convex storage.** Convex `getUrl` returns an unguessable but
long-lived public URL, and the brief requires signed URLs with restricted access for
government-issued ID. R2 presigned URLs expire. The flow: an action mints a short-lived presigned PUT
for the browser; the browser uploads directly; a mutation records the `r2Key`; a scheduled action
scans the object and sets `scanStatus`. Reads mint a short-lived presigned GET only after checking
the caller is the claimant or an admin.

Filenames are sanitized to `[A-Za-z0-9._-]` and the stored R2 key is generated, never
user-controlled. The original filename is kept as a display-only string.

Every status change is an admin mutation writing an audit log entry with actor, before, and after.
There is no mutation that lets an admin set a claim to `approved` without a recorded reason.

---

## 8. Admin

Guarded by `role` on `users`, checked inside every admin function — never in a layout, page, or
middleware alone, since those protect a view while leaving the function callable. Clerk enforces MFA
for admin accounts (brief §26).

Sections: overview, campaign management, user management, claim review, sponsor management, fraud
alerts, audit log viewer. Contents as brief §12.

**Structurally prevented, not merely absent from the UI:**

- No mutation accepts a spin id as a write target, so past results cannot be edited.
- No delete mutation exists for `spins`, `auditLogs`, or `rulesAcceptances`.
- No mutation sets `campaignSecrets`, `winningSpinId`, or `potentialWinnerUserId` from admin input.
- Odds-bearing fields (`projectedVolume`, `shardCount`) reject writes when status is not `draft`.
- `superadmin` gates only campaign cancellation and role assignment.

The audit log is written by a shared helper that takes actor, action, entity, before, and after. Any
admin mutation not calling it is a review failure — this is the one convention in the spec that
cannot be enforced by types.

---

## 9. Fraud

Additive risk scoring; a score crossing a threshold triggers a Turnstile challenge rather than a
block, because a false positive that silently stops a free entry is worse than one extra checkbox.

| Signal | Where | Score |
|---|---|---|
| Disposable email domain | signup action | +30 |
| Device hash shared across accounts | spin mutation, `devices.userIds` | +25 each |
| IP hash velocity above threshold | `riskEvents` window | +20 |
| VPN / proxy / datacenter ASN | signup action, IP intelligence | +15 |
| Missing or unstable device hash | spin mutation | +10 |
| Spin interval below human floor | timestamp delta | +20 |

At ≥50, challenge on every spin. At ≥80, `verification_required` and admin alert. IP and device
values are stored only as salted hashes (brief §26), with the salt in an environment variable, so the
database never holds a reversible identifier.

Rate limits: per-user spins are already bounded by the balance, which is the strongest limit in the
system and needs nothing added. Signup, magic-link requests, and document uploads are limited per IP
hash.

**Deliberately deferred with the trigger named:** identity verification integration, browser
automation fingerprinting, and household-level duplicate detection. All three are only worth their
complexity against a prize worth stealing, and the first campaign is a $100 gift card (brief §29).
The trigger to build them is prize value crossing roughly $1,000, not a calendar date.

---

## 10. Notifications, Analytics, Sponsor Reporting

**Email** via Resend from Convex actions. Every send carries a `dedupeKey`; the send action checks
`notifications.by_dedupe` first. Actions are not transactional and may run twice, so without this a
potential winner gets two "you may have won" emails, which reads as a system that does not know what
it is doing at the worst possible moment. Types per brief §18. Daily reminders are opt-in via
`dailyReminderConsent`, separate from `marketingConsent`, with one-click unsubscribe.

**Analytics** to PostHog, server-side from scheduled actions for anything outcome-bearing
(`spin_completed`, `potential_win_generated`, `claim_started`) and client-side for view and
interaction events. Server-side because ad blockers suppress a meaningful fraction of client events,
and spin counts that disagree with the database are worse than no spin counts when a sponsor is
reading the report. Identify by user id; no email or IP in properties.

**Sponsor dashboard** at `/sponsor/dashboard`, authenticated via `sponsorUsers`, scoped to that
sponsor's campaigns. Impressions, unique visitors, spins, returning users, average spins per user,
CTA clicks and CTR, geographic and device distribution, campaign and winner status, CSV export.
Aggregates only — every sponsor-facing query returns counts, never rows, and there is no code path
from a sponsor session to `users`, `spins`, or `claims` documents.

Reports must reconcile with internal analytics (brief §4 acceptance criteria), so both read the same
Convex aggregates rather than the sponsor view reading PostHog and admin reading the database.

---

## 11. Public Surfaces and Error Copy

Routes:

| Route | Mode | Notes |
|---|---|---|
| `/` | Persuade | Prize, sponsor, free-entry claim, remaining spins, spin surface |
| `/campaign/[slug]` | Persuade | Full campaign and sponsor detail |
| `/rules/[slug]` | Read | Versioned Official Rules |
| `/winners` | Read | `winnerArchive` only; honest empty state at launch |
| `/sponsor/[slug]` | Persuade | Public sponsor profile |
| `/claim/[reference]` | Operate | Claimant only |
| `/account` | Operate | Profile, consents, spin history |
| `/admin/*` | Operate | Admin only |
| `/legal/*` | Read | Terms, privacy, cookies, accessibility, sponsor disclosure, tax, abuse |

Typed error codes with fixed copy, so the same failure never gets two different explanations:

| Code | Copy |
|---|---|
| `NO_SPINS_REMAINING` | "You've used all 10 spins today. New spins in 4h 12m." |
| `CAMPAIGN_WINNER_PENDING` | "This jackpot has a potential winner under review. The campaign is paused while we verify." |
| `RULES_NOT_ACCEPTED` | "Read and accept the Official Rules to start spinning." |
| `INELIGIBLE_REGION` | "This campaign isn't open in your region yet. See Official Rules for eligibility." |
| `UNDERAGE` | "You must be 18 or older to enter." |
| `EMAIL_UNVERIFIED` | "Verify your email to start spinning. Resend verification." |
| `ACCOUNT_RESTRICTED` | "Your account is under review. Contact support." |
| `CHALLENGE_REQUIRED` | Renders Turnstile inline; no error text. |

Loss copy states the fact and the count, nothing more: *"Not this time. You still have 7 spins left
today."* No near-miss language, no encouragement to continue, no streak framing.

The `noPurchaseStatement` from the active rules version renders adjacent to the spin control, not in
the footer.

---

## 12. Accessibility

The reduced-motion path is designed first, not retrofitted, because the core interaction *is* the
animation and a retrofit produces a worse experience for everyone.

- Result reaches the DOM when the mutation resolves; the animation reveals what is already there.
- `aria-live="polite"` region announces the outcome and remaining count as text.
- `prefers-reduced-motion` cross-fades symbols instead of spinning. Same duration budget so pacing is
  preserved.
- A visible Skip control ends the animation immediately. Result unchanged — it was decided server-side.
- Spin is a real `<button>`, keyboard-operable, with visible focus and `aria-busy` while spinning.
- Win and loss are distinguished by text and iconography, never color or motion alone.
- Sound off by default, with a persisted toggle.
- Alt text on prize images from `prizes.description`; captions required on sponsor video.

---

## 13. Testing

Using `convex-test`. The tests that must exist, because each maps to a way this product fails
expensively:

**Spin mutation**
1. Ten spins succeed, eleventh returns `NO_SPINS_REMAINING`.
2. Same idempotency key twice → one spin row, identical result both times.
3. Twenty parallel spins on a ten-spin balance → exactly ten rows.
4. Winning entry reached by parallel spins → exactly one `isPotentialWinner`, one claim, campaign
   `winner_pending`. **The single most important test in the codebase.**
5. Spin after `winner_pending` → `CAMPAIGN_NOT_LIVE`.
6. Each eligibility gate rejects with its specific code.
7. Reset boundary: spins either side of the campaign-timezone reset hour land on different
   `resetDate` keys, including across a DST transition.
8. Non-winning spins never produce `7-7-7`, over a large sample.

**Winner engine**
9. Revealed target and nonce reproduce `commitmentHash`.
10. Winning spin's `shard`/`shardSequence` equal the revealed target.
11. Across simulated volume, win position lands within a tolerance of `projectedVolume`.

**Admin and claims**
12. Non-admin identity is rejected by every admin function.
13. Sponsor session cannot reach `users`, `spins`, or `claims`.
14. Every admin mutation writes an audit log entry — asserted by counting entries before and after.
15. Odds fields reject writes once status leaves `draft`.
16. Publishing a winner copies only consented fields into `winnerArchive`.

**Notifications**
17. The winner notification action run twice sends once.

---

## 14. Build Order

Sequential, each checkpoint independently verifiable. This is what keeps a single large spec
executable.

| # | Slice | Done when |
|---|---|---|
| 1 | Convex schema, Clerk auth, users | A user signs in and a `users` row exists |
| 2 | Campaign/sponsor/prize/rules tables, seeded by script | Campaign renders from the database |
| 3 | Rules acceptance + eligibility | Ineligible and unaccepted users get correct codes |
| 4 | Balance allocation + reset key | Test 1 and test 7 pass |
| 5 | Spin mutation, no winner engine | Tests 1–3, 6 pass |
| 6 | Winner engine, shards, commitment | Tests 4, 8–11 pass |
| 7 | Reel UI, animation, reduced-motion, a11y | Manual: keyboard-only, screen-reader, reduced-motion |
| 8 | Landing + campaign + rules + winners pages | Empty states honest, no fabricated content |
| 9 | Claim portal + R2 uploads | Claimant completes a claim end to end |
| 10 | Admin: campaigns, users, claims, audit viewer | Tests 12, 14–16 pass |
| 11 | Fraud signals + Turnstile | Challenge flow round-trips through the action |
| 12 | Notifications + analytics | Test 17 passes; server events reconcile with the database |
| 13 | Sponsor dashboard | Test 13 passes; aggregates match admin figures |
| 14 | Legal pages, Sentry, load test of the spin path | Spin path holds target concurrency |

Checkpoint 6 is the go/no-go. If the winner engine tests do not pass, nothing downstream is worth
building.

---

## 15. Not Building

Paid spins, wallets, deposits, prize pools, cryptocurrency, multiple simultaneous campaigns,
user-to-user transfers, referrals, native apps, sponsor self-service campaign creation, loyalty
points, marketplace, social feeds, livestreaming. Per brief §27, and referrals specifically stay
disabled pending legal review (brief §15).

Also not building, with reasons: **fixed-probability mode** (§4 — makes duration unsellable and the
product worse), **encryption of the winning target** (§4 — the commitment hash defends against the
actual threat; encryption defends against a weaker one), and **midnight fan-out of balance rows**
(§3 — cost scales with registered users instead of active ones, and its failure mode is total).

---

## 16. Open Decisions Blocking Implementation

Carried from PRODUCT.md, with what each one blocks:

**Still open:**

1. **Counsel sign-off on the jurisdiction set in §17.** The research is done and encoded; a lawyer
   confirming or overruling it is what remains. Nothing blocks *building* checkpoint 3 — the data
   exists — only launching on it.
2. **Actual odds** (`oddsDenominator`) — blocks activating a real campaign, not building one. The
   tier default is the specified 10^columns; see the economic hazard in §4.
3. **Whether the reels ever pay smaller than the jackpot** — spec builds binary per the brief. If
   tiered rewards are ever wanted, `spins.symbols` and a `prizeTier` field absorb it without
   touching the winner engine, but the Official Rules would need republishing.

**Resolved 2026-08-06:**

4. **End date** — none. Campaigns run until a valid winner is confirmed. `endAt` optional. Correct
   below the ~$5,000 prize threshold; revisit above it (§2).
5. **Disqualification policy** — `resume_campaign`, by implication of the open-ended promise. Needs
   explicit confirmation before launch because it goes into the Official Rules verbatim (§6).
6. **Winner verification and anonymity** — full identity verification, and winners are published by
   name and photograph (§7). Two derived requirements: the publicity release must be in the Official
   Rules before the first spin, and no SSN or ITIN is ever stored in a database field.

All three are now launch gates rather than code gates. **Checkpoint 1 is unblocked.**

---

## 17. Jurisdictions

**Recommended, pending counsel.** Desk research, not legal advice. Encoded with per-exclusion
reasoning in `app/lib/jurisdictions.ts` and asserted by `npm run check:spin`.

**Open to legal residents of the 50 US states and DC, aged 18 or older, excluding Tennessee,
Alabama, Nebraska, Mississippi, all US territories, and overseas military installations.** That is
46 states plus DC.

| Excluded | Why | What would reopen it |
|---|---|---|
| **TN** | Its consumer protection act makes conditioning receipt of a prize on consent to promotional use a deceptive practice. The mandatory publicity release (§7) is therefore unenforceable there. **The only state with this restriction.** | Making publicity optional |
| **AL**, **NE** | Minimum age 19 | A per-region age floor instead of one `minimumAge` |
| **MS** | Minimum age 21 | Same |
| Territories, overseas bases | Separate regimes; Puerto Rico has its own promotion rules | Reviewing each on its own |

Tennessee is excluded **as a consequence of the anonymity decision, not on its own merits.** That is
the trade being made: one state, roughly 2% of the US population, in exchange for publishing every
winner's name and photograph. Worth restating whenever the publicity requirement is revisited.

Rhode Island **stays eligible.** Its registration duty attaches to retail-linked promotions above
$500 in prizes, and this product is online-only with no in-store component. A sponsor who ties a
campaign to physical stores brings that duty back at a threshold ten times lower than NY or FL.

### Registration and bonding

New York and Florida require registration **and a surety bond for the total prize value** when prizes
**exceed $5,000**. NY: at least 30 days before the start, $100 fee. FL: at least 7 days before. Both
require a winners list afterward.

**$5,000 is exactly tier 4's ceiling**, so the tier ladder has a compliance cliff between tiers 4 and
5. This alignment is worth preserving deliberately when the tier table is edited; the self-check
asserts it.

| Tiers | Prize value | Registration | End date |
|---|---|---|---|
| 1–4 | up to $5,000 | none | open-ended is fine |
| 5–6 | above $5,000 | NY + FL, bond for full value, 30 days' lead | **hard end date needed** |

The end-date column is the resolution of §2's earlier tension. Open-ended is genuinely safe below the
threshold; above it, those filings assume a stated period and an open-ended run leaves a bond for the
full prize value outstanding indefinitely.

### Sources

- [Klein Moynihan Turco — sweepstakes registration and bonding](https://kleinmoynihan.com/sweepstakes-registration-and-bonding-requirements-2/)
- [Fasthoff Law Firm — registration and bonding by state](https://fasthofflawfirm.com/blog/sweepstakes-state-registration-bonding)
- [BeeLiked — state prize bonding, legal exclusions, participant eligibility](https://www.beeliked.com/beelegal/navigating-us-sweepstakes-state-prize-bonding-legal-exclusions-and-participant-eligibility)
- [Brandmovers — 2026 promotions compliance guide](https://blog.brandmovers.com/promotions-compliance-in-2026-sweepstakes-instant-win-and-ugc-rules-marketers-must-know)
- [Tennessee Code § 47-18-124 (Justia)](https://law.justia.com/codes/tennessee/title-47/chapter-18/part-1/section-47-18-124/)
- [American Sweepstakes — Tennessee](https://american-sweeps.com/sweepstakes-contest-laws/tennessee/)
- [SweepPea — Tennessee rules](https://www.sweeppeasweeps.com/sweepstakes-and-contest-rules-tennessee/)
- [Woobox — state-by-state overview](https://woobox.com/articles/sweepstakes-legal-requirements-by-state)
