# Design

<!-- impeccable:design-doc 1 -->

**World:** The Public Draw, Broadcast Live · direction seed `6d9531b0`, candidate 5 of 7
**Recorded from:** the built first viewport (`app/page.tsx`), not from intention.

A civic television studio staged for a public draw. The form is chosen for one
reason: a televised draw is the one setting where the public already accepts a
chance outcome as fair, *because the apparatus exists to be watched in the open*.
This product's core obstacle is being presumed a scam, so the world does the
arguing that copy otherwise has to.

Not the casino (navy, gold, neon, confetti, chips). Not the trustworthy-fintech
dodge (white, Inter, soft-shadow cards). Not the literal reading of the name —
"TillWon" is disposable working-name text read from config, so it owns nothing.

---

## Colour

Strategy: **Drenched.** The studio ground owns the surface. Dark is chosen from
the use scene, not the category: a studio is a dark room with a lit subject, seen
on a phone in the evening.

| Token | Value | Role |
|---|---|---|
| `--color-studio-900` | `#062a2d` | Page ground, band backing, floor falloff |
| `--color-studio-800` | `#0a3b3f` | Results board section |
| `--color-studio-700` | `#0d4a4e` | Cyclorama mid |
| `--color-studio-600` | `#135c60` | Cyclorama where the key lands |
| `--color-tungsten` | `#f0a848` | Key light **and** focus ring. A lighting material |
| `--color-alu-200/300/400/600` | `#b8bcc0` `#d3d7da` `#8d949a` `#4e565c` | Apparatus, plinth, disabled |
| `--color-enamel` | `#e8e2d4` | Flap tiles, primary text |
| `--color-enamel-dim` | `#c9c2b2` | Disabled label |
| `--color-ink` | `#14100c` | Type on enamel |
| `--color-tally` | `#d6301f` | **Live state and the primary action only** |
| `--color-caption` | `#a8bfbc` | Secondary text — tinted from the ground's hue, never grey |

**The tally-red rule is binding.** Red means *live* — the on-air lamp and the
spin action. Nothing else may take it. Errors, alerts, and emphasis must find
another means, or the one signal that says "this draw is running" stops meaning
anything.

Measured contrast on the studio ground: caption **7.88:1**, enamel **11.81:1**.

**Cream on tally red is 3.78:1** — below the 4.5:1 floor for normal-size text. Two
places hit this and were resolved differently, both deliberately rather than by
darkening the red, which would have changed the palette and the tally lamp with it:

- The **primary action** lives in one class, **`.btn-primary`** in `globals.css`,
  at 1.25rem / weight 700. That is where the large-text threshold of 3:1 applies
  and 3.78 clears it, so the size and weight are a contrast requirement rather
  than styling. **Never hand-roll another tally-red button** — the same defect was
  introduced three separate times (the spin control, the 404 action, and a draft
  banner) before the rule was centralised. A 1rem bold button on tally red fails.
- **Draft stamps** on document surfaces do not use tally red at all; they are a
  single black overprint.

Anything else that wants cream on tally red must clear 3:1 at large-text size or
pick another surface.

**Measuring contrast correctly here needs care**, and three false positives were
produced before the real defect surfaced. A checker must resolve `.brushed` /
`.brushed-dark` explicitly, because they paint with `background-image` and a
`backgroundColor` walk falls through them to a dark ancestor; and it must measure
only leaf text elements, because a container's inherited colour is not the colour
its child text is painted in.

## Light

`.studio-light` composes four layers: a tight tungsten key from high left with a
fast falloff, its grazing spill across the floor, a soft cyclorama-to-floor join,
and the cyclorama field itself. **Physical directional light, never glow.** A
wide soft bloom reads as a lens flare — a camera artefact, not a lit room — and
an emissive edge collapses this world into the near-black-plus-neon rut.

## Type

| Role | Face | Treatment |
|---|---|---|
| Display | **Archivo**, width axis at `font-stretch: 125%` | `.font-display`, uppercase, `-0.02em` |
| Body / UI | **Public Sans** | Default |

