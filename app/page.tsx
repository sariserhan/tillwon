import { SpinDeck } from "./components/SpinDeck";
import {
  PrizeOnPlinth,
  SealedCommitment,
  TallyLamp,
} from "./components/StudioFurniture";

/**
 * The campaign surface, first viewport.
 *
 * Composition B — Broadcast Feed. The prize is the picture, as the programme's
 * subject; the apparatus and the action compress into a dense graphics band
 * across the lower third, the way a live broadcast overlays its own feed. The
 * band is what a phone sees first, and it puts the spin control at thumb height.
 *
 * Campaign data is hardcoded here until checkpoint 2 reads it from Convex.
 */
const CAMPAIGN = {
  name: "SpinDrop",
  prizeTitle: "$100 gift card",
  sponsorName: "SpinDrop",
  status: "live" as const,
  noPurchaseStatement:
    "No purchase necessary. A purchase will not increase your chances of winning. Eligibility restrictions apply. See ",
};

export default function Home() {
  return (
    <main>
      {/* The first screen is exactly one viewport: header, prize, graphics band,
          compliance caption. The results board sits below it. */}
      {/* One locked viewport from sm up. On a phone the stack flows naturally —
          forcing h-dvh there crushes the prize to nothing, and the prize is the
          thing that has to be wanted. */}
      <div className="flex flex-col sm:h-dvh">
      {/* 1 — Header rail */}
      <header className="brushed-dark relative z-20 flex items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <span className="font-display text-lg uppercase tracking-[0.02em] text-enamel sm:text-xl">
          {CAMPAIGN.name}
        </span>
        <nav className="flex items-center gap-4 text-sm sm:gap-6">
          {/* Compact on mobile: these two wrap the header to two lines at 375px.
              Both stay reachable below — Official Rules from the compliance
              caption, Winners from the results board. */}
          <a href="/rules" className="hidden text-caption hover:text-enamel sm:inline">
            Official Rules
          </a>
          <a href="/winners" className="hidden text-caption hover:text-enamel sm:inline">
            Winners
          </a>
          <a
            href="/sign-in"
            className="rounded-[3px] border border-enamel/40 px-3 py-1.5 text-enamel hover:border-enamel"
          >
            Sign in
          </a>
        </nav>
      </header>

      {/* 2 — The feed: the prize, lit, as the subject of the programme */}
      <section className="studio-light relative flex min-h-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-studio-900/60 to-transparent" />

        <div className="relative flex shrink-0 flex-col items-start gap-3 px-4 pt-4 sm:flex-row sm:justify-between sm:px-6 sm:pt-5">
          <TallyLamp live={CAMPAIGN.status === "live"} />
          <SealedCommitment />
        </div>

        {/* The prize takes the room that is left, and gives it back rather than
            pushing the graphics band out of the first viewport. */}
        <div className="flex max-h-[15rem] min-h-[12rem] flex-1 items-end justify-center px-4 pb-2 pt-3 sm:max-h-none sm:min-h-0 sm:pb-3 sm:pt-2">
          <PrizeOnPlinth />
        </div>

        {/* 3 — Lower-third graphics band. Dense by design: headline, apparatus,
            action, spin count and sponsor bumper all read as one overlay. */}
        <div className="relative border-t border-enamel/15 bg-studio-900/85 backdrop-blur-[3px]">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:gap-9">
            <div className="min-w-0 lg:max-w-[21.5rem] lg:shrink-0">
              <h1 className="font-display text-[clamp(1.75rem,5.2vw,2.75rem)] uppercase leading-[0.98] text-enamel">
                10 free spins
                <br />
                every day
              </h1>
              <p className="mt-2.5 max-w-[38ch] text-sm leading-relaxed text-caption sm:text-base">
                Spin for a chance to win the {CAMPAIGN.prizeTitle}. Free to
                enter, and the prize stays live until someone wins it.
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <SpinDeck />
            </div>
          </div>

          {/* Sponsor bumper — the form's own native sponsor slot */}
          <div className="border-t border-enamel/10 px-4 py-2.5 sm:px-6">
            <div className="mx-auto flex max-w-7xl items-center gap-2.5">
              <span className="text-[0.7rem] uppercase tracking-[0.14em] text-caption">
                Prize provided by
              </span>
              <span className="brushed rounded-[2px] px-2.5 py-1 font-display text-xs uppercase tracking-wide text-ink">
                {CAMPAIGN.sponsorName}
              </span>
            </div>
          </div>
        </div>

        {/* 4 — Compliance caption, where a broadcast promotion carries it */}
        <div className="bg-studio-900 px-4 py-2 sm:px-6">
          {/* Required near the game, and legible enough to actually be read —
              a compliance line set at 11px is present without being visible. */}
          <p className="mx-auto max-w-7xl text-[0.8rem] leading-relaxed text-caption">
            {CAMPAIGN.noPurchaseStatement}
            <a
              href="/rules"
              className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
            >
              Official Rules
            </a>
            .
          </p>
        </div>
      </section>
      </div>

      {/* 5 — The results board. Honestly empty: no draw has been held
          (PRODUCT.md, Evidence on Hand). */}
      <section className="bg-studio-800 px-4 py-7 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-display text-sm uppercase tracking-[0.16em] text-caption">
            Past draws
          </h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-[3px] border border-dashed border-enamel/25 px-4 py-5">
            <p className="text-sm text-caption">
              No draw has been held yet. This board fills in as prizes are won.
            </p>
            <a
              href="/winners"
              className="shrink-0 text-sm text-enamel underline decoration-enamel/40 hover:decoration-enamel"
            >
              Winner archive
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
