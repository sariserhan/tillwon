# Product

<!-- impeccable:product-schema 1 -->

> **Inference notice.** The structured interview round was dismissed, and the user then asked to proceed.
> Facts drawn from the written brief are unmarked. Facts I chose because the brief left them open are
> tagged **[inferred]** — each is a single-line correction, not a rewrite. Facts that are genuinely
> undecided are listed as open decisions and must not be invented by later work.

## Platform

web

## Stack

**[inferred]** from the brief's stated preference (§22), not user-confirmed:

- Next.js (App Router), TypeScript, React, Tailwind CSS, shadcn/ui
- Framer Motion for the reel animation, since the outcome must be declarative and interruptible
- Convex for backend, database, and file storage
- Convex-supported authentication
- Vercel hosting

Convex is the load-bearing choice. Convex mutations are serializable transactions, which means the
entire concurrency apparatus the brief specifies in §7.2 — user-level spin locks, campaign winner
locks, server-generated request IDs, a Redis layer — collapses into one mutation that reads the
balance, decrements it, writes the spin, and conditionally flips campaign status. Idempotency keys
still earn their place for network retries. The locking layer does not need to exist. Choosing
Postgres instead means building and testing that layer by hand, and it is the part of this product
where a bug is unrecoverable: a double-spent spin is an annoyance, a duplicate jackpot is a lawsuit.

## Users

Three audiences with genuinely different jobs. Only the first is on the main surface.

**Entrants (primary).** Adults in eligible jurisdictions who enter giveaways. Not gamblers and not
gamers — closer to someone who fills in a competition slip. The situation is 30 to 60 seconds of
idle attention, phone in hand, usually returning to a habit rather than discovering the product. The
job: spend today's free spins, find out whether today was the day, leave. They are not looking for a
session. Anything that lengthens the visit against their intent is working against the product.

**Sponsors (the paying customer).** Brand marketers buying attention and repeat exposure. The job:
measurable impressions from a defined audience, delivered inside a promotion that cannot become a
legal or brand-safety problem. They are not on the consumer surface, but the consumer surface is the
entire product they are buying, so it must photograph well in a pitch deck.

**Administrators.** Platform staff running one campaign at a time and adjudicating claims. The job:
launch a campaign, verify a potential winner, fulfill a prize, and be able to defend every decision
afterward with a record.

## Product Purpose

A free daily sweepstakes platform. One sponsored prize is live at a time. Every eligible adult
receives 10 free spins a day at a real chance to win it. Users never pay, never buy spins, and never
provide anything of monetary value in exchange for a chance to win. A sponsor funds or provides the
prize and receives the advertising exposure around the game.

Success is narrow and testable: **users return daily without paying, and a sponsor can measure the
exposure they bought.** Everything else in the brief is in service of those two sentences.

## Positioning

The combination is the claim, and no single element of it is defensible alone:

**Free entry, a real prize, and an outcome that is server-authoritative and independently auditable.**

Neighboring products each break one leg. Gambling apps have real prizes and real tension but take
money. Traditional sweepstakes are free but have no daily loop — one entry, then months of silence.
"Free" games with hidden consideration take value in a form the user does not notice. Instant-win
promotions are usually a single brand's own campaign, not a platform a sponsor can rent.

The mechanism a competitor cannot truthfully copy without building the same thing: slot-machine
tension on a daily cadence, with zero consideration, and a published winner mechanism whose result
can be reconstructed after the fact.

## Operating Context

**The daily ritual.** Arrive, spend 10 spins in under a minute, leave. Spins reset at a configurable
hour in a configurable timezone, default 00:00 UTC, displayed to the visitor in their own local
time. Unused spins expire at reset and never accumulate.

**Legal artifacts are part of the interface, not a footer.** The Official Rules are versioned
content the product renders. The "No purchase necessary" statement sits near the game itself, not
buried. Eligibility restrictions, prize tax disclosure, and sponsor disclosure are surfaces with
real content, and every one of them is read by a user in a suspicious frame of mind — the entire
category is presumed to be a scam until proven otherwise. Their craft level is a conversion factor,
not a compliance checkbox.

**The claim happens elsewhere, and slowly.** A jackpot result starts a process measured in days or
weeks: notification, document upload, eligibility review, fulfillment. It lives in a secure claim
portal, off the main surface, and its audience is exactly one anxious person who thinks they may
have won a car.

**Campaign configuration freezes at launch.** After activation the configuration is near-immutable;
changes create audit records. Admins need an emergency pause that works instantly.

