# Campaign Admin (Launch a New Campaign) — Design

**Status:** approved by the user in chat, section by section; then reviewed by the
user against the written spec, who found three real issues (an unsafe race on
single-active-campaign enforcement, a non-atomic multi-mutation creation flow, and
`endAt` being recorded without being either enforced or honestly described as
inert) plus one smaller one (`resetTimezone` accepting any string). All four are
fixed below — see "Revised after user spec review" at the end for exactly what
changed and why.

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
- **`endAt` entirely.** Not a form field, not a `createDraftCampaign` argument. The
  schema field stays (already there, optional, already unused before this build) but
  this build does not expose it. A field an admin can fill in that the runtime
  silently ignores is worse than no field at all, especially for a number with
  potential Official Rules significance — see "Revised after user spec review."
  `ROADMAP.md`'s deferred `endAt`-enforcement item is unchanged by this decision;
  when that gets resolved, exposing it here is a small follow-up, not a redesign.
- **Sponsor reuse.** A freshly created sponsor row happens only on the "new prize"
  path (see Decisions and "Revised after user spec review") — reusing an existing
  prize reuses its existing sponsor too, since a prize belongs to exactly one
  sponsor (`prizes.sponsorId`).
- **Traffic-estimation modeling.** No "expected visitors × days" calculator — the
  admin enters the target volume directly (see Decisions, "one number, not two").

## Decisions (from user Q&A during brainstorming)

1. **Sponsor: always create new when the prize is new** — revised after user spec
   review: a prize belongs to exactly one sponsor (`prizes.sponsorId`), so *reusing*
   a prize necessarily reuses its sponsor too; there is no path that attaches a
   freshly created sponsor to a reused prize. "Always create new" describes the
   new-prize path, not a blanket rule independent of prize reuse.
2. **Prize: create new, or pick an existing one.** A prize can legitimately recur
   (the same gift card offered again); a sponsor relationship, per this product's
   current stage, does not — see Decision 1's revision for exactly how these two
   compose.
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
   before the one truly irreversible step. Revised after user spec review: "only one
   campaign live at a time" is enforced *inside* the same transaction that flips
   `draft → live` (`sealTarget`), not as a separate pre-check an action runs before
   calling it — see "Revised after user spec review."
