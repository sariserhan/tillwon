import type { Metadata } from "next";
import Link from "next/link";
import { DocumentShell } from "@/app/components/DocumentShell";
import { BRAND } from "@/app/lib/brand.ts";

export const metadata: Metadata = {
  title: `Winners — ${BRAND.name}`,
  description:
    `Every confirmed ${BRAND.name} winner. The archive is empty until the first draw is won.`,
};

/**
 * The winner archive.
 *
 * Empty, and honestly so. PRODUCT.md records that no winner exists, and the one
 * unrecoverable design mistake for a product whose core problem is being mistaken
 * for a scam would be inventing plausible winners to fill this page.
 */
export default function WinnersPage() {
  return (
    <DocumentShell
      title="Winners"
      standfirst="Every confirmed winner appears here, by name and photograph, with the prize they won."
    >
      <section>
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
      </section>

      <section>
        <h2>What gets published</h2>
        <p>
          Accepting a prize requires a publicity release, so winners are not
          anonymous. For each winner we publish their name, their city or region,
          the prize they won, the date, and their photograph.
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
