import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { DocumentShell } from "@/app/components/DocumentShell";
import { BRAND } from "@/app/lib/brand.ts";
import { api } from "@/convex/_generated/api";

export const metadata: Metadata = {
  title: `Winners — ${BRAND.name}`,
  description:
    `Every confirmed ${BRAND.name} winner. The archive is empty until the first draw is won.`,
};

export default async function WinnersPage() {
  const winners = await fetchQuery(api.winners.listWinners, {});

  return (
    <DocumentShell
      title="Winners"
      standfirst="Every confirmed winner appears here, by name and photograph, with the prize they won."
    >
      <section>
        {winners.length === 0 ? (
          <div className="mt-2 border border-dashed border-ink/25 px-5 py-8 text-center">
            <p className="font-display text-sm uppercase tracking-[0.14em] text-ink">
              No draw has been won yet
            </p>
            <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-ink-soft">
              {BRAND.name} has not yet awarded a prize. When the first draw is won and the
              winner is verified, they will be published here — and this page will
              never contain anyone who was not.
            </p>
            <p className="mt-4">
              <Link href="/" className="text-sm underline">
                Go and spin
              </Link>
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-5">
            {winners.map((winner) => (
              <li key={winner.commitmentHash + winner.awardedAt} className="border border-ink/15 p-4">
                {winner.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={winner.photoUrl} alt={winner.publicDisplayName} width={96} height={96} />
                )}
                <p className="font-display text-sm uppercase tracking-[0.1em] text-ink">
                  {winner.publicDisplayName} — {winner.region}
                </p>
                <p className="text-sm text-ink-soft">{winner.prizeTitle}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Revealed target: {winner.revealedTarget} · nonce: {winner.revealedNonce} ·
                  commitment: {winner.commitmentHash}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>What gets published</h2>
        <p>
          Accepting a prize requires a publicity release, so winners are not
          anonymous. For each winner we publish their name (or their chosen public
          display name), their region, the prize they won, the date, and their
          photograph.
        </p>
        <p>
          We never publish a date of birth, an address, identification documents,
          tax information, or any contact detail. Verification records are stored
          separately from this archive so that unpublishable information has no path
          to this page.
        </p>
      </section>

      <section>
        <h2>How you can check a draw was fair</h2>
        <p>
          Each campaign&rsquo;s winning entry number is drawn and sealed before the
          first entry, and a cryptographic commitment to it is published when the
          campaign opens. When a campaign ends, the number and its nonce are
          revealed here alongside the winner.
        </p>
        <p>
          Anyone can then recompute the commitment from the revealed values and
          confirm it matches what was published beforehand — which is what makes
          &ldquo;the winner was decided in advance and could not be changed&rdquo; a
          checkable statement rather than a promise. See the{" "}
          <Link href="/rules" className="underline">
            Official Rules
          </Link>{" "}
          for the full mechanism.
        </p>
      </section>
    </DocumentShell>
  );
}
