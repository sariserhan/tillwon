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
Below it, a form collects: legal first and last name, a government photo ID
upload, a proof-of-address upload, a photo for the winner archive, and two
checkboxes (eligibility affidavit, publicity release). Submitting requires
all five present and moves the claim to `under_review`. After submission the
page shows a plain status readout instead of the form — no re-submission
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
  type: v.union(
    v.literal("photo_id"),
    v.literal("proof_of_address"),
    v.literal("winner_photo"),
  ),
  storageId: v.id("_storage"),
  uploadedAt: v.number(),
}).index("by_claim", ["claimId"]),

winnerArchive: defineTable({
  campaignId: v.id("campaigns"),
  claimId: v.id("claims"),
  legalName: v.string(),
  photoStorageId: v.id("_storage"),
  region: v.string(),
  prizeTitle: v.string(),
  awardedAt: v.number(),
  revealedTarget: v.string(), // "<winningShard>:<winningCount>"
  revealedNonce: v.string(),
  commitmentHash: v.string(), // the campaign's published hash, copied for an easy side-by-side check
}).index("by_campaign", ["campaignId"]),
```

`claims` gets one new optional field: `legalName: v.optional(v.string())`.
Nothing on `claims`, `campaigns`, `users`, or `campaignSecrets` is removed or
retyped. `campaigns.revealedTarget`/`revealedNonce` (already declared, never
written) get their first writer.

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

- `getMyClaim` (query, no args) — `requireUser`, finds the caller's own claim
  by `userId` (not by any reference in a URL — this is the ownership fix the
  final review flagged: a claim reference alone was never sufficient
  authorization). Returns the claim plus its `claimDocuments`, or `null` if
  the caller has none.
- `generateDocumentUploadUrl` (mutation, no args) — `requireUser`, asserts the
  caller has a claim with `status === "potential_winner"` (the only
  pre-submission status this spec's flow ever produces —
  `claim_started`/`documents_requested`/`notification_sent` stay reserved,
  unwritten by anything here), returns `ctx.storage.generateUploadUrl()`.
- `submitClaimDocuments` (mutation, args: `legalName: v.string()`,
  `photoIdStorageId/proofOfAddressStorageId/winnerPhotoStorageId: v.id("_storage")`,
  `affidavitAccepted: v.boolean()`, `publicityReleaseAccepted: v.boolean()`) —
  `requireUser`, loads the caller's own claim, throws if any required piece
  is missing or a checkbox is false, inserts three `claimDocuments` rows,
  patches the claim (`legalName`, `publicityReleaseAcceptedAt: Date.now()`,
  `status: "under_review"`), writes an audit entry.

**`convex/admin.ts`** (new):

- `listPendingClaims` (query, no args) — `requireAdmin`, returns claims where
  `status === "under_review"` with the associated campaign's prize title and
  the claimant's self-certified `region`/`birthDate` attached for display.
- `getClaimDetail` (query, args: `claimId: v.id("claims")`) — `requireAdmin`,
  returns the claim, its documents, and a signed URL per document
  (`ctx.storage.getUrl(storageId)`) resolved server-side so an unrelated
  caller can never reach a raw storage id.
- `approveClaim` (mutation, args: `claimId: v.id("claims")`) — `requireAdmin`,
  in one transaction: patches the claim to `approved`; patches the campaign
  to `status: "completed"`, `completedAt: Date.now()`,
  `revealedTarget`/`revealedNonce` copied from the campaign's
  `campaignSecrets` row; inserts the `winnerArchive` row (`legalName` and the
  `winner_photo` document's `storageId` from the claim/documents just
  loaded, `region` from the claimant's user record, `prizeTitle` from the
  campaign's prize, `commitmentHash` copied from the campaign); writes an
  audit entry.
- `rejectClaim` (mutation, args: `claimId: v.id("claims")`,
  `reason: v.string()`) — `requireAdmin`, patches the claim to
  `disqualified`, writes an audit entry with the reason. Does not touch
  campaign status.

**Document access control:** no query anywhere returns a raw `storageId` to
the client for independent `ctx.storage.getUrl()` resolution. Every URL a
client ever receives comes pre-resolved from `getMyClaim` (own documents
only) or `getClaimDetail` (admin only), both of which check identity before
touching storage.

## Frontend

- **`app/claim/[reference]/page.tsx`** becomes a client component. Keeps its
  existing static sections, adds a form gated on `getMyClaim`: signed-out →
  sign-in prompt; signed-in with no claim → an honest "no claim found" state
  (never a fabricated status); signed-in with a claim whose `status` is
  `potential_winner` → the upload form; any other status → a plain readout
  of the current status. The URL's `reference` segment is used only to label
  the page, not to authorize anything.
- **`app/admin/page.tsx`** (new) and **`app/admin/claims/[claimId]/page.tsx`**
  (new) — gated by attempting `listPendingClaims`/`getClaimDetail` and
  showing a plain "not authorized" message on the thrown `NOT_ADMIN` (visible
  enough that a legitimate admin who isn't recognized yet knows why, not a
  404 that hides the surface's existence). No design-system styling — plain
  tables, plain buttons, functional only, per the explicit polish decision
  for this internal-only surface.
- **`app/winners/page.tsx`** — swapped from static copy to a query against
  `winnerArchive`, preserving the exact same empty-state copy already there
  when the archive has no rows yet.

## Testing

Same convention as the rest of this backend: Convex functions get
`convex-test`-backed unit tests in `convex/*.test.ts` (ownership checks,
admin-gating rejections, the full submit → approve → winnerArchive path, and
a rejection leaving campaign status untouched). No automated coverage for the
three new frontend surfaces, consistent with every other frontend change in
this codebase — `vitest`'s `include` is `convex/**/*.test.ts` only.
