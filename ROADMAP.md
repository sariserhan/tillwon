# Roadmap

Working todo list for TillWon. Checked items are done and on `main`.

## Done

- [x] Real sign-in (Clerk) and eligibility capture (state, birthdate) in the rules-acceptance flow
- [x] Claim verification: document upload, admin review queue, approve/reject, publish to `/winners`
- [x] Final-review merge blockers: claim-reference collision lockout, false document-access copy, missing campaign audit trail on approval, winner-privacy test guard
- [x] Follow-up: matching copy fix on the rules page, shared narrow error boundary (claim page + admin, no longer swallows every error into "Not authorized")
- [x] All Minor/opportunistic items below (name trim/bounds, `CLAIM_DATA_INCOMPLETE` guard, `getMyClaim` field trimming, `robots.ts` admin disallow, double-decode fix, purge audit metadata, `claims.test.ts` type fix, friendly admin error messages)
- [x] Storage-ID ownership binding and `claimDeadline` enforcement (see pre-production gate section, now checked off)
- [x] Document access control (authenticated HTTP action), Approve/Purge confirmation dialogs, and content-type magic-byte sniffing (see pre-production gate section, now checked off)
- [x] **Disqualification no longer permanently freezes the campaign.** `rejectClaim` only ever marked the *claim* disqualified — the campaign stayed stuck in `winner_pending` forever, with no way to spin again, contradicting product policy (resolved 2026-08-06: "the campaign resumes... and the next entry to reach it wins") and the rules page's own admission that this was "not yet implemented." Implemented the `resume_campaign` policy (the only one of the schema's three `disqualificationPolicy` options that had clear enough product guidance to build): flips the campaign back to `live`, clears `winningSpinId`/`potentialWinnerUserId`, and — this part isn't obvious — decrements the winning shard's spin-count by exactly 1. That last step is load-bearing: a win requires the shard's running count to land exactly on `winningCount`, that count never resets, and the disqualified spin already consumed the only moment it could ever equal `winningCount` again. Without un-consuming it, the campaign would report itself `live` while the sealed target became permanently unwinnable — a real bug my first pass had, caught by a test that actually exercised a second spin against the resumed campaign rather than just checking the status flip. `select_alternate` and `end_campaign` are unimplemented; campaigns configured with either keep the old frozen behavior until those get their own design pass (see "Next design decision" below).

## Next design decision (not started)

- **`select_alternate` and `end_campaign` disqualification policies.** `resume_campaign` is done; these two have no product-level design yet — "select an alternate winner" needs a mechanism decided (re-seal a new target? advance to the next-highest count on the same shard? something else?), and "end campaign" needs its actual behavior decided (mark cancelled, notify the sponsor, refund/no-refund implications?). Worth a short brainstorm before implementing either.
- **`app/rules/page.tsx`'s "Still required before launch" section** still says the disqualification-resume mechanism is "not yet implemented" — that's now only true for 2 of the 3 policies. Left this copy untouched since it's Official-Rules-adjacent legal content this session wasn't asked to edit, but it's worth a look now that `resume_campaign` actually exists.

## Before real claimants use this (pre-production gate)

Nothing here blocks merging further work, but none of it should ship to real users until done. Full detail and file:line references in `.superpowers/sdd/2026-08-30-claim-verification/final-review.md` (in git history — the branch was merged and deleted, so pull that file from commit history if the worktree is gone).

- [ ] **One real authenticated click-through**: sign in → upload 3 documents → submit → admin approve → view a document → check `/winners`, in an actual browser. Every SDD task in this feature hit Clerk's Turnstile bot-protection wall and verified around it (tests + type-checking + shape review) instead of a live pass. The new `/documents` HTTP action was smoke-tested live and unauthenticated (route reachable, argument validation, CORS/OPTIONS all correct) but its authenticated success path — an admin actually viewing a document through it — needs the same browser pass as the rest of the flow. Unblock with Clerk dev bot-protection off, or `+clerk_test` addresses.
- [x] **Document access control**: added `convex/http.ts`'s `/documents` HTTP action — re-checks `requireAdmin` on every request (via `admin.getDocumentForServing`) and streams the file with `Cache-Control: no-store`, replacing the old unauthenticated, non-expiring `storage.getUrl()` link. The admin claim-detail page now fetches with a Clerk bearer token instead of rendering a bare `<a href>`. A follow-up security review caught that the first version of this endpoint served the file back with the *client-declared* upload Content-Type (stored-XSS risk: a payload that sniffs as a valid PNG could still be uploaded as `Content-Type: text/html`) — fixed by persisting the sniffed (byte-verified) type on the `claimDocuments` row and serving only that, plus `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and a restrictive CSP as defense in depth.
- [x] **Storage-ID ownership binding**: `registerUploadedDocument` now refuses a `storageId` already registered on a *different* claim (`STORAGE_ALREADY_REGISTERED`), via a new `claimDocuments.by_storage` index — closes the overwrite/delete-another-user's-file path without deleting anything on the refusal.
- [x] **Enforce `claimDeadline`**: `submitClaimDocuments` now throws `CLAIM_DEADLINE_PASSED` if the claim's deadline has passed.
- [x] **Confirmation on Approve and Purge**: both now require a `window.confirm()` before firing.
- [x] **Content-type validation is client-asserted**: `registerUploadedDocument` is now a Convex *action* (`convex/lib/fileSniff.ts`'s `sniffFileType`) that reads the file's actual bytes (PNG/JPEG/PDF magic numbers) instead of trusting the browser's declared `Content-Type` header. The ownership/status gate and the actual DB write moved into internal functions (`checkClaimSubmittable`, `finalizeDocumentRegistration`) since actions have no direct `ctx.db` access.

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
