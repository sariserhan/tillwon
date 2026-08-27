"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SpinDeck } from "./components/SpinDeck";
import {
  CampaignPausedNotice,
  PotentialWinnerPanel,
} from "./components/WinnerPending";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { HowItWorks } from "./components/HowItWorks";
import { PrizeAndSponsor } from "./components/PrizeAndSponsor";
import {
  PrizeOnPlinth,
  SealedCommitment,
  TallyLamp,
} from "./components/StudioFurniture";
import { formatMoney } from "@/convex/lib/tiers.ts";

/**
 * The prize's type without its value, e.g. "gift card" from "$100 gift card" —
 * printed on the card face, where the value is already the large numeral
 * beneath it (see StudioFurniture's PrizeOnPlinth doc comment). The `prizes`
 * table has no field for this (task-8 correction #2); it is derived from the
 * title rather than hardcoded, so a future higher-value prize still gets its
 * own face label instead of a stale "gift card" placeholder. Falls back to the
 * full title when there is no leading amount to strip.
 */
function faceLabelFrom(title: string): string {
  return title.replace(/^\$[\d,]+(\.\d+)?\s+/, "");
}

/**
 * The date a claim must be started by, in the visitor's own locale.
 *
 * There is no `claimDeadlineDays` on the campaign schema yet. `convex/spins.ts`
 * hardcodes the same 14 days when it opens the claim and `app/rules/page.tsx`
 * mirrors the literal for the published rules; this is the third mirror of one
 * source of truth, and all three move together when the schema carries it.
 *
 * Called from the win handler, never during render, so the date is fixed at the
 * moment of the result rather than recomputed.
 */