Both self-hosted via `next/font/google`. Public Sans is the civic register — a
public draw, set in the typeface public communication actually uses. Broadcast
titling is *wide* before it is heavy, which is why the width axis carries the
display voice rather than weight alone.

Headline: `clamp(1.75rem, 5.2vw, 2.75rem)`, `leading-[0.98]`. SVG text must
declare `fontStretch="125%"` explicitly — it does not inherit the CSS class.

## Material and component grammar

- **Corner language: 2–4px.** Machined and enamelled objects have small radii.
  Nothing is pill-shaped and nothing is a rounded card.
- **Line weights: 1px only.** The flap seam is `bg-ink/35`; panel edges are
  `ring-1` or `border` at default width. No coloured left-borders, no hairlines.
- **`.brushed` / `.brushed-dark`:** a directional grain over a top-lit gradient —
  lit top edge, shadowed bottom. Aluminium has a direction.
- **Elevation:** offset **and** blur, always
  (`0 2px 6px rgb(0 0 0/0.55)`). No zero-offset halos, no block shadows.
- **`.tally-live`:** a bulb with a hot off-centre core and a short falloff, not a
  page glow.
- **Enamel tiles** carry an inset ring and a top-inner shadow, because a tile
  sits *in* a housing.

Structural refusals held: no same-size icon-heading-text cards, no hero metric,
**no kickers or eyebrows**, no section numbers, no gradient text, no monospace as
costume, no Unicode glyph icons.

## Icons

**Ten** reel symbols — data in `app/lib/symbols.ts`, drawing in
`app/components/Symbols.tsx`: 24×24 grid, solid `currentColor` fills, matched
optical weight, geometric enamel-sign character. Painted signs have no
hairlines, so neither do these. A symbol needing a second plane uses opacity
`0.55`, the family's only secondary value. `SYMBOL_LABELS` supplies
screen-reader names — the set is never announced by shape alone.

Seven symbols come from the brief (7, star, diamond, bell, cherry, gift, sponsor
drop). **Ticket, lamp and microphone were derived from this surface's own world** —
a raffle stub, the on-air filament bulb, the announcer's microphone — rather than
from fruit-machine iconography, which the product may not resemble.

## Prize tiers and reel count

The prize's value decides the tier, and the tier decides how many reels the
apparatus has — a bigger prize is visibly a longer machine. Table in
`app/lib/tiers.ts`; bounds are exclusive-low / inclusive-high, so "up to $100"
includes exactly $100.

| Tier | Prize value | Reels | Default odds |
|---|---|---|---|
| 1 | up to $100 | 3 | 1 in 1,000 |
| 2 | $100–500 | 4 | 1 in 10,000 |
| 3 | $500–1,000 | 5 | 1 in 100,000 |
| 4 | $1,000–5,000 | 6 | 1 in 1,000,000 |
| 5 | $5,000–10,000 | 7 | 1 in 10,000,000 |
| 6 | $10,000+ | 8 | 1 in 100,000,000 |

The odds are the honest reading of the picture: ten symbols per reel, a seven
required on every column, so 10^columns. The visual and the published figure
coincide, which is what makes the apparatus a truthful diagram of the odds rather
than a decoration over unrelated numbers.

**⚠️ Recorded economic hazard.** The ladder spans five orders of magnitude while
prize value spans about two, so expected value per entry *falls* as tiers rise —
tier 6 is roughly 200× worse per entry than tier 1, and at 10,000 entries a day it
needs ~27 years to produce a winner. The headline tiers are the ones that never
pay. `campaign.oddsDenominator` therefore overrides the default, and changing it
touches no engine and no reel code. A sounder rule derives the denominator from a
target campaign length rather than from column count.

**The symbols are decorative and do not set the odds.** The winner is decided by
the sealed entry counter; symbols are rendered after the outcome exists. The
combinatorial figure is published as the odds because it is the value the sealed
target is set to — not because the reels roll it.

