# Claim Verification Design

<!-- impeccable:design-doc 1 -->

## Purpose

TillWon's spin loop is complete and can produce a potential winner, but nothing
in the product can actually verify one. The claim page is descriptive copy
with no upload capability, there is no admin surface at all, and the winner
archive is a static "nobody has won yet" page with no backing data. This spec
covers the minimum pipeline to take a potential winner from "may have won" to
either a published winner or a disqualified claim: document upload, an
admin review queue, and the resulting publication to `/winners`.

This is scoped intentionally narrow. Three adjacent pieces are explicitly
**not** part of this spec, each with its own trigger for later work:

- **W-9 / SSN collection.** Only required once a prize crosses the $600 tax
  threshold. The seeded campaign ($100) never reaches it. Trigger: a real
  prize at or above $600.
- **Reseal-on-rejection.** A rejected claim leaves its campaign paused
  indefinitely; resuming it (sealing a fresh target now that the old shard
  counter has already passed the old one) is real backend work, not a review-
  UI concern. Trigger: the first actual rejection.
- **Physical fulfillment tracking, notification emails, admin invites.** None
  of these block a claim from being verified. The `claims.status` enum
  already reserves room for shipment tracking (`prize_processing`,
  `prize_shipped`, `prize_delivered`) — this spec never writes those values.

## User flows

**Claimant.** A signed-in user with a `potential_winner` (or later) claim
visits `/claim/[reference]`. The existing educational copy (the numbered
steps, "nobody will ever ask you to pay," support links) stays unchanged.
Below it, a form collects: legal first and last name, an optional public
display name ("name as you'd like it published — leave blank to use your
legal name"), a government photo ID upload, a proof-of-address upload, a
photo for the winner archive, and two checkboxes (eligibility affidavit,
publicity release). Each file uploads and registers itself against the claim
as soon as it's picked, independent of final submission — see Security below.
Final submission requires all three documents already registered and both
checkboxes checked, and moves the claim to `under_review`. After submission
the page shows a plain status readout instead of the form — no re-submission
UI in this spec; a claim sent back for more information is out of scope
(`more_info_required` is a reserved status this spec never writes either).

**Admin.** A user whose `role` is `"admin"` or `"superadmin"` visits `/admin`,
which lists every claim currently `under_review`. Opening one shows: the
claimant's legal name, their self-certified region and birthdate (captured at
spin time, for the admin to eyeball against the ID), and the three uploaded
documents via access-controlled links. Two actions:

- **Approve** — the claim becomes `approved`, the campaign becomes
  `completed`, the campaign's sealed target is revealed
  (`revealedTarget`/`revealedNonce`, currently declared on `campaigns` but
  never written by anything), and a `winnerArchive` row is created with only
  the fields the product is allowed to publish.
- **Reject** — the claim becomes `disqualified`, with a required reason
  string recorded in the audit log. The campaign is left exactly as it is
  (still `winner_pending`); resuming it is the deliberately out-of-scope
  manual step described above.

Becoming an admin at all is a manual `role` edit via the Convex dashboard —
no invite flow, matching the existing pattern where campaigns are activated
via `npx convex run`, not a UI.

**Public.** `/winners` queries `winnerArchive` and renders each row: name,
photo, region, prize, date, and the revealed target/nonce pair so a visitor
can independently recompute the commitment hash and confirm it matches what
was published when the campaign opened — the exact claim the current static
copy on that page already makes.

## Data model

Two new tables, one new field on an existing table. Additive only —
`convex/schema.ts` gains these after its existing tables, nothing already
there changes shape.

```typescript
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
}).index("by_claim", ["claimId"]).index("by_claim_type", ["claimId", "type"]),

winnerArchive: defineTable({
  campaignId: v.id("campaigns"),
  claimId: v.id("claims"),
  legalName: v.string(),
  publicDisplayName: v.string(), // legalName if the claimant left the field blank
  photoStorageId: v.id("_storage"),
  region: v.string(),
  prizeTitle: v.string(),
  awardedAt: v.number(),
  revealedTarget: v.string(), // "<winningShard>:<winningCount>"
  revealedNonce: v.string(),
  commitmentHash: v.string(), // the campaign's published hash, copied for an easy side-by-side check
}).index("by_campaign", ["campaignId"]),
```

`claims` gets three new optional fields: `legalName: v.optional(v.string())`,
`eligibilityAffidavitAcceptedAt: v.optional(v.number())` (alongside the
existing `publicityReleaseAcceptedAt`, which was already declared but never
written by anything), and `publicDisplayName: v.optional(v.string())`.
Nothing on `claims`, `campaigns`, `users`, or `campaignSecrets` is removed or
retyped. `campaigns.revealedTarget`/`revealedNonce` (already declared, never
written) get their first writer.

