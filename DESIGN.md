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
"SpinDrop" is disposable working-name text read from config, so it owns nothing.

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

**The symbols are decorative and do not set the odds.** The winner is decided by
the sealed entry counter; symbols are rendered after the outcome exists. 10³ =
1000 combinations is **not** a 1-in-1000 chance of winning, and the Official Rules
state the real figure.

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

## Placeholders to replace

- **`PrizeOnPlinth` card face** — authored SVG standing in for real prize
  photography, which does not exist (PRODUCT.md, Evidence on Hand). The plinth and
  plaque are the world's own furniture and stay.
- **`app/lib/demoSpin.ts`** — delete at checkpoint 5. The outcome must come from
  the Convex mutation.
- **Campaign constant in `app/page.tsx`** — reads from Convex at checkpoint 2.
- **Sponsor is SpinDrop itself**, per the seed campaign. No sponsor exists; none
  was invented.
