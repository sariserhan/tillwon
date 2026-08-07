import Link from "next/link";
import { formatMoney, formatOdds } from "@/app/lib/tiers.ts";
import { BRAND } from "@/app/lib/brand.ts";
import {
  CURRENT_CAMPAIGN,
  CURRENT_ODDS,
  CURRENT_TIER,
} from "@/app/lib/currentCampaign.ts";

/**
 * Prize detail and the sponsor panel.
 *
 * Presented as a spec plate — the engraved card a studio prize sits beside —
 * because the facts a suspicious visitor wants are specifications, not prose:
 * what exactly is it worth, how many are there, how does it reach me.
 *
 * There is no campaign-statistics block. The brief lists one, but no metrics
 * exist yet (PRODUCT.md, Evidence on Hand) and an impressive-looking figure here
 * would be the one unrecoverable mistake for this product. An empty stats panel
 * communicates nothing, so it is omitted rather than faked or stubbed.
 */
export function PrizeAndSponsor() {
  const value = formatMoney(CURRENT_CAMPAIGN.prizeValueCents);

  const spec: Array<[string, string]> = [
    ["Prize", CURRENT_CAMPAIGN.prizeTitle],
    ["Estimated retail value", value],
    ["Quantity", "One"],
    ["Fulfilment", "Digital, emailed after verification"],
    ["Odds per entry", formatOdds(CURRENT_ODDS)],
    ["Reels", `${CURRENT_TIER.columns} — a seven on every one wins`],
    ["Entries per day", String(CURRENT_CAMPAIGN.dailySpins)],
    ["Campaign ends", "When a valid winner is confirmed"],
  ];

  return (
    <section className="bg-studio-800 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <h2 className="font-display text-[clamp(1.4rem,3.4vw,2rem)] uppercase leading-[1.04] text-enamel">
            This campaign&rsquo;s prize
          </h2>
          <p className="mt-2.5 max-w-[52ch] text-sm leading-relaxed text-caption sm:text-base">
            One {CURRENT_CAMPAIGN.prizeTitle}, and it stays available until somebody
            wins it.
          </p>

          <dl className="mt-6 overflow-hidden rounded-[3px] ring-1 ring-enamel/15">
            {spec.map(([label, detail], i) => (
              <div
                key={label}
                className={`flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-6 ${
                  i % 2 === 0 ? "bg-studio-900/45" : "bg-studio-900/20"
                }`}
              >
                <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-caption sm:w-[13rem] sm:shrink-0">
                  {label}
                </dt>
                <dd className="text-sm text-enamel">{detail}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-caption">
            The prize illustration on this page is placeholder artwork. It is
            replaced with a photograph of the actual prize before a campaign opens
            to real entries.
          </p>
        </div>

        <div>
          <h2 className="font-display text-[clamp(1.4rem,3.4vw,2rem)] uppercase leading-[1.04] text-enamel">
            Who provides it
          </h2>

          {/* Honest about the only fact that matters here: nobody is sponsoring
              this yet. Inventing a sponsor would be the fastest way to become the
              thing this product is trying not to look like. */}
          <div className="mt-5 rounded-[3px] bg-studio-900/45 p-5 ring-1 ring-enamel/15">
            <span className="brushed inline-block rounded-[2px] px-2.5 py-1 font-display text-xs uppercase tracking-wide text-ink">
              {CURRENT_CAMPAIGN.sponsorName}
            </span>
            <p className="mt-3.5 max-w-[52ch] text-sm leading-relaxed text-caption">
              This first campaign is funded by {BRAND.name} itself. There is no
              third-party sponsor yet, and none is implied anywhere on this site —
              the prize is real and the money is ours.
            </p>
            <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-caption">
              Later campaigns carry a sponsor who funds the prize in exchange for
              the advertising around the draw. Whoever that is will be named here,
              on the campaign page, and in the Official Rules.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link
              href="/rules"
              className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
            >
              Official Rules
            </Link>
            <Link
              href="/legal/sponsor-disclosure"
              className="text-caption hover:text-enamel"
            >
              Sponsor disclosure
            </Link>
            <Link href="/legal/prize-tax" className="text-caption hover:text-enamel">
              Prize taxes
            </Link>
            <Link href="/winners" className="text-caption hover:text-enamel">
              Winner archive
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
