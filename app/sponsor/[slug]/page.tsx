import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentShell } from "@/app/components/DocumentShell";
import { CURRENT_CAMPAIGN } from "@/app/lib/currentCampaign.ts";
import { formatMoney } from "@/app/lib/tiers.ts";

/**
 * The public sponsor profile.
 *
 * Only one sponsor exists — SpinDrop itself, funding its own first campaign — so
 * this page has exactly one real entry and 404s for anything else. Generating a
 * page for an invented sponsor would be the fastest route to looking like the
 * thing this product is trying not to be.
 */
const SPONSORS = [
  {
    slug: CURRENT_CAMPAIGN.sponsorSlug,
    name: CURRENT_CAMPAIGN.sponsorName,
    selfFunded: true,
    blurb:
      "SpinDrop is funding its own first campaign. The prize is real and the money is ours, which is the honest way to prove the draw works before asking a brand to back one.",
  },
];

export function generateStaticParams() {
  return SPONSORS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sponsor = SPONSORS.find((s) => s.slug === slug);
  if (sponsor === undefined) return {};
  return {
    title: `${sponsor.name} — SpinDrop sponsor`,
    description: sponsor.blurb,
  };
}

export default async function SponsorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sponsor = SPONSORS.find((s) => s.slug === slug);
  if (sponsor === undefined) notFound();

  return (
    <DocumentShell
      title={sponsor.name}
      standfirst={`Sponsor of the current campaign — the ${CURRENT_CAMPAIGN.prizeTitle}.`}
    >
      <section>
        <h2>About this sponsor</h2>
        <p>{sponsor.blurb}</p>
        {sponsor.selfFunded && (
          <p>
            Because this campaign is self-funded, there is no third-party brand
            behind it and none is implied anywhere on the site. When a real sponsor
            backs a campaign, they will be named here, on the campaign page, and in
            the Official Rules.
          </p>
        )}
      </section>

      <section>
        <h2>What this sponsor provides</h2>
        <ul>
          <li>
            The prize: one {CURRENT_CAMPAIGN.prizeTitle}, estimated retail value{" "}
            {formatMoney(CURRENT_CAMPAIGN.prizeValueCents)}
          </li>
          <li>Funding for the campaign it appears in</li>
        </ul>
      </section>

      <section>
        <h2>What this sponsor cannot do</h2>
        <p>
          These are properties of how the platform is built rather than promises made
          on a sponsor&rsquo;s behalf:
        </p>
        <ul>
          <li>Select, influence or veto the winner</li>
          <li>Change the odds, or alter the Official Rules after a campaign opens</li>
          <li>Access entrant identities, email addresses or individual spin records</li>
          <li>Contact entrants without their separate consent</li>
        </ul>
        <p>
          Sponsor reporting returns aggregate figures only — totals, rates and
          distributions. See the{" "}
          <Link href="/legal/sponsor-disclosure" className="underline">
            sponsor disclosure
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Campaign</h2>
        <p>
          <Link href={`/campaign/${CURRENT_CAMPAIGN.slug}`} className="underline">
            The {CURRENT_CAMPAIGN.prizeTitle} draw
          </Link>{" "}
          ·{" "}
          <Link href="/rules" className="underline">
            Official Rules
          </Link>
        </p>
      </section>
    </DocumentShell>
  );
}
