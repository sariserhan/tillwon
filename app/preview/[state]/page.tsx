import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SiteFooter } from "@/app/components/SiteFooter";
import {
  CampaignPausedNotice,
  PotentialWinnerPanel,
} from "@/app/components/WinnerPending";

/**
 * DEVELOPMENT-ONLY state preview. 404s in production.
 *
 * The winner-pending panels cannot be reached any other way until the backend can
 * award a real win, and they must be reviewable before then. But a stranger who
 * saw "You may have won" with a claim reference would reasonably believe it, and
 * fabricating a prize notice is the single worst thing this product could show —
 * so the whole route is gated on NODE_ENV and every value on it is labelled fake.
 *
 * When the backend lands, these panels render from real campaign state and this
 * route can be deleted.
 */
const STATES = ["potential-winner", "paused"] as const;

export function generateStaticParams() {
  return process.env.NODE_ENV === "production"
    ? []
    : STATES.map((state) => ({ state }));
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state } = await params;
  if (!(STATES as readonly string[]).includes(state)) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-studio-900">
      <SiteHeader />

      {/* Unmissable, and it says the reference is not real. */}
      <div className="bg-ink px-4 py-2 sm:px-6">
        <p className="mx-auto max-w-7xl text-[0.8rem] leading-relaxed text-paper">
          <span className="font-display uppercase tracking-[0.14em]">
            Development preview
          </span>{" "}
          — this page is not reachable in production. No claim exists, nothing here
          has been awarded, and any reference shown is fabricated for layout review.
        </p>
      </div>

      <main id="content" className="flex-1">
        {state === "potential-winner" ? (
          /* Every value fabricated, matching the banner above. The panel takes
             its prize from the caller rather than a shared constant, so the live
             path passes real campaign data and this route passes obvious fakes. */
          <PotentialWinnerPanel
            claimReference="CLAIM-PREVIEW"
            claimDeadline="Not a real deadline"
            prizeTitle="$100 gift card (example prize, not real)"
            prizeValueCents={10_000}
          />
        ) : (
          <CampaignPausedNotice
            winningReveal={{ symbols: ["SEVEN", "SEVEN", "SEVEN"], wonAt: Date.now() }}
          />
        )}

        <div className="px-4 py-8 sm:px-6">
          <nav aria-label="Preview states" className="mx-auto max-w-7xl text-sm">
            <span className="text-caption">Other states: </span>
            {STATES.map((s) => (
              <Link
                key={s}
                href={`/preview/${s}`}
                className="mr-4 text-enamel underline decoration-enamel/40 hover:decoration-enamel"
              >
                {s}
              </Link>
            ))}
            <Link href="/" className="text-caption hover:text-enamel">
              back to the draw
            </Link>
          </nav>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
