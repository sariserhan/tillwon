import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SiteFooter } from "@/app/components/SiteFooter";
import { PrizeAndSponsor } from "@/app/components/PrizeAndSponsor";
import { HowItWorks } from "@/app/components/HowItWorks";
import { PrizeOnPlinth, TallyLamp } from "@/app/components/StudioFurniture";
import { formatMoney, formatOdds } from "@/app/lib/tiers.ts";
import {
  CURRENT_CAMPAIGN,
  CURRENT_ODDS,
  CURRENT_TIER,
} from "@/app/lib/currentCampaign.ts";

/**
 * The campaign detail page.
 *
 * Deliberately not a second copy of the home page: no spin control lives here.
 * This is the surface someone lands on from a sponsor link or a share, where the
 * job is to explain the campaign and send them to the draw — one primary action,
 * not two competing ones.
 */
const CAMPAIGNS = [{ slug: CURRENT_CAMPAIGN.slug }];

export function generateStaticParams() {
  return CAMPAIGNS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!CAMPAIGNS.some((c) => c.slug === slug)) return {};
  return {
    title: `${CURRENT_CAMPAIGN.prizeTitle} draw — SpinDrop`,
    description: `Ten free spins a day for a chance to win the ${CURRENT_CAMPAIGN.prizeTitle}. No purchase necessary. Odds ${formatOdds(CURRENT_ODDS)}.`,
  };
}

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!CAMPAIGNS.some((c) => c.slug === slug)) notFound();

  const valueLabel = formatMoney(CURRENT_CAMPAIGN.prizeValueCents);

  return (
    <div className="flex min-h-dvh flex-col bg-studio-900">
      <SiteHeader />

      <main id="content" className="flex-1">
        <section className="studio-light px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <div>
              <TallyLamp live={CURRENT_CAMPAIGN.status === "live"} />
              <h1 className="font-display mt-5 text-[clamp(1.9rem,5vw,3rem)] uppercase leading-[0.98] text-enamel">
                Win the {CURRENT_CAMPAIGN.prizeTitle}
              </h1>
              <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-caption sm:text-lg">
                Ten free spins every day. Free to enter, nothing to buy, and the prize
                stays available until somebody wins it.
              </p>
              <p className="mt-3 text-sm text-caption">
                Odds <span className="text-enamel">{formatOdds(CURRENT_ODDS)}</span>{" "}
                per entry · {CURRENT_TIER.columns} reels ·{" "}
                {CURRENT_TIER.label} prize
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  href="/"
                  className="btn-primary"
                >
                  Go to the draw
                </Link>
                <Link
                  href="/rules"
                  className="text-sm text-caption underline decoration-caption/40 hover:text-enamel"
                >
                  Official Rules
                </Link>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-full max-w-[34rem]">
                <PrizeOnPlinth
                  valueLabel={valueLabel}
                  faceLabel={CURRENT_CAMPAIGN.prizeTitle}
                  plaque={`${CURRENT_CAMPAIGN.prizeTitle} · Estimated retail value ${valueLabel}`}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="bg-studio-900 px-4 py-2 sm:px-6">
          <p className="mx-auto max-w-7xl text-[0.8rem] leading-relaxed text-caption">
            {CURRENT_CAMPAIGN.noPurchaseStatement}
            <Link
              href="/rules"
              className="text-enamel underline decoration-enamel/40 hover:decoration-enamel"
            >
              Official Rules
            </Link>
            . Stated odds of {formatOdds(CURRENT_ODDS)} are based on the expected
            number of eligible entries; actual odds depend on the total entries
            received.
          </p>
        </div>

        <PrizeAndSponsor />
        <HowItWorks oddsDenominator={CURRENT_ODDS} />
      </main>

      <SiteFooter />
    </div>
  );
}
