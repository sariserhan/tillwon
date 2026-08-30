# Roadmap

Working todo list for TillWon. Checked items are done and on `main`.

## Done

- [x] Real sign-in (Clerk) and eligibility capture (state, birthdate) in the rules-acceptance flow
- [x] Claim verification: document upload, admin review queue, approve/reject, publish to `/winners`
- [x] Final-review merge blockers: claim-reference collision lockout, false document-access copy, missing campaign audit trail on approval, winner-privacy test guard
- [x] Follow-up: matching copy fix on the rules page, shared narrow error boundary (claim page + admin, no longer swallows every error into "Not authorized")
- [x] All Minor/opportunistic items below (name trim/bounds, `CLAIM_DATA_INCOMPLETE` guard, `getMyClaim` field trimming, `robots.ts` admin disallow, double-decode fix, purge audit metadata, `claims.test.ts` type fix, friendly admin error messages)
- [x] Storage-ID ownership binding and `claimDeadline` enforcement (see pre-production gate section, now checked off)

## Before real claimants use this (pre-production gate)

Nothing here blocks merging further work, but none of it should ship to real users until done. Full detail and file:line references in `.superpowers/sdd/2026-08-30-claim-verification/final-review.md` (in git history — the branch was merged and deleted, so pull that file from commit history if the worktree is gone).

- [ ] **One real authenticated click-through**: sign in → upload 3 documents → submit → admin approve → check `/winners`, in an actual browser. Every SDD task in this feature hit Clerk's Turnstile bot-protection wall and verified around it (tests + type-checking + shape review) instead of a live pass. Unblock with Clerk dev bot-protection off, or `+clerk_test` addresses.
- [ ] **Document access control**: `convex/admin.ts`'s `getClaimDetail` hands out `storage.getUrl()` links, which are unauthenticated and non-expiring once obtained (confirmed in Convex's own docs). Replace with an authenticated HTTP action that streams the file after checking the caller.
- [x] **Storage-ID ownership binding**: `registerUploadedDocument` now refuses a `storageId` already registered on a *different* claim (`STORAGE_ALREADY_REGISTERED`), via a new `claimDocuments.by_storage` index — closes the overwrite/delete-another-user's-file path without deleting anything on the refusal.
- [x] **Enforce `claimDeadline`**: `submitClaimDocuments` now throws `CLAIM_DEADLINE_PASSED` if the claim's deadline has passed.
- [ ] **Confirmation on Approve and Purge**: both are single-click, irreversible (permanent public publish + sealed-target reveal; permanent deletion of ID evidence). No `unapprove`/`unpurge` path exists anywhere.
- [ ] **Content-type validation is client-asserted**: `registerUploadedDocument` trusts the browser's declared `Content-Type` header, not the actual file bytes. Either sniff magic bytes or stop describing it as verifying the file.

## Minor / opportunistic

- [x] Untrimmed/unbounded `legalName` and `publicDisplayName` — `submitClaimDocuments` now trims both, rejects a blank legal name (`LEGAL_NAME_REQUIRED`), and caps both at 120 chars (`LEGAL_NAME_TOO_LONG` / `PUBLIC_DISPLAY_NAME_TOO_LONG`).
- [x] `approveClaim` silently defaults a missing name/region to `""` — now throws `CLAIM_DATA_INCOMPLETE` instead.
- [x] `getMyClaim` returns raw `storageId`s the client never reads — now returns `{ type }` only.
- [x] `robots.ts` didn't disallow `/admin` — added.
- [x] Double `decodeURIComponent` on the claim page's route param — removed the redundant decode (Next's App Router already decodes `params`).
- [x] `purgeClaimDocuments`'s audit entry didn't record which document types were purged — now writes `metadata: { purgedTypes, retainedStorageFor }`.
- [x] `convex/claims.test.ts`'s `ReturnType<typeof convexTest>` schema-erasure pattern — fixed with the same `TestConvex<typeof schema>` binding used in `admin.test.ts` (commit `b3b04ab`).
- [x] Raw Convex error strings in the admin UI — added `app/lib/convexError.ts`'s `friendlyErrorMessage()`, which extracts just the short error code instead of the full stack-trace-bearing message.

## Notes

- The `fallback` git remote (GitLab) has a completely unrelated, older history — not synced with `origin` (GitHub), and not part of this roadmap unless that mirror needs to be kept current.
