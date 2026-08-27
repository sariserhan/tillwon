import Link from "next/link";
import { formatOdds } from "@/convex/lib/tiers.ts";
import { MINIMUM_AGE } from "@/convex/lib/jurisdictions.ts";
import { BRAND } from "@/app/lib/brand.ts";

/**
 * The rundown — a broadcast running order, which is the form's own device for a
 * numbered sequence of segments.
 *
 * Numbering is earned here rather than decorative: this is a process whose order
 * is the information. The craft floor bans section numbers only where the
 * sequence carries nothing.
 *
 * Content is chosen to answer the objections a first-time visitor actually has,
 * in the order they occur to them — is it really free, is it rigged, what are my
 * real chances, what happens if I win — rather than to restate the offer.
 */
const STEPS = (odds: number) => [
  {
    title: "Sign in, and verify your email",
    body: `Free, and there is nothing to pay for. ${BRAND.name} never asks for a card, a bank detail or a payment method, because no payment exists anywhere in the product.`,
  },
  {
    title: "Collect ten free spins every day",
    body: "Spins reset at 00:00 UTC — the site shows you that in your own local time. Unused spins expire rather than stacking up, and no spin can be bought, sold, transferred or won from another player.",
  },
  {
    title: "Spin",
    body: "The outcome is decided by the server before the reels start moving. Reloading the page, closing the browser or skipping the animation cannot change it. The reels show you the result; they do not produce it.",
  },
  {
    title: "The winning entry was sealed before you arrived",
    body: `One entry number is drawn at random and sealed before a campaign accepts its first spin, and a cryptographic commitment to it is published at the same moment. When the draw ends, the number is revealed — so anyone can check it matches what was published beforehand. Nobody can pick a winner, including us.`,
  },
  {
    title: "If you might have won",
    body: `A winning result makes you a potential winner, not a winner. The campaign pauses, and you get a claim reference and a deadline. Confirming a claim means verifying your identity, age and address — and because accepting a prize requires a publicity release, your name and photograph are published in the winner archive.`,
  },
  {
    title: "Then it starts again",
    body: `Once a prize is awarded, a new campaign takes its place. Your odds this campaign are ${formatOdds(odds)} per entry, stated up front, with the real figure in the Official Rules rather than buried.`,
  },
];

export function HowItWorks({ oddsDenominator }: { oddsDenominator: number }) {
  const steps = STEPS(oddsDenominator);

  return (
    <section className="bg-studio-900 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <h2 className="font-display text-[clamp(1.4rem,3.4vw,2rem)] uppercase leading-[1.04] text-enamel">
          How the draw works
        </h2>
        <p className="mt-2.5 max-w-[52ch] text-sm leading-relaxed text-caption sm:text-base">
          Free prize draws attract scams, so the reasonable first assumption about
          this one is that something is hidden. Here is the whole mechanism.
        </p>

        <ol className="mt-8 grid gap-px overflow-hidden rounded-[3px] bg-enamel/15 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col gap-2.5 bg-studio-900 p-5 sm:p-6"
            >
              <span
                className="brushed w-fit rounded-[2px] px-2 py-0.5 font-display text-[0.7rem] tracking-[0.1em] text-ink"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-base uppercase leading-snug text-enamel">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-caption">{step.body}</p>
            </li>
          ))}
        </ol>

        {/* The question nobody asks out loud, answered plainly. Leaving it
            unanswered is what makes a free giveaway read as a trick. */}
        <div className="mt-10 border-t border-enamel/15 pt-8">
          <h3 className="font-display text-base uppercase text-enamel">
            So why is it free?
          </h3>
          <div className="mt-3 grid gap-6 sm:grid-cols-2 lg:gap-10">
            <p className="max-w-[56ch] text-sm leading-relaxed text-caption">
              A sponsor pays for the prize because the draw puts their brand in
              front of people who come back daily. You are not the product being
              sold — their advertising is. That is the entire business model, and it
              is why there is no version of this where paying helps you.
            </p>
            <p className="max-w-[56ch] text-sm leading-relaxed text-caption">
              A sponsor cannot choose the winner, change the odds, alter the rules
              after a campaign opens, or reach your personal data. Those are
              properties of how the system is built, not promises.{" "}
              <Link
                href="/legal/sponsor-disclosure"
                className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
              >
                Sponsor disclosure
              </Link>
              .
            </p>
          </div>
        </div>

        <p className="mt-8 text-sm text-caption">
          You must be {MINIMUM_AGE} or older and live in an eligible US state.{" "}
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
  );
}