7. **Tier 5-6 (prize ≥ `REGISTRATION_THRESHOLD_CENTS`, $5,000): allowed, with a
   warning**, not blocked outright. The warning names the real, currently-unaddressed
   gap (`ROADMAP.md`'s deferred `endAt`-enforcement item) in prose — it does not
   reference an `endAt` field, since this build doesn't expose one (see Scope).

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

### `createDraftCampaign`

**One mutation, one transaction** — revised after user spec review from an earlier
draft of this spec that had three separate mutations (`createSponsor`, `createPrize`,
`createDraftCampaign`) called in sequence from the client, explicitly accepting that
a failure partway through could leave an orphaned sponsor or prize row. There is no
real benefit to that sequencing happening client-side: a single Convex mutation is
already one atomic transaction regardless of how many `ctx.db.insert` calls it makes
internally, so folding sponsor/prize creation into this one mutation gets atomicity
for free. `createSponsor` and `createPrize` are **not separate exported mutations**
in this design — they're private helper functions in the same file, called only from
here.

```typescript
args: {
  // Campaign title/description — distinct from prize.new's own title/description
  // below, which describe the prize itself, not the campaign.
  title: v.string(),
  description: v.string(),
  // A prize belongs to exactly one sponsor (prizes.sponsorId) — reusing a prize
  // means reusing its sponsor too. There is no combination that creates a new
  // sponsor for a reused prize, or reuses a sponsor for a new prize.
  prize: v.union(
    v.object({
      kind: v.literal("existing"),
      prizeId: v.id("prizes"),
    }),
    v.object({
      kind: v.literal("new"),
      sponsor: v.object({
        name: v.string(),
        websiteUrl: v.string(),
        ctaLabel: v.string(),
        ctaUrl: v.string(),
        description: v.string(),
        contactName: v.string(),
        contactEmail: v.string(),
      }),
      title: v.string(), // the prize's title, not the campaign's
      description: v.string(), // the prize's description, not the campaign's
      estimatedRetailValueCents: v.number(),
      currency: v.optional(v.string()), // defaults to "USD"
      quantity: v.optional(v.number()), // defaults to 1
      fulfillmentType: v.union(
        v.literal("physical"),
        v.literal("digital"),
        v.literal("experience"),
      ),
      fulfillmentNotes: v.string(),
    }),
  ),
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
}
returns: v.id("campaigns")
```

Note what's *not* here versus the earlier draft: no `sponsorId`/`prizeId` arguments
(they come from the `prize` union instead), and no `endAt` argument at all (see
Scope — this build doesn't expose it).

Handler, in order:

1. `requireAdmin(ctx)`.
2. `title`/`description` trimmed/non-empty/capped at 120 chars (same
   `MAX_NAME_LENGTH`-style convention `claims.ts` already established for
   `legalName`) — throws `CAMPAIGN_TITLE_REQUIRED` / `CAMPAIGN_TITLE_TOO_LONG`.
3. **Resolve the prize and sponsor**, branching on `args.prize.kind`:
   - `"existing"`: look up `args.prize.prizeId` — throw `PRIZE_NOT_FOUND` if it
     doesn't resolve. Look up its `sponsorId` from the prize row itself (not a
     separate argument) — throw `SPONSOR_NOT_FOUND` if that sponsor is somehow
     missing (shouldn't happen given the foreign key, but never trust a reference
     without confirming what it points to, same discipline as everywhere else in
     this codebase).
   - `"new"`: validate `args.prize.sponsor.name` (trimmed/non-empty/capped, same
     convention) and `args.prize.title` (same), validate
     `estimatedRetailValueCents` is a positive integer — throws
     `PRIZE_VALUE_INVALID` (mirrors `sealTarget`'s existing
     `Number.isInteger(...) && ... > 0` style range checks) — validate `quantity`
     is a positive integer if provided (defaults to `1`). Then, in this same
     transaction: insert the sponsor (`status: "active"`, slug derived from name —
     see step 6 for the slugging scheme, no `logoStorageId`/`brandColor`, no image
     upload per Scope), then insert the prize referencing that new sponsor's id
     (`imageStorageIds: []` per Scope).
4. `dailySpins` positive integer; `resetHour` integer in `[0, 23]`.
5. **`resetTimezone`: validated as a real IANA timezone name**, not just a
   non-empty string — revised after user spec review. `convex/lib/resetDate.ts`'s
   `resetDateKey` already calls `new Intl.DateTimeFormat("en-CA", { timeZone:
   timezone, ... })` on every single spin; an invalid timezone string accepted at
   creation time would throw a `RangeError` there instead, breaking every spin on
   the campaign rather than failing once, up front, when it's cheap to fix.
   Validate with the same primitive: `new Intl.DateTimeFormat("en-US", { timeZone:
   args.resetTimezone })` inside a `try`/`catch`, throwing `INVALID_TIMEZONE` if it
   throws. (`Intl` is already used elsewhere in this exact runtime —
   `app/lib/tiers.ts`'s `formatMoney` uses `Intl.NumberFormat` — so this needs no
   new dependency.)
6. **`slug`** (for the campaign, and separately for a newly created sponsor in step
   3): derived from the relevant name (lowercase, non-alphanumeric runs collapsed
   to a single `-`, trimmed of leading/trailing `-`), then de-duplicated — if a row
   with that slug already exists, append `-2`, `-3`, ... until unique
   (`campaigns.by_slug` and `sponsors.by_slug`, both confirmed to exist in
   `convex/schema.ts`). Slug is never a user-facing form field on either entity —
   it's a URL-safe identifier, not a marketing surface.
7. `targetVolume` positive integer — throws `TARGET_VOLUME_INVALID`. Written to
   BOTH `projectedVolume` and `oddsDenominator` (Decision 3) — this is the only
   numeric input for that pair; there is no `oddsDenominator` argument.
8. `shardCount`: defaults to `16` if omitted; if provided, must be a positive
   integer — throws `SHARD_COUNT_INVALID`.
9. `reelColumns`: **not an argument** — computed via
   `resolveTier(prizeValueCents).columns` (`convex/lib/tiers.ts`) from whichever
   prize was resolved in step 3 (existing or newly created), so it can never drift
   from the prize's actual value.
10. Eligibility fields written directly from constants: `eligibleCountries: ["US"]`,
    `eligibleRegions: [...ELIGIBLE_JURISDICTIONS]`, `minimumAge: MINIMUM_AGE`
    (`convex/lib/jurisdictions.ts`) — not derived from any argument.
11. `requireEmailVerification: true` (fixed, matching `seed.ts`; not a form field —
    no product reasoning surfaced for varying this per campaign).
12. Insert the campaign: `status: "draft"`, `commitmentHash: "PENDING_ACTIVATION"`,
    `startAt: Date.now()` (placeholder — real semantic meaning is assigned at
    activation, but the field is non-optional on the schema so it needs a value at
    insert time; `sealTarget` overwrites it — see below), `activeRulesVersion: 1`.
    No `endAt` field written at all.
13. Insert the `campaignRules` row in the same transaction: `version: 1`,
    `title: "Official Rules"`, `content: args.rulesContent`, `noPurchaseStatement`
    fixed to the exact `PRODUCT.md`-prescribed string ("No purchase necessary. A
    purchase will not increase your chances of winning. Eligibility restrictions
    apply. See Official Rules."), `oddsStatement` computed exactly like `seed.ts`
    does: `` `Stated odds of ${formatOdds(targetVolume)} are based on the expected
    number of eligible entries; actual odds depend on the total entries received.` ``,
    `effectiveAt: Date.now()`.
14. `writeAudit`: `actorType: "admin"`, `action: "campaign.created"`,
    `entityType: "campaigns"`, `entityId: <new campaign id>`,
    `after: { slug, title, sponsorId, prizeId, targetVolume }` (if a new sponsor
    and/or prize were created in step 3, their own creation is *not* separately
    audited — this whole operation is one admin action, "created a campaign," and
    splitting it into three audit entries for one atomic transaction would be
    noise, unlike `admin.ts`'s claim-review actions, which really are separate
    events happening at separate times).
15. Returns the new campaign's `_id`.

### `listPrizes` (query, for the "pick an existing prize" picker)

```typescript
args: {}
returns: array of { _id, title, estimatedRetailValue, sponsorName }
```

- `requireAdmin(ctx)`.
- New — confirmed no `convex/prizes.ts` file or equivalent query exists today;
  prize reads currently only happen inline inside `campaigns.ts`/`admin.ts`.
  Returns every prize (small table in practice, same full-scan acceptance
  `listPendingClaims` already documents), joined with its sponsor's name for
  display.

### `winnerEngine.sealTarget` (modified) and `campaignAdmin.activate` (new, admin-facing)

**Two real gaps found while writing and then revising this spec, both fixed in
`sealTarget` itself:**

1. **`sealTarget` never touches campaign status.** That only worked in the existing
   CLI flow because `seedCampaign` already inserts the campaign with
   `status: "live"` *before* `activateCampaign` ever runs. This build's campaigns
   start at `status: "draft"` instead, so without a change, a campaign would seal
   successfully and then sit in `draft` forever — activated in every sense except
   the one that makes it playable.
2. **"Only one campaign live at a time" needs to be the transaction's own
   invariant, not a pre-check an action runs before calling it** — revised after
   user spec review. The earlier draft of this spec put this check in a
   `ctx.runQuery` the admin-facing action ran *before* calling the sealing action,
   and explicitly accepted that two concurrent activations could still both
   succeed, reasoning that activation is rare enough not to matter. That reasoning
   doesn't hold for something controlling a live prize promotion: two browser
   tabs, a retry, or two admins acting around the same time could genuinely both
   attempt this. The fix is to make the database transaction itself the guarantee,
   not a best-effort check outside it.

**Resolution — `sealTarget` (`convex/winnerEngine.ts`) gains, immediately before its
existing writes:**

```typescript
const others = await ctx.db.query("campaigns").withIndex("by_status", (q) => q.eq("status", "live")).collect();
const pending = await ctx.db.query("campaigns").withIndex("by_status", (q) => q.eq("status", "winner_pending")).collect();
if ([...others, ...pending].some((c) => c._id !== args.campaignId)) {
  throw new Error("ANOTHER_CAMPAIGN_ACTIVE");
}
```

(Excluding `args.campaignId` itself matters: in the existing CLI flow, the campaign
being sealed is *already* `status: "live"` at the moment `sealTarget` runs — set by
`seedCampaign` beforehand — so an unqualified check would make the CLI flow fail
its own exclusivity check against itself.)

And its existing `ctx.db.patch(args.campaignId, { commitmentHash:
args.commitmentHash })` becomes `{ commitmentHash: args.commitmentHash, status:
"live" }`. `sealTarget` is already the single source of truth for "a campaign is
sealed" — this is where "sealed, therefore exclusively playable" belongs, inside
the one mutation whose transaction actually enforces it, not split across a
pre-check and a separate write. Backward-compatible with the existing CLI flow:
`seedCampaign` already sets `status: "live"` first, so re-patching it to `"live"`
is a no-op there, and no existing test asserts anything about status immediately
after calling `sealTarget` in isolation (confirmed by reading
`convex/winnerEngine.test.ts`).

**The plan must include a test proving the exclusivity guarantee is real**: two
campaigns both in `draft`, activate the first successfully, then attempt to
activate the second and confirm it throws `ANOTHER_CAMPAIGN_ACTIVE` with nothing
about the second campaign's state changed — not just a test that checks the happy
path reaches `status: "live"`. This mirrors exactly the lesson from this session's
`resume_campaign` bug: a test that only checks the state-flip, not the invariant
under contention, would have shipped the same class of bug again.

### `campaignAdmin.activate`

```typescript
args: { campaignId: v.id("campaigns") }
returns: v.null()
```

Named `activate`, not `activateCampaign` — `convex/winnerEngine.ts` already exports
an `internalAction` called `activateCampaign`, and this new, distinctly-named,
admin-facing entry point in `convex/campaignAdmin.ts` calls straight into it rather
than duplicating its randomness-drawing logic.

- Is an `action` (not a `mutation`), because it needs to call
  `internal.winnerEngine.activateCampaign` — itself an `internalAction` — and
  actions call other actions/mutations via
  `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction`, never the reverse.
- Step 1, via `ctx.runQuery` on a new small internal query: `requireAdmin(ctx)`;
  throw `CAMPAIGN_NOT_FOUND` if the campaign doesn't exist; throw
  `CAMPAIGN_NOT_DRAFT` if `status !== "draft"` (covers both "already activated"
  and "not a real campaign to activate" — mirrors `sealTarget`'s own
  `TARGET_ALREADY_SEALED` guard one level up). This step is a fast-fail UX nicety
  only, checking the obvious cases before spending the crypto/randomness work in
  step 2 — it is **not** where the exclusivity guarantee lives; that's
  `sealTarget`'s own authoritative, transactional check (see above). A request
  that passes this pre-check can still legitimately fail at the `sealTarget` step
  if another activation won the race in between — that's the guarantee working as
  intended, not a bug to route around here.
- Step 2: `ctx.runAction(internal.winnerEngine.activateCampaign, { campaignId })` —
  reuses the existing internal action exactly as-is; no duplicated randomness
  logic. This is what actually calls the now-modified `sealTarget`.
- Step 3: `writeAudit` — `actorType: "admin"`, `action: "campaign.activated"`,
  `entityType: "campaigns"`, `entityId: campaignId`,
  `before: { status: "draft" }`, `after: { status: "live", commitmentHash: "sealed" }`
  (never the raw hash or target — same secrecy discipline every other audit entry
  touching `campaignSecrets`/`commitmentHash` already follows). This is a
  *separate* audit entry from `sealTarget`'s own existing `campaign.seal_target`
  entry (`entityType: "campaigns"`, logs the hash) — both fire, recording the
  mechanical seal and the admin's deliberate act as the two distinct things they
  are. If step 2 throws (including `ANOTHER_CAMPAIGN_ACTIVE`), this step never
  runs — no audit entry is written for a failed activation attempt, matching how
  every other mutation in this codebase only audits a state change that actually
  happened.

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

One form, one `useMutation(createDraftCampaign)` call on submit — no client-side
sequencing of multiple mutations, since `createDraftCampaign` now does everything
in one transaction (see Backend). A toggle between "pick an existing prize"
(`<select>` fed by `useQuery(listPrizes)`) and "create a new prize" switches which
set of fields the form collects and which shape of the `prize` union it sends —
the sponsor fields only appear on the "new prize" path.

Same "deliberately unstyled, inline `style={{}}`" convention as the rest of
`app/admin/*` (per the original claim-verification plan's own approved decision —
this is an internal tool, not a public surface). Redirects to the campaign detail
page on success.

### `app/admin/campaigns/[campaignId]/page.tsx` (new)

Shows every field the campaign was created with, the computed tier/columns/default-odds
context, a `REGISTRATION_THRESHOLD_CENTS`-gated warning banner (Decision 7) reading
something like *"This prize is $5,000 or more — NY/FL registration and bonding
apply, and this system does not yet enforce a hard end date for that requirement
(see ROADMAP.md). Confirm this has been handled outside the app before
activating."* (Prose only — no `endAt` field is shown or settable here, since this
build doesn't expose one; see Scope.) An **Activate** button behind
`window.confirm()` (matching `onApprove`/`onPurge`'s existing pattern in
`app/admin/claims/[claimId]/page.tsx`), disabled/hidden once `status !== "draft"`.
If activation throws `ANOTHER_CAMPAIGN_ACTIVE`, show that plainly — it's not an
error path to hide, it's the exclusivity guarantee doing its job.

### `app/admin/page.tsx` (modified)

Add a "New campaign" link and a small campaigns list (from `listCampaigns`) above
or alongside the existing claims queue, so this isn't a dead-end URL only reachable
by typing it directly.

## Validation & guardrails summary

- Every string field: trimmed, non-empty, capped (120 chars, matching `claims.ts`'s
  established `MAX_NAME_LENGTH` convention) where it's a name/title.
- Every numeric field: positive-integer-checked before insert, matching
  `sealTarget`'s existing `Number.isInteger(...) && ... > 0` style.
- `resetTimezone` validated as a real IANA timezone name via
  `Intl.DateTimeFormat`, not just checked for non-emptiness.
- Every foreign key (an existing `prizeId`, or a prize's `sponsorId` once
  resolved) verified to resolve to a real row before being written into a new row
  that references it.
- Sponsor/prize/campaign/rules creation is one mutation, one transaction — no
  partial-creation state is reachable at all, let alone left unaddressed.
- `sealTarget`: the sole, transactional enforcement point for "only one campaign
  is ever `live`/`winner_pending` at a time" — not a pre-check an action runs
  before calling it.
- `campaignAdmin.activate`: `draft`-only, admin-only; its own pre-check is a
  fast-fail UX nicety, not the exclusivity guarantee (that's `sealTarget`'s job).
- Tier 5-6 gets a warning, never a block, per Decision 7 — and no `endAt` field to
  half-implement alongside that warning (see Scope).

## Resolved during spec self-review

- **`campaigns.by_slug` and `sponsors.by_slug`** are both confirmed to exist
  (`convex/schema.ts`) and are the right indexes for the respective
  slug-uniqueness checks in `createDraftCampaign`.
- **`listPrizes`** is a new query in `convex/campaignAdmin.ts` (admin-gated,
  returns existing prizes for the "pick an existing prize" picker) — confirmed no
  `convex/prizes.ts` file or equivalent query exists today; prize reads currently
  only happen inline inside `campaigns.ts`/`admin.ts`.

## Revised after user spec review

The user reviewed the written spec (not just the in-chat design) and found three
real issues plus one smaller one. All four are reflected in the sections above;
this is the summary of what changed and why, kept here so the reasoning survives
even if someone only skims the final shape:

1. **Single-active-campaign enforcement had a real race.** The original draft put
   the "no other campaign is live/winner_pending" check in a pre-check the
   activation action ran before calling the sealing action, and explicitly
   accepted that two concurrent activations could both succeed — reasoning that
   activation is rare enough not to matter. Rejected: rarity doesn't make a race
   acceptable on something controlling a live prize promotion. Fixed by moving the
   check *inside* `sealTarget` itself, so the database transaction is the actual
   guarantee, not a best-effort check running outside it.
2. **Sponsor/prize/campaign creation wasn't atomic.** The original draft had three
   separate exported mutations (`createSponsor`, `createPrize`,
   `createDraftCampaign`) called in sequence from the client, and explicitly
   accepted that a failure partway through could leave an orphaned sponsor or
   prize row. There was no real benefit to that sequencing happening client-side —
   a single Convex mutation is already one transaction regardless of how many
   inserts it performs internally. Fixed by folding sponsor/prize creation into
   one `createDraftCampaign` mutation; `createSponsor`/`createPrize` are no longer
   separate exported functions at all.
3. **`endAt` was recorded without being enforced, which is worse than not having
   it.** The original draft let the admin set `endAt` "for documentation
   purposes" on tier 5-6 campaigns while plainly stating nothing enforces it. A
   field that looks operational but silently does nothing is a worse shape than no
   field, especially for a number with potential Official Rules significance.
   Fixed by removing `endAt` from this build entirely (not a form field, not a
   `createDraftCampaign` argument) — the tier 5-6 warning names the gap in prose
   instead. This doesn't reopen the earlier decision (from a prior conversation
   this session) not to build `endAt` *enforcement* yet; it just stops this build
   from pretending to track something it doesn't act on.
4. **`resetTimezone` accepted any non-empty string.** Fixed with real IANA
   timezone validation (`Intl.DateTimeFormat`, catching the `RangeError` an
   invalid zone throws) — worth doing now rather than deliberately carrying
   forward a weakness `seed.ts` has, especially since an invalid timezone
   currently wouldn't fail until the first spin tries to compute a reset date,
   not at creation time when it's actually cheap to catch.