No version field on the affidavit/release acceptance timestamps: there is no
actual versioned affidavit or release text anywhere in the product yet
(unlike `campaignRules`, which genuinely has versions) — a version column
with exactly one possible value is premature. Add it the day that text
actually gets a second version.

**Why `winnerArchive` denormalizes rather than joins:** `/winners` is a public
list page that may eventually show many rows. Storing `legalName`,
`photoStorageId`, `region`, `prizeTitle`, and the reveal fields directly on
the archive row means rendering the list is one query, not N+1 joins back to
`campaigns`/`claims`/`users` — and it freezes exactly what was true at award
time, immune to a later edit anywhere else.

**Why documents are a separate table, not fields on `claims`:** matches the
existing convention (`spinShards` next to `campaigns`, `claimDocuments` next
to `claims`) for data that varies in count per parent row, and keeps the
`claims` row itself free of three optional storage-id fields that would
otherwise need to grow every time a new document type is added.

## Backend functions

**`convex/lib/admin.ts`** (new):

```typescript
export async function requireAdmin(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin" && user.role !== "superadmin") {
    throw new Error("NOT_ADMIN");
  }
  return user;
}
```

**`convex/claims.ts`** (new):

- `getMyClaim` (query, args: `reference: v.string()`) — `requireUser`, finds
  the claim by `claimReference === reference`, then asserts
  `claim.userId === caller._id` before returning anything. The reference
  identifies *which* claim; the authenticated identity is what authorizes
  seeing it — neither alone is enough, which is the ownership fix the final
  review flagged (a claim reference was never credential-grade on its own).
  A caller with no matching, owned claim gets `null`, not an error — the
  frontend's honest "no claim found" state, not a fabricated one. Returns the
  claim plus its `claimDocuments`.
- `generateDocumentUploadUrl` (mutation, args: `reference: v.string()`) —
  same lookup-then-ownership-check as above, asserts
  `status === "potential_winner"` (the only pre-submission status this
  spec's flow ever produces — `claim_started`/`documents_requested`/
  `notification_sent` stay reserved, unwritten by anything here), returns
  `ctx.storage.generateUploadUrl()`.
- `registerUploadedDocument` (mutation, args: `reference: v.string()`,
  `type: v.union(v.literal("photo_id"), v.literal("proof_of_address"), v.literal("winner_photo"))`,
  `storageId: v.id("_storage")`) — called by the client immediately after its
  `PUT` to the generated upload URL succeeds, **before** final submission.
  Same ownership check. Reads the file's actual `contentType`/`size` from the
  `_storage` system table (via `ctx.db.system.get`, not the deprecated
  `ctx.storage.getMetadata`) and rejects — deleting the just-uploaded file
  with `ctx.storage.delete()` — anything outside the allowed types or over
  10 MB: JPEG/PNG/PDF for `photo_id`/`proof_of_address`, JPEG/PNG for
  `winner_photo`. This is the fix for trusting client-supplied storage IDs
  at face value: a storage ID only becomes a claim's document once this
  mutation has verified both ownership and the file itself, immediately at
  upload time, not deferred to final submission. On success, replaces any
  existing row of the same `type` for this claim (a re-upload overwrites,
  never accumulates duplicates) and deletes the old file it replaces.
- `submitClaimDocuments` (mutation, args: `reference: v.string()`,
  `legalName: v.string()`, `publicDisplayName: v.optional(v.string())`,
  `affidavitAccepted: v.boolean()`, `publicityReleaseAccepted: v.boolean()`) —
  same ownership check, throws unless all three document types are already
  registered for this claim (via `registerUploadedDocument`) and both
  checkboxes are true. No storage IDs in this call's args at all — by the
  time it runs, the documents already exist and are already owned. Patches
  the claim (`legalName`, `publicDisplayName: publicDisplayName ?? legalName`,
  `eligibilityAffidavitAcceptedAt: Date.now()`,
  `publicityReleaseAcceptedAt: Date.now()`, `status: "under_review"`), writes
  an audit entry.

**`convex/admin.ts`** (new):

- `listPendingClaims` (query, no args) — `requireAdmin`, returns claims where
  `status === "under_review"` with the associated campaign's prize title and
  the claimant's self-certified `region`/`birthDate` attached for display.
- `getClaimDetail` (query, args: `claimId: v.id("claims")`) — `requireAdmin`,
  returns the claim, its documents, and a signed URL per document
  (`ctx.storage.getUrl(storageId)`) resolved server-side so an unrelated
  caller can never reach a raw storage id.
