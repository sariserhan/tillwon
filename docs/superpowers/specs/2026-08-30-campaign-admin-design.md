# Campaign Admin (Launch a New Campaign) — Design

**Status:** approved by the user in chat, section by section; being written up here per
`superpowers:brainstorming`'s architectural path before planning.

**Spec:** builds on `docs/superpowers/specs/2026-08-06-tillwon-design.md` (the original
product design) and `docs/superpowers/specs/2026-08-30-claim-verification-design.md`
(the admin-review precedent this reuses conventions from).

## Problem

There is no admin-facing way to launch a new campaign. `convex/campaigns.ts` has no
mutations at all — only the public `getActiveCampaign` read. Creating and sealing a
campaign only happens through `convex/winnerEngine.ts`'s `activateCampaign`, which is
`internalAction`-only and documented as CLI-operated (`npx convex run`, using deploy
credentials): *"There is no admin UI yet, so activation happens through `npx convex
run`."* `convex/seed.ts`'s `seedCampaign` is similarly internal and hardcoded to one
specific $100 gift card scenario.

The admin UI (`app/admin/*`) has exactly two pages, both for claim review. Once the
current campaign completes (`approveClaim`) or is cancelled (`end_campaign` policy),
starting the next one requires a developer at a terminal, hand-inserting `sponsors` /
`prizes` / `campaigns` / `campaignRules` rows and running the sealing action manually.
This is the gap: an "admin" role already exists and is used for claim review, but has
zero ability to actually launch a promotion through the app.

## Scope

Full campaign creation: a new sponsor (created fresh each time — this product has no
recurring sponsor relationship to reuse per `PRODUCT.md`'s "Evidence on Hand: None"),
a prize (create new, or reuse an existing one — unlike sponsors, prizes may
legitimately repeat), the campaign's own parameters, its Official Rules text, and a
separate, explicit activation step that seals the cryptographic commitment.

Out of scope for this build (each is a real, separately-decidable follow-up, not
forgotten — noted so this doesn't quietly become a bigger project):

- **Prize images.** No upload UI in this pass. `PRODUCT.md`: *"No identity
  assets... no prize photography."* `prizes.imageStorageIds` stays `[]`.
- **A rules-text template/generator.** Free-text textarea only — this product has no
  legal-reviewed template to templatize yet, and admin (or whoever reviews it, e.g.
  counsel) pastes in final wording, same as `seedCampaign`'s current placeholder.
- **Per-campaign jurisdiction/age customization.** Fixed to the existing
  `ELIGIBLE_JURISDICTIONS` / `MINIMUM_AGE` constants (`convex/lib/jurisdictions.ts`) —
  that list encodes real, already-researched legal reasoning (Tennessee's
  publicity-consent law, Alabama/Nebraska/Mississippi's age floors, etc.) that a
  free-form picker could silently violate.
- **`endAt` enforcement.** Already tracked as deferred in `ROADMAP.md` — this build
  lets an admin *record* an optional `endAt` for documentation purposes on a tier 5-6
  campaign, but nothing enforces it, and the form says so.
- **Sponsor reuse.** Every campaign gets a freshly created sponsor row (see Decisions).
- **Traffic-estimation modeling.** No "expected visitors × days" calculator — the
  admin enters the target volume directly (see Decisions, "one number, not two").

## Decisions (from user Q&A during brainstorming)

1. **Sponsor: always create new**, never reuse an existing one. One form, one flow —
   no sponsor picker/dropdown.
2. **Prize: create new, or pick an existing one.** A prize can legitimately recur
   (the same gift card offered again); a sponsor relationship, per this product's
   current stage, does not.
3. **`projectedVolume` and `oddsDenominator` are the same number, not two.** Schema
   comment: `projectedVolume: v.number(), // must equal oddsDenominator`
   (`convex/schema.ts`), and `convex/seed.ts` confirms it in practice:
   `projectedVolume: oddsDenominator, oddsDenominator,`. **The form has exactly one
   field for this** ("target volume" / stated odds denominator — same value), not
   two independent numbers an admin could mismatch. Pre-filled with
   `defaultOddsDenominator(tier)` (`convex/lib/tiers.ts`) as a starting suggestion,
   editable — `PRODUCT.md` is explicit that "actual odds... depend on a traffic
   estimate that does not exist yet," so this is a real number the admin supplies,
   not something the form derives from a model that doesn't exist.
4. **Official Rules: free-text textarea**, admin (or whoever reviews it) writes the
   final wording directly. No template generation.
5. **Eligibility: fixed to the standard list.** Not a per-campaign form field at all.
6. **Two-step activation: create as `draft`, then a separate confirmed Activate
   action** that seals the target. Avoids ever having a "live but unsealed" window
   (which the current CLI flow technically permits between `seedCampaign` and
   `activateCampaign` running back to back), and gives the admin a review point
   before the one truly irreversible step.
7. **Tier 5-6 (prize ≥ `REGISTRATION_THRESHOLD_CENTS`, $5,000): allowed, with a
   warning**, not blocked outright. The warning names the real, currently-unaddressed
   gap (`ROADMAP.md`'s deferred `endAt` enforcement item) rather than silently
   allowing or silently refusing.

## Data model

No schema changes — every table this touches (`sponsors`, `prizes`, `campaigns`,
`campaignRules`) already exists with every field this build needs. This is a backend
+ frontend build only.

## Backend: `convex/campaignAdmin.ts` (new file)

Mirrors `convex/admin.ts`'s conventions exactly: every mutation starts with
`requireAdmin(ctx)` (`convex/lib/admin.ts`), every state-changing mutation calls
`writeAudit` (`convex/lib/audit.ts`), state-machine preconditions are asserted before
any write (never assumed), and doc comments explain the non-obvious *why*, not the
*what*.

### `createSponsor`

```typescript
args: {
  name: v.string(),
  websiteUrl: v.string(),
  ctaLabel: v.string(),
  ctaUrl: v.string(),
  description: v.string(),
  contactName: v.string(),
  contactEmail: v.string(),
}
returns: v.id("sponsors")
```

- `requireAdmin(ctx)`.
- `name` trimmed, non-empty, capped (reuse the 120-char convention `claims.ts`
  already established for `legalName` — `SPONSOR_NAME_MAX_LENGTH = 120`), throws
  `SPONSOR_NAME_REQUIRED` / `SPONSOR_NAME_TOO_LONG`.
- `slug`: derived from `name` (lowercase, non-alphanumeric runs collapsed to a single
  `-`, trimmed of leading/trailing `-`), then de-duplicated: if a sponsor with that
  slug already exists, append `-2`, `-3`, ... until unique. (`sponsors.by_slug` index
  already exists for this lookup.) Slug is never a user-facing form field — this
  mirrors how `campaigns.slug` is already just a URL-safe identifier, not a marketing
  surface.
- Insert with `status: "active"`. No `logoStorageId` / `brandColor` in this build (no
  image upload — see Scope).
- `writeAudit`: `actorType: "admin"`, `action: "sponsor.created"`,
  `entityType: "sponsors"`, `entityId: <new id>`, `after: { name, slug }`.
- Returns the new sponsor's `_id` so the campaign-creation form can chain into it.

### `createPrize`

```typescript
args: {
  title: v.string(),
  description: v.string(),
  estimatedRetailValueCents: v.number(),
  currency: v.optional(v.string()), // defaults to "USD"
  quantity: v.optional(v.number()), // defaults to 1
  fulfillmentType: v.union(v.literal("physical"), v.literal("digital"), v.literal("experience")),
  fulfillmentNotes: v.string(),
  sponsorId: v.id("sponsors"),
}
returns: v.id("prizes")
```

- `requireAdmin(ctx)`.
- `title` trimmed, non-empty, capped at 120 chars — same convention, throws
  `PRIZE_TITLE_REQUIRED` / `PRIZE_TITLE_TOO_LONG`.
- `estimatedRetailValueCents` must be a positive integer — throws
  `PRIZE_VALUE_INVALID` (mirrors `sealTarget`'s existing
  `Number.isInteger(...) && ... > 0` style range checks in `winnerEngine.ts`).
- `quantity` must be a positive integer if provided; defaults to `1`.
- Verify `sponsorId` resolves to a real, `status: "active"` sponsor — throws
  `SPONSOR_NOT_FOUND` otherwise (a prize with no valid sponsor is exactly the kind of
  dangling reference `claims.ts`'s "a reference alone is never authorization"
  discipline generalizes to: never insert a foreign key without confirming what it
  points to first).
- Insert with `imageStorageIds: []` (see Scope).
- `writeAudit`: `actorType: "admin"`, `action: "prize.created"`,
  `entityType: "prizes"`, `entityId: <new id>`,
  `after: { title, estimatedRetailValueCents, sponsorId }`.
- Returns the new prize's `_id`.

### `createDraftCampaign`

```typescript
args: {
  title: v.string(),
  description: v.string(),
  sponsorId: v.id("sponsors"),
  prizeId: v.id("prizes"),
  dailySpins: v.number(),
  resetTimezone: v.string(),
  resetHour: v.number(),
  targetVolume: v.number(), // becomes BOTH projectedVolume and oddsDenominator
  shardCount: v.optional(v.number()), // defaults to 16, matching seed.ts
  disqualificationPolicy: v.union(
    v.literal("resume_campaign"),
    v.literal("select_alternate"),
    v.literal("end_campaign"),
  ),
  rulesContent: v.string(),
  endAt: v.optional(v.number()),
}
returns: v.id("campaigns")
```

- `requireAdmin(ctx)`.
- `title` trimmed/non-empty/capped, same as sponsor/prize.
- Verify `sponsorId` and `prizeId` both resolve to real rows (same "never trust a
  bare reference" discipline as `createPrize`) — throws `SPONSOR_NOT_FOUND` /
  `PRIZE_NOT_FOUND`.
- `dailySpins` positive integer; `resetHour` integer in `[0, 23]`; `resetTimezone`
  non-empty string (this build does not validate it's a real IANA timezone name —
  same trust level `seed.ts` already gives this field).
- `targetVolume` positive integer — throws `TARGET_VOLUME_INVALID`. Written to BOTH
  `projectedVolume` and `oddsDenominator` (Decision 3). This is the only numeric
  input for that pair; there is no `oddsDenominator` argument at all.
- `shardCount`: defaults to `16` if omitted; if provided, must be a positive integer
  — throws `SHARD_COUNT_INVALID`.
- `reelColumns`: **not an argument** — computed via `resolveTier(prizeValueCents).columns`
  (`convex/lib/tiers.ts`) from the prize just looked up, so it can never drift from
  the prize's actual value.
- `slug`: same derive-and-deduplicate scheme as `createSponsor`, checked against
  `campaigns.by_slug` (confirmed to exist on the `campaigns` table in
  `convex/schema.ts`).
- Eligibility fields written directly from constants: `eligibleCountries: ["US"]`,
  `eligibleRegions: [...ELIGIBLE_JURISDICTIONS]`, `minimumAge: MINIMUM_AGE`
  (`convex/lib/jurisdictions.ts`) — not derived from any argument.
- `requireEmailVerification: true` (fixed, matching `seed.ts`; not a form field —
  no product reasoning surfaced during brainstorming for varying this per campaign).
- `status: "draft"`, `commitmentHash: "PENDING_ACTIVATION"`, `startAt: Date.now()`
  (placeholder — real semantic meaning is assigned at activation, but the field is
  non-optional on the schema so it needs a value at insert time; `activateCampaign`
  below overwrites it), `activeRulesVersion: 1`, `endAt: args.endAt` (undefined if
  not provided).
- Insert the `campaignRules` row in the same mutation: `version: 1`,
  `title: "Official Rules"`, `content: args.rulesContent`, `noPurchaseStatement`
  fixed to the exact `PRODUCT.md`-prescribed string ("No purchase necessary. A
  purchase will not increase your chances of winning. Eligibility restrictions
  apply. See Official Rules."), `oddsStatement` computed exactly like `seed.ts`
  does: `` `Stated odds of ${formatOdds(targetVolume)} are based on the expected
  number of eligible entries; actual odds depend on the total entries received.` ``,
  `effectiveAt: Date.now()`.
- `writeAudit`: `actorType: "admin"`, `action: "campaign.created"`,
  `entityType: "campaigns"`, `entityId: <new id>`,
  `after: { slug, title, sponsorId, prizeId, targetVolume }`.
- Returns the new campaign's `_id`.

### `campaignAdmin.activate` (admin-facing activation)

```typescript
args: { campaignId: v.id("campaigns") }
returns: v.null()
```

Named `activate`, not `activateCampaign` — `convex/winnerEngine.ts` already exports
an `internalAction` called `activateCampaign`, and this new, distinctly-named,
admin-facing entry point in `convex/campaignAdmin.ts` calls straight into it rather
than duplicating its randomness-drawing logic.

**A real gap this build must close, found while writing this spec:** `sealTarget`
(`convex/winnerEngine.ts`) currently only ever patches `commitmentHash` — it never
touches `status`. That's correct for the *existing* CLI flow only because
`seedCampaign` already inserts the campaign with `status: "live"` *before*
`activateCampaign` ever runs. This build's campaigns start at `status: "draft"`
instead, so without a change, a campaign would seal successfully and then sit in
`draft` forever — activated in every sense except the one that makes it playable.

**Resolution:** add `status: "live"` to `sealTarget`'s own existing
`ctx.db.patch(args.campaignId, { commitmentHash: args.commitmentHash })` call,
making it `{ commitmentHash: args.commitmentHash, status: "live" }`. This is the
single source of truth for "a campaign is sealed" already, so this is where "sealed
therefore playable" belongs — not a second, separate patch call from the new
wrapper. It's backward-compatible with the existing CLI flow: `seedCampaign` already
sets `status: "live"` first, so re-setting it to `"live"` there is a no-op. The plan
must include a test asserting a `draft` campaign really does reach `status: "live"`
and become spinnable after `campaignAdmin.activate` runs — this exact
draft-vs-already-live mismatch is precisely what a pre-flight cross-task scan
(per `subagent-driven-development`) exists to catch before dispatching, not after.

Behavior:

- Is an `action` (not a `mutation`), because it needs to call
  `internal.winnerEngine.activateCampaign` — itself an `internalAction` — and
  actions call other actions/mutations via `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`,
  never the reverse.
- Step 1, via `ctx.runQuery` on a new small internal query: `requireAdmin(ctx)`;
  throw `CAMPAIGN_NOT_FOUND` if the campaign doesn't exist; throw
  `CAMPAIGN_NOT_DRAFT` if `status !== "draft"` (covers both "already activated" and
  "not a real campaign to activate" — mirrors `sealTarget`'s own
  `TARGET_ALREADY_SEALED` guard one level up); throw `ANOTHER_CAMPAIGN_ACTIVE` if
  any *other* campaign already has `status: "live"` or `"winner_pending"` (the same
  two statuses `getActiveCampaign` already treats as "the current campaign") — this
  check is a pre-check, not the authoritative guard, so a race between two
  concurrent activations is still only prevented by whichever `sealTarget` call
  commits first; that's acceptable here since activation is a rare, single-admin,
  deliberate action, not a high-concurrency path like `spinExecute`.
- Step 2: `ctx.runAction(internal.winnerEngine.activateCampaign, { campaignId })` —
  reuses the existing internal action exactly as-is; no duplicated randomness logic.
- Step 3: `writeAudit` — `action: "campaign.activated"`, `entityType: "campaigns"`,
  `before: { status: "draft" }`, `after: { status: "live", commitmentHash: "sealed" }`
  (never the raw hash or target — same secrecy discipline every other audit entry
  touching `campaignSecrets`/`commitmentHash` already follows in this codebase).
  Note this is a *separate* audit entry from `sealTarget`'s own existing
  `campaign.seal_target` entry (`entityType: "campaigns"`, logs the hash) — both
  fire, recording the mechanical seal and the admin's deliberate act as the two
  distinct things they are.

### `listCampaigns` (query, for the admin UI)

```typescript
args: {}
returns: array of { campaign fields (picked, not spread — same discipline
  getActiveCampaign already uses), sponsorName, prizeTitle }
```

- `requireAdmin(ctx)`.
- Returns every campaign (small table in practice — same `ponytail:` full-scan
  acceptance `listPendingClaims` already documents for the same reason), newest
  first, joined with sponsor name and prize title for display.

## Frontend

### `app/admin/campaigns/new/page.tsx` (new)

One form: `useMutation(createSponsor)`, either `useMutation(createPrize)` or a
prize picker `<select>` fed by `useQuery(listPrizes)` (both new — see "Resolved
during spec self-review"), then `useMutation(createDraftCampaign)`. Called in
sequence on submit (sponsor → prize → campaign, threading each returned id into the
next call). A failure partway through can leave an orphaned sponsor/prize row —
accepted for v1, see "Resolved during spec self-review."

Same "deliberately unstyled, inline `style={{}}`" convention as the rest of
`app/admin/*` (per the original claim-verification plan's own approved decision —
this is an internal tool, not a public surface). Redirects to the campaign detail
page on success.

### `app/admin/campaigns/[campaignId]/page.tsx` (new)

Shows every field the campaign was created with, the computed tier/columns/default-odds
context, a `REGISTRATION_THRESHOLD_CENTS`-gated warning banner (Decision 7) reading
something like *"This prize is $5,000 or more — NY/FL registration and bonding
apply, and this system does not yet enforce the required hard end date (see
ROADMAP.md). Confirm this has been handled before activating."* An **Activate**
button behind `window.confirm()` (matching `onApprove`/`onPurge`'s existing pattern
in `app/admin/claims/[claimId]/page.tsx`), disabled/hidden once `status !== "draft"`.

### `app/admin/page.tsx` (modified)

Add a "New campaign" link and a small campaigns list (from `listCampaigns`) above
or alongside the existing claims queue, so this isn't a dead-end URL only reachable
by typing it directly.

## Validation & guardrails summary

- Every string field: trimmed, non-empty, capped (120 chars, matching `claims.ts`'s
  established `MAX_NAME_LENGTH` convention) where it's a name/title.
- Every numeric field: positive-integer-checked before insert, matching
  `sealTarget`'s existing `Number.isInteger(...) && ... > 0` style.
- Every foreign key (`sponsorId`, `prizeId`) verified to resolve to a real row
  before being written into a new row that references it.
- `activateCampaign`: `draft`-only, admin-only, and refuses if another campaign is
  already `live`/`winner_pending` — enforced via a query the surrounding action
  checks before calling the internal sealing action.
- Tier 5-6 gets a warning, never a block, per Decision 7.

## Resolved during spec self-review

- **The `status: "draft" → "live"` transition** happens inside `sealTarget`
  (`convex/winnerEngine.ts`), added to its existing `commitmentHash` patch — see the
  `campaignAdmin.activate` section above. Not a separate patch from the new wrapper.
- **`campaigns.by_slug`** is confirmed to exist (`convex/schema.ts`, on the
  `campaigns` table specifically — verified by reading the schema, not assumed) and
  is the right index for the slug-uniqueness check in `createDraftCampaign`.
- **`listPrizes`** is a new query in `convex/campaignAdmin.ts` (admin-gated, returns
  existing prizes for the "pick an existing prize" picker) — confirmed no
  `convex/prizes.ts` file or equivalent query exists today; prize reads currently
  only happen inline inside `campaigns.ts`/`admin.ts`.
- **Multi-step form failure handling**: accept that a partial failure (e.g. sponsor
  and prize created, campaign creation fails) can leave an orphaned sponsor/prize
  row for v1. This is a rare, admin-only, low-volume tool — building
  resumability/cleanup for a partial-form-submission edge case is more machinery
  than the actual risk justifies. If this proves annoying in practice, the fix is
  cheap later (a "pick existing sponsor" escape hatch mirroring the existing "pick
  existing prize" one) and doesn't need to be built preemptively.