Odds appear in three places, all reading from one value: stamped on the housing
as a spec plate, in the band beside the prize, and in the compliance caption with
the disclosure that actual odds depend on total entries received — which is the
truthful qualifier for a sealed-entry draw.

**Layout at eight reels** is the constraint that shapes the deck: gaps tighten
from 6px to 3px above six columns, the housing width is `columns × 3.4rem` capped
at 100%, and the row wraps rather than crushing the outcome column. Verified at
375px: tiles 32×39px, no overflow, primary action above the fold.

Drawing rule, enforced by `npm run check:spin`: reels are drawn uniformly and only
the jackpot triple is withheld. Individual sevens land at their honest frequency
(~27% of spins), and two-seven near misses at theirs (~2.7%). Excluding sevens
outright would make any visible seven a win tell; engineering extra near misses
would be a banned dark pattern. The check asserts both bounds.

## Motion

**One authored moment: the flap turn.** Everything else is a 150ms state change.

The outgoing symbol's top half hinges down over the incoming one
(`flap-fall`, 150ms, `--ease-flap: cubic-bezier(0.32,0,0.24,1)`), on a 420px
perspective. Per-drum settle at 1700 / 2100 / 2500ms so the third lands on its
own beat. Flip intervals start at 85ms and decelerate by ×1.16.

**A casino reel blurs; a flap counts.** The entire distinction between this
product and the thing it must not be mistaken for lives in that motion, not in
copy. Non-winning spins never generate `7-7-7`, so near misses occur only at
their honest frequency and are never engineered.

Reduced motion: no flap. The faces cross-fade over the *same duration budget*,
so the anticipation of a draw survives. This path is designed alongside the
animation, not retrofitted, because the animation *is* the core interaction.

## States and access

- Spin is a real `<button>` with `aria-busy`, keyboard-operable, focus ring in
  tungsten at 3px/3px offset.
- The result reaches the DOM when it is known; the animation only reveals what is
  already there. An `aria-live="polite"` region reads symbols, outcome, and
  remaining count as text.
- A **Skip** control appears while spinning and settles every drum immediately.
  The outcome does not change — it was never the client's to decide.
- Spin counter: ten enamel ticks. Spent ticks are hollow *and* dimmed — never
  colour alone.
- Disabled spin reads "No spins left today", naming the state rather than greying
  out silently.

## Layout

One locked viewport from `sm` up (`sm:h-dvh`); natural flow below, because
forcing `h-dvh` on a phone crushes the prize to nothing. Alignment spine is
`max-w-7xl`. The graphics band is three columns — apparatus, action, outcome —
and the outcome column is what fills the band's right side, since the most
important text on the page belongs there rather than in dead space.

Verified: no horizontal overflow at 375px; the primary action sits fully above
the fold on mobile (bottom 765 of 812).

## Document surfaces (Read mode)

Official Rules, the winner archive, the sign-in placeholder, and eight legal pages
share `app/components/DocumentShell.tsx`: **a printed sheet under studio light.**
Cream paper (`--color-paper` `#ece7db`), ink text, `--color-ink-soft` `#5a5044`
for secondary.

Ink-on-paper rather than the dark ground, for two reasons that agree: a televised
draw publishes its regulations as printed matter, and a long legal document set in
cream-on-teal is materially harder to read. This reader is suspicious by default,
so legibility here is a credibility factor rather than a nicety.

**Measure: `max-w-[53ch]`, which is ~70 actual characters — not `70ch`.** The `ch`
unit is the width of "0" (9.32px at this size) while an average lowercase character
is 7.1px, so `max-w-[66ch]` measured **89 characters per line** and overshot the
readable range. Measured with canvas text metrics, not assumed. Any new prose
column should be checked the same way rather than trusting the unit.

