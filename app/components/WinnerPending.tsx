import Link from "next/link";
import { formatMoney } from "@/app/lib/tiers.ts";
import { CURRENT_CAMPAIGN } from "@/app/lib/currentCampaign.ts";

/**
 * The two faces of a winner-pending campaign.
 *
 * Deliberately not celebratory. Nothing has been won yet — a jackpot result makes
 * someone a *potential* winner, and confetti at this moment would be the product
 * making a claim it cannot support, at the exact instant a person is most inclined
 * to believe it. The reels above hold their sevens; the panel is a formal printed
 * notice. That contrast, drama over sober paperwork, is the honest register.
 *
 * The word "won" never appears as a completed fact in either panel.
 */

const REQUIREMENTS = [
  "Government-issued photo identification",
  "Your legal first and last name, and your date of birth",
  "Proof of address in an eligible jurisdiction",
  "A signed eligibility affidavit",
  "A photograph for publication, and a signed publicity release",
];

export function PotentialWinnerPanel({
  claimReference,
  claimDeadline,
}: {
  claimReference: string;
  /** Already formatted for display; the caller owns the timezone. */
  claimDeadline: string;
}) {
  const value = formatMoney(CURRENT_CAMPAIGN.prizeValueCents);
  const taxThresholdReached = CURRENT_CAMPAIGN.prizeValueCents >= 60_000;

  return (
    <section className="bg-studio-900 px-4 py-10 sm:px-6 sm:py-14">
      <article className="mx-auto max-w-[46rem] rounded-[3px] bg-paper px-5 py-8 shadow-[0_18px_40px_rgb(0_0_0/0.45)] ring-1 ring-paper-edge sm:px-10 sm:py-12">
        <p className="bg-ink px-3 py-1.5 font-display text-xs uppercase tracking-[0.16em] text-paper">
          Result under review
        </p>

        <h1 className="font-display mt-6 text-[clamp(1.6rem,4.4vw,2.4rem)] uppercase leading-[1.02] text-ink">
          You may have won the {CURRENT_CAMPAIGN.prizeTitle}
        </h1>
        <p className="mt-3 max-w-[58ch] text-base leading-relaxed text-ink-soft sm:text-lg">
          Your result is being reviewed. Complete verification to confirm
          eligibility. Until that is finished, nothing has been awarded — to you or
          to anyone else.
        </p>

        <dl className="mt-7 grid gap-px overflow-hidden rounded-[3px] bg-paper-edge sm:grid-cols-2">
          <div className="bg-paper px-4 py-3">
            <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-soft">
              Your claim reference
            </dt>
            <dd className="font-display mt-0.5 text-lg tracking-[0.06em] text-ink">
              {claimReference}
            </dd>
          </div>
          <div className="bg-paper px-4 py-3">
            <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-soft">
              Start your claim by
            </dt>
            <dd className="font-display mt-0.5 text-lg tracking-[0.02em] text-ink">
              {claimDeadline}
            </dd>
          </div>
        </dl>

        <div className="mt-7 max-w-[62ch] text-[0.95rem] leading-[1.7] text-ink">
          <h2 className="font-display text-sm uppercase tracking-[0.12em] text-ink">
            What happens next
          </h2>
          <p className="mt-3">
            The campaign is paused while your entry is verified. Missing the
            deadline forfeits the prize, so starting the claim is the one thing
            worth doing now — the rest can follow.
          </p>

          <h2 className="font-display mt-8 text-sm uppercase tracking-[0.12em] text-ink">
            What you will need
          </h2>
          <ul className="mt-3 list-disc pl-5">
            {REQUIREMENTS.map((r) => (
              <li key={r} className="mt-1.5">
                {r}
              </li>
            ))}
            {taxThresholdReached && (
              <li className="mt-1.5">
                A completed W-9 carrying your SSN or ITIN, because this prize is
                valued at {value} — at or above the $600 US tax reporting
                threshold. The number is never stored in our database.
              </li>
            )}
          </ul>
          {!taxThresholdReached && (
            <p className="mt-3">
              No tax form is required for this prize, because its {value} value is
              below the $600 US reporting threshold. Nobody should ask you for a
              Social Security number, and we will not.
            </p>
          )}

          <h2 className="font-display mt-8 text-sm uppercase tracking-[0.12em] text-ink">
            Nobody will ever ask you to pay
          </h2>
          <p className="mt-3">
            There is no fee, deposit, shipping charge or tax payment to us at any
            stage. If anyone contacts you asking for money to release this prize, it
            is a fraud and not from us —{" "}
            <Link href="/legal/abuse" className="underline">
              report it
            </Link>
            .
          </p>
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href={`/claim/${claimReference}`} className="btn-primary">
            Open your claim
          </Link>
          <Link
            href="/rules"
            className="text-sm text-ink-soft underline hover:text-ink"
          >
            Official Rules
          </Link>
          <Link
            href="/legal/contact"
            className="text-sm text-ink-soft underline hover:text-ink"
          >
            Contact support
          </Link>
        </div>
      </article>
    </section>
  );
}

/**
 * What everyone else sees while a claim is under review.
 *
 * The campaign stays visible on purpose: a promotion that vanishes mid-flight
 * looks exactly like a scam. It also says what happens if verification fails,
 * because "the draw is paused indefinitely" is the reading people will otherwise
 * reach for.
 */
export function CampaignPausedNotice() {
  return (
    <section className="bg-studio-900 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="brushed-dark inline-flex items-center gap-2.5 rounded-[3px] px-3 py-2">
          <span className="h-3.5 w-3.5 rounded-full bg-alu-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]" />
          <span className="font-display text-xs uppercase tracking-[0.14em] text-enamel">
            Off air
          </span>
        </div>

        <h2 className="font-display mt-5 text-[clamp(1.4rem,3.6vw,2.1rem)] uppercase leading-[1.04] text-enamel">
          This draw has a potential winner
        </h2>
        <p className="mt-3 max-w-[56ch] text-base leading-relaxed text-caption">
          A winning entry was drawn and is being verified. Spins are paused while
          that happens, and no prize has been awarded yet.
        </p>
        <p className="mt-3 max-w-[56ch] text-base leading-relaxed text-caption">
          If verification is not completed, the prize is not awarded and the draw
          resumes with the same sealed winning entry — the next entry to reach it
          wins. That outcome was decided in advance and published in the Official
          Rules, not chosen after the fact.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link
            href="/rules"
            className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
          >
            How the winner is decided
          </Link>
          <Link href="/winners" className="text-caption hover:text-enamel">
            Winner archive
          </Link>
        </div>
      </div>
    </section>
  );
}