function claimDeadlineLabel(): string {
  return new Date(Date.now() + 14 * 24 * 3_600_000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * The campaign surface, first viewport.
 *
 * Composition B — Broadcast Feed. The prize is the picture, as the programme's
 * subject; the apparatus and the action compress into a dense graphics band
 * across the lower third, the way a live broadcast overlays its own feed. The
 * band is what a phone sees first, and it puts the spin control at thumb height.
 *
 * Campaign data comes from Convex (api.campaigns.getActiveCampaign) — the
 * single live-or-winner-pending campaign. The Official Rules page reads the
 * same query so the two cannot drift.
 */
export default function Home() {
  const active = useQuery(api.campaigns.getActiveCampaign, {});
  // Set only by the deck, from the server's own mutation result, and only when
  // that result says isPotentialWinner. The client never decides this.
  //
  // `revealed` is false between the mutation resolving and the reels settling on
  // it. During that window this page must keep rendering the deck — the winning
  // spin has already flipped the campaign to `winner_pending`, and taking the
  // paused branch would unmount the deck mid-reveal and cancel the timer that
  // reports the settled win.
  //
  // What makes that reliable is that this `useState` and the `useQuery` above
  // sit on the SAME fiber at the same lane, so they cannot be committed in
  // separate renders — never an ordering guarantee (the query's update is
  // actually applied first). Moving the `useQuery` into a child component would
  // split the lane and reopen the race. See SpinDeck's `onWin` doc comment.
  //
  // The deadline is frozen with the reference rather than recomputed per render,
  // so the date cannot drift under a re-render.
  const [win, setWin] = useState<{
    reference: string;
    deadline: string;
    revealed: boolean;
  } | null>(null);

  if (active === undefined) return <main className="min-h-dvh bg-studio-900" />;
  if (active === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-studio-900 px-6">
        <p className="max-w-[40ch] text-center text-lg text-caption">
          No draw is live right now. The next sponsored prize will appear here.
        </p>
      </main>
    );
  }

  const { campaign, sponsor, prize, rules, oddsDenominator } = active;
  const valueLabel = formatMoney(prize.estimatedRetailValue, prize.currency);
  const faceLabel = faceLabelFrom(prize.title);

  // This visitor spun the winning entry, and the reels have finished revealing
  // it. Checked before the paused branch below — the same spin already flipped
  // the campaign to winner_pending, so without this the person who may have won
  // would be shown the notice written for everyone else.
  if (win?.revealed) {
    return (
      <main>
        <SiteHeader />
        <div id="content">
          <PotentialWinnerPanel
            claimReference={win.reference}
            claimDeadline={win.deadline}
            prizeTitle={prize.title}
            prizeValueCents={prize.estimatedRetailValue}
          />
        </div>
        <SiteFooter />
      </main>
    );
  }

  // A paused campaign stays visible — a promotion that vanishes mid-flight looks
  // exactly like a scam — but it must not show an armed deck. The balance and
  // eligibility queries both return nothing outside `live`, and the deck falls
  // back to the campaign's configured allocation, so leaving it mounted here
  // advertises "10 of 10 free spins left today" on a campaign accepting none.
  //
  // `win === null` is the exception, and only for the one client whose own spin
  // caused the pause: its reels are still turning on a result it has not shown
  // yet. Everyone else — a visitor who never spun, or one whose own spin lost —
  // has no `win` and reaches the notice on the very next render after the
  // campaign flips.
  if (campaign.status === "winner_pending" && win === null) {
    return (
      <main>
        <SiteHeader />
        <div id="content">
          <CampaignPausedNotice />
        </div>
        <HowItWorks oddsDenominator={oddsDenominator} />
        <PrizeAndSponsor />
        <SiteFooter />
      </main>
    );
  }

  return (
    <main>
      {/* One locked viewport from sm up. On a phone the stack flows naturally —
          forcing h-dvh there crushes the prize to nothing, and the prize is the
          thing that has to be wanted. */}
      <div className="flex flex-col lg:h-dvh">
        <SiteHeader />

        {/* The feed: the prize, lit, as the subject of the programme */}
        <section id="content" className="studio-light relative flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-studio-900/60 to-transparent" />

          {/* Broadcast graphics overlay the picture rather than sitting above it.
              As a flow row these two cost 171px of the fold and starved the prize
              to 16% of the feed; as an overlay they cost nothing. Static on mobile,
              where there is no room to overlap. */}
          <div className="relative z-10 flex flex-col items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-5 lg:absolute lg:inset-x-0 lg:top-0 lg:flex-row lg:justify-between">
            <TallyLamp live={campaign.status === "live"} />
            <SealedCommitment />
          </div>

          {/* The prize is the picture, so it takes the room the overlay freed. */}
          <div className="flex flex-1 items-end justify-center px-4 pb-2 pt-3 lg:min-h-0 lg:pb-4 lg:pt-16">
            <PrizeOnPlinth
              valueLabel={valueLabel}
              faceLabel={faceLabel}
              plaque={`Estimated retail value ${valueLabel}`}
            />
          </div>

          {/* Lower-third graphics band. Dense by design: headline, apparatus,
              action, spin count and sponsor bumper all read as one overlay. */}
          <div className="relative border-t border-enamel/15 bg-studio-900/85 backdrop-blur-[3px]">
            <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:gap-9">
              <div className="min-w-0 lg:max-w-[21.5rem] lg:shrink-0">
                <h1 className="font-display text-[clamp(1.75rem,5.2vw,2.75rem)] uppercase leading-[0.98] text-enamel">
                  {campaign.dailySpins} free spins
                  <br />
                  every day
                </h1>
                {/* One tight line. The odds are already stamped on the apparatus
                    and stated in the compliance caption below; a third copy here
                    was redundancy that cost the prize its height. */}
                <p className="mt-2.5 max-w-[34ch] text-sm leading-relaxed text-caption sm:text-base">
                  Free to enter. The {prize.title} stays live until
                  someone wins it.
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <SpinDeck
                  columns={campaign.reelColumns}
                  oddsDenominator={oddsDenominator}
                  dailySpins={campaign.dailySpins}
                  onWin={(reference, revealed) =>
                    setWin((prev) =>
                      prev?.reference === reference
                        ? { ...prev, revealed }
                        : { reference, deadline: claimDeadlineLabel(), revealed },
                    )
                  }
                />
              </div>
            </div>

            {/* Sponsor bumper — the form's own native sponsor slot */}
            <div className="border-t border-enamel/10 px-4 py-2.5 sm:px-6">
              <div className="mx-auto flex max-w-7xl items-center gap-2.5">
                <span className="text-[0.7rem] uppercase tracking-[0.14em] text-caption">
                  Prize provided by
                </span>
                <span className="brushed rounded-[2px] px-2.5 py-1 font-display text-xs uppercase tracking-wide text-ink">
                  {sponsor.name}
                </span>
              </div>
            </div>
          </div>

          {/* Compliance caption, where a broadcast promotion carries it */}
          <div className="bg-studio-900 px-4 py-2 sm:px-6">
            {/* Required near the game, and legible enough to actually be read —
                a compliance line set at 11px is present without being visible.
                Both sentences come from the campaign's own rules row, so the
                published rules and this caption cannot drift. The seeded
                statement already ends "…See Official Rules.", so the JSX adds a
                link rather than repeating the phrase after it. */}
            <p className="mx-auto max-w-7xl text-[0.8rem] leading-relaxed text-caption">
              {rules.noPurchaseStatement} {rules.oddsStatement}{" "}
              <Link
                href="/rules"
                className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
              >
                Read the Official Rules
              </Link>
              .
            </p>
          </div>
        </section>
      </div>

      <HowItWorks oddsDenominator={oddsDenominator} />

      <PrizeAndSponsor />

      {/* The results board. Honestly empty: no draw has been held
          (PRODUCT.md, Evidence on Hand). */}
      <section className="bg-studio-900 px-4 py-7 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-caption">
            Past draws
          </h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-[3px] border border-dashed border-enamel/25 px-4 py-5">
            <p className="text-sm text-caption">
              No draw has been held yet. This board fills in as prizes are won.
            </p>
            <Link
              href="/winners"
              className="shrink-0 text-sm text-enamel underline decoration-enamel/40 hover:decoration-enamel"
            >
              Winner archive
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