**Draft stamps are a single black overprint, never tally red.** Two independent
reasons: red means the draw is live and nothing else may borrow that signal, and
cream on tally red measured **3.78:1**, under the 4.5:1 floor for text that size.
Every text/background pair on these pages was measured; zero failures.

Craft floor note: the first version used `border-l-2` in tally red for the draft
banner and the "still required" panels. That is the banned coloured-left-border
callout pattern — both are now a solid overprint stripe and a tinted `bg-ink/[0.06]`
panel respectively.

## Route inventory

| Route | Mode | Notes |
|---|---|---|
| `/` | Persuade | Hero, rundown, prize/sponsor detail, results board |
| `/campaign/[slug]` | Persuade | Share/sponsor landing. **No spin control** — one primary action, not two |
| `/rules` | Read | Renders from `tiers.ts` + `jurisdictions.ts`, so it cannot drift from the engine |
| `/winners` | Read | Honest empty archive |
| `/claim/[reference]` | Operate | Shell. Never says "you won"; never claims to have found a record |
| `/sponsor/[slug]` | Read | One real sponsor; unknown slugs 404 rather than generating a page |
| `/legal/[slug]` | Read | Eight documents, all stamped DRAFT |
| `/sign-in` | Read | Placeholder with **no form** — an inert sign-in form is a phishing pattern |
| `not-found` | Read | In-world "off air": dark tally lamp, empty studio |
| `/preview/[state]` | — | **Development only, 404s in production.** Renders the winner-pending panels, which are otherwise unreachable until the backend can award a win |

## The winner-pending states

Two faces of the same campaign status, in `app/components/WinnerPending.tsx`.

**`PotentialWinnerPanel`** — the winner's own view. Deliberately **not
celebratory**: nothing has been won yet, and confetti here would be the product
making a claim it cannot support at the exact instant a person is most inclined to
believe it. The reels above hold their sevens; the panel is a formal printed
notice stamped "RESULT UNDER REVIEW". That contrast — drama over sober paperwork —
is the honest register, and it is also what most distinguishes this from a casino.

**The word "won" never appears as a completed fact.** The headline is "You may have
won", and the body states that nothing has been awarded to anyone. Asserted by a
DOM check, not just by care.

It is tier-aware: below the $600 tax threshold it explicitly says no tax form is
required and that nobody should ask for a Social Security number. Above it, the
W-9 requirement appears. Asking a $100 winner for an SSN would be pure liability.

It also warns that nobody will ever ask for payment, because a prize notification
is exactly the moment an advance-fee fraud impersonates.

**`CampaignPausedNotice`** — everyone else's view. The campaign stays visible on
purpose: a promotion that vanishes mid-flight looks exactly like a scam. It states
what happens if verification fails, because "paused indefinitely" is the reading
people otherwise reach for.

**Why the preview route is gated.** A stranger seeing "You may have won" with a
claim reference would reasonably believe it, and a fabricated prize notice is the
worst thing this product could display. The route is gated on `NODE_ENV`, every
value on it is labelled fake, and the gate is verified against a real production
server rather than assumed. Delete the route once the backend renders these from
real campaign state.

**Accessibility baseline, verified by DOM audit on every surface:** one `h1` per
page, no skipped heading levels, a skip link as the first focusable element whose
target sits *after* the header, `aria-label` on both navs to distinguish them,
single `main`/`header`/`footer` landmarks, no duplicate ids, no unlabelled SVGs,
no horizontal overflow at 375px, and zero contrast failures across every leaf text
element.

## Placeholders to replace

- **`PrizeOnPlinth` card face** — authored SVG standing in for real prize
  photography, which does not exist (PRODUCT.md, Evidence on Hand). The plinth and
  plaque are the world's own furniture and stay.
- **`app/lib/demoSpin.ts`** — delete at checkpoint 5. The outcome must come from
  the Convex mutation.
- **Campaign constant in `app/page.tsx`** — reads from Convex at checkpoint 2.
- **Sponsor is TillWon itself**, per the seed campaign. No sponsor exists; none
  was invented.