- `approveClaim` (mutation, args: `claimId: v.id("claims")`) — `requireAdmin`.
  Asserts `claim.status === "under_review"` and the campaign's
  `status === "winner_pending"` before any write — this is what makes a
  double-click or a retried call safe: the second call finds a claim that's
  no longer `under_review` and fails loudly instead of writing a second
  `winnerArchive` row, rather than needing a separate idempotency flag.
  Loads the campaign's `campaignSecrets` row and **recomputes the commitment
  with the existing `commitmentFor(winningShard, winningCount, nonce)`
  helper**, asserting the result equals `campaign.commitmentHash` — if it
  doesn't, the mutation throws and publishes nothing, rather than trusting
  that a value written months earlier is still correct. Only once that
  check passes: patches the claim to `approved`; patches the campaign to
  `status: "completed"`, `completedAt: Date.now()`,
  `revealedTarget`/`revealedNonce` from the now-verified secret; inserts the
  `winnerArchive` row (`legalName`/`publicDisplayName` from the claim, the
  `winner_photo` document's `storageId`, `region` from the claimant's user
  record, `prizeTitle` from the campaign's prize, the same verified
  `commitmentHash`); writes an audit entry.
- `rejectClaim` (mutation, args: `claimId: v.id("claims")`,
  `reason: v.string()`) — `requireAdmin`, asserts
  `claim.status === "under_review"` (same double-click protection as
  approval), patches the claim to `disqualified`, writes an audit entry with
  the reason. Does not touch campaign status.
- `purgeClaimDocuments` (mutation, args: `claimId: v.id("claims")`) —
  `requireAdmin`. Manual retention action, see Retention below: deletes every
  `claimDocuments` row and its underlying storage file for a claim, except a
  `winner_photo` belonging to a claim that has an approved `winnerArchive`
  entry (that copy is intentionally public and permanent; the archive keeps
  its own `photoStorageId` reference independent of `claimDocuments`).

**Document access control:** no query anywhere returns a raw `storageId` to
the client for independent `ctx.storage.getUrl()` resolution. Every URL a
client ever receives comes pre-resolved from `getMyClaim` (own documents
only) or `getClaimDetail` (admin only), both of which check identity before
touching storage. Resolved URLs exist only in transient React state on the
page that requested them — nothing in this design writes one to `localStorage`,
a log line, or any persisted record.

## Frontend

- **`app/claim/[reference]/page.tsx`** becomes a client component. Keeps its
  existing static sections, adds a form gated on `getMyClaim(reference)`:
  signed-out → sign-in prompt; signed-in with no matching, owned claim → an
  honest "no claim found" state (never a fabricated status — this covers both
  a wrong reference and someone else's reference); a claim whose `status` is
  `potential_winner` → the upload form (each file registers itself on pick,
  final submit only enabled once all three are registered and both
  checkboxes are checked); any other status → a plain readout of the current
  status.
- **`app/admin/page.tsx`** (new) and **`app/admin/claims/[claimId]/page.tsx`**
  (new) — gated by attempting `listPendingClaims`/`getClaimDetail` and
  showing a plain "not authorized" message on the thrown `NOT_ADMIN` (visible
  enough that a legitimate admin who isn't recognized yet knows why, not a
  404 that hides the surface's existence). No design-system styling — plain
  tables, plain buttons, functional only, per the explicit polish decision
  for this internal-only surface. The detail page also exposes a "purge
  documents" button calling `purgeClaimDocuments`, for the manual retention
  workflow below.
- **`app/winners/page.tsx`** — swapped from static copy to a query against
  `winnerArchive`, preserving the exact same empty-state copy already there
  when the archive has no rows yet.

## Retention

TillWon holds government IDs and proof-of-address documents — the policy for
how long is stated here even though enforcement starts manual:

- **Rejected claim:** photo ID and proof of address serve no further purpose
  once disqualified. Delete via the admin's "purge documents" action.
- **Approved claim:** photo ID and proof of address have done their job once
  the winner is published; delete the same way. The `winner_photo` is
  retained, because `winnerArchive` already copied its `photoStorageId`
  independently and it's intentionally public.
- **Enforcement is a manual admin action in this spec** (`purgeClaimDocuments`,
  one button, one claim at a time), not a scheduled job. Automating this
  (a Convex cron sweeping claims past some age) is real, separate
  infrastructure — worth building the moment claim volume makes manual
  purging impractical, not before there's a second claim to purge.

## Testing

Same convention as the rest of this backend: Convex functions get
`convex-test`-backed unit tests in `convex/*.test.ts`. In particular:
ownership checks on all three `claims.ts` functions (own claim by reference
succeeds; another user's reference, and a reference matching nothing, both
return `null` rather than an error or leaking whether the reference exists);
admin-gating rejections; `registerUploadedDocument`
rejecting an oversized or wrong-content-type file; the full register →
submit → approve → `winnerArchive` path; `approveClaim` throwing on a
tampered `commitmentHash` rather than publishing; a second `approveClaim` or
`rejectClaim` call against an already-resolved claim failing on the state
check rather than double-writing; and a rejection leaving campaign status
untouched. No automated coverage for the three new frontend surfaces,
consistent with every other frontend change in this codebase — `vitest`'s
`include` is `convex/**/*.test.ts` only.