**The reel is the product.** On the overwhelming majority of visits, the entire user experience is a
three-second animation resolving to a loss. There is no second act to fall back on.

## Capabilities and Constraints

### Confirmed

- 10 free spins per eligible user per day. Count, reset hour, and reset timezone are all
  configurable. Unused spins expire at reset.
- Spins cannot be purchased, sold, transferred, or granted by any payment. No wallets, no credits,
  no deposits, no cash-out, no subscription that affects odds. No mechanism may make paying feel
  advantageous, including cosmetically.
- The outcome is determined by the backend before the animation resolves, and is immutable
  afterward: unchanged by page reload, client disconnect, browser close, animation failure, or a
  retried API request. The client never decides a result.
- Three reels. Jackpot is `7-7-7`. Symbol set: 7, star, diamond, bell, cherry, gift, sponsor mark.
- Animation runs roughly 2.5 to 4 seconds and must be skippable without altering the result.
- One active campaign at a time in v1.
- Two winner engines are specified: fixed probability, and predetermined winning entry.
- A jackpot result marks the campaign **winner-pending** and does not announce a winner. The user is
  told they *may* have won, and receives a claim reference, a deadline, verification instructions,
  support contact, and the Official Rules.
- Further jackpot wins are locked out once a potential winner exists.
- Admins cannot select a winner, alter a completed spin, delete spin history, or change odds without
  creating an audit record.
- Sponsors cannot select a winner, change odds, reach user identity data, contact users without
  consent, or alter the Official Rules after launch.
- An emergency campaign pause control is required.
- **Winners are not anonymous** (decided 2026-08-06). A potential winner must provide government
  photo ID, legal first and last name, date of birth, a photograph, a signed publicity release, an
  eligibility affidavit, address verification, and — only once prize value reaches the $600 tax
  reporting threshold — an SSN or ITIN on a W-9. Name and photograph are published to the winner
  archive. Date of birth, ID, address, and tax data are never published. The publicity release must
  appear in the Official Rules before the first spin of a campaign, since it cannot be introduced
  after a winner exists.
- **No SSN or ITIN is ever stored in a database field.** It lives only inside the W-9 document in
  restricted storage. The platform records that a W-9 was received and reviewed, never the number.
- Vocabulary is binding: **spins** (never bets, credits, wagers, or plays), **prize** (never payout
  or balance), **campaign**, **claim**, **Official Rules**, **potential winner**.

### Recommended engine choice — [inferred]

**Predetermined winning entry, and drop fixed probability from v1 entirely.**

Fixed probability makes campaign duration a random variable. At 1-in-5,000,000 per spin with 1,000
daily users spending 10 spins, the expected time to a winner is roughly 500 days; at 10,000 users,
roughly 50. No sponsor buys an advertising flight with an unknown end date, so the mode that seems
simpler actively damages the business model. Predetermined entry fixes it: draw the target entry
number from *projected* spin volume across the intended flight, and the winner lands inside the
flight by construction. It is also the easier of the two to audit, because the win occurs at a
specific identifiable entry rather than as a statistical claim.

Building both means two engines to implement, test, and audit, for a variant that makes the product
worse. One engine, chosen deliberately.

### Open decisions — must be resolved, must not be invented

- ~~**Eligible jurisdictions.**~~ **Recommended 2026-08-06, pending counsel:** the 50 US states and
  DC, aged 18+, **excluding Tennessee, Alabama, Nebraska, Mississippi**, all US territories, and
  overseas military installations — 46 states plus DC. Encoded with per-exclusion reasoning in
  `app/lib/jurisdictions.ts`.
  - **Tennessee is excluded because of the publicity decision, not for its own sake.** Its consumer
    protection act makes conditioning a prize on consent to promotional use a deceptive practice, and
    it is the only state that does. Making publicity optional reopens it.
  - Alabama and Nebraska require 19, Mississippi 21. They are excluded only because `minimumAge` is
    one number per campaign; a per-region age floor would reopen all three.
  - Rhode Island stays eligible: its registration duty applies to retail-linked promotions, and this
    product is online-only. A sponsor tying a campaign to physical stores brings it back at $500.
  - New York and Florida require registration **and a surety bond for the full prize value** when
    prizes exceed $5,000 — NY at 30 days' notice, FL at 7. That threshold is exactly tier 4's
    ceiling, so tiers 1–4 are registration-free and tiers 5–6 are not.
- ~~**Whether every campaign carries a hard maximum end date.**~~ **Resolved 2026-08-06: no end
  date, below the registration threshold.** Campaigns run until a valid winner is confirmed. Now
  confirmed against the actual rule: New York and Florida registration and bonding apply only above
  $5,000 in prize value, so open-ended is genuinely fine for tiers 1–4. **Tiers 5–6 need a hard end
  date** — those filings assume a stated period, and an open-ended run keeps a surety bond for the
  full prize value outstanding indefinitely.
- **Whether the reels ever produce anything smaller than the jackpot.** The brief specifies binary
  win-or-nothing, and that stands as the confirmed requirement. Concern on record: at the stated
  odds, a user can play every day for a year and experience nothing but ten losses a day, which is
  the single largest retention risk in the product. Additional free prizes would not create legal
  consideration, so the option stays open on its merits rather than on compliance grounds.
- **Actual odds.** Cannot be chosen in the abstract. They must be derived from projected spin volume
  and intended campaign length, which means the number depends on a traffic estimate that does not
  exist yet.
- ~~**Disqualification resolution.**~~ **Resolved by implication 2026-08-06: the campaign resumes.**
  A disqualified claimant returns the campaign to live with the winning target untouched, and the next
  entry to reach it wins. This is the only policy consistent with an open-ended "until someone wins"
  promise. Needs explicit confirmation before launch, because the wording enters the Official Rules
  verbatim.

## Brand Commitments

**Name.** SpinDrop, explicitly a working name. Every surface reads it from configuration, so
replacing it never touches layout or copy.

**Voice.** Entertaining and exciting, but unmistakably a free promotional giveaway rather than a
gambling service. Honest about odds, and honest about what a jackpot result does and does not mean.

**Banned, and binding — this is the line between a promotional giveaway and a gambling product, not
a matter of taste:**

- Language: bet, wager, deposit, cash out, wallet, balance, credits, buy more spins
- Near-miss framing: "you almost won", "you were one symbol away"
- Manufactured urgency or obligation: "your next spin is due", "don't lose your streak"
- Imagery: casino chips, felt tables, anything that reads as a real casino
- Any dark pattern associated with gambling products

**Required visible near the game**, wording configurable per campaign:

> No purchase necessary. A purchase will not increase your chances of winning. Eligibility
> restrictions apply. See Official Rules.

**Loss copy is prescribed by the brief** and shows the intended register: *"Not this time. You still
have 7 spins left today."* State the fact, give the count, stop.

## Evidence on Hand

**None.** This section exists so later work does not invent any of it.

- **No sponsor.** Tesla appears in the brief purely to illustrate the model. There is no signed
  partner, no sponsor logo, no product photography, no brand assets, no approved marketing copy.
- **No winners.** The winner archive is empty and must present as an honest empty state, not as
  placeholder people.
- **No metrics.** No users, retention figures, impression counts, click-through rates, or campaign
  history. No testimonials, press, or case studies.
- **No legal work.** No counsel review, no Official Rules text, no state registrations.
- **No identity assets.** No logo, wordmark, typography licence, or prize photography.

Any surface that would normally display a sponsor, a winner, or a statistic must be built to be
honestly empty or visibly labeled as a placeholder. Fabricated sponsors and invented winners are
categorically off-limits in a product whose entire credibility problem is being mistaken for a scam.

## Product Principles

1. **Free is the product, not a disclaimer.** If a change makes paying feel advantageous — even
   cosmetically, even in a way that grants nothing — it is wrong.
2. **The server decides; the client performs.** The animation is theatre over a result that already
   exists. It must be skippable, and it must never author an outcome.
3. **Honest at the moment of highest emotion.** A jackpot says "you may have won." A loss states the
   remaining count and nothing more. The temptation to embellish is strongest exactly where the
   legal and ethical exposure is highest.
4. **No dark patterns, structurally.** The loop is slot-shaped, so the category's usual retention
   levers are unavailable by construction. Retention must come from real prizes and real craft.
5. **Every decision reconstructable.** Odds, rules, winners, and admin actions are versioned and
   auditable. If it cannot be reconstructed a year later, it cannot ship.

## Accessibility & Inclusion

WCAG 2.1 AA where practical. Product-specific requirements, all from the brief:

- Reduced-motion mode, and animation skippable without changing the result
- Reel outcome announced to screen readers
- No information conveyed by color or animation alone
- Keyboard-operable spin with visible focus states
- Sound disableable by the user
- Captions on any sponsor video
- Alternative text on prize imagery

The structural constraint worth naming: the core interaction *is* a three-second animation, so the
reduced-motion and screen-reader paths are not a degraded fallback — they are a parallel first-class
experience that has to deliver the same anticipation and the same clarity. Designing the animation
first and retrofitting an accessible version produces a worse product for everyone.
