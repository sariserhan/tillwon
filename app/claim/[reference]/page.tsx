import type { Metadata } from "next";
import Link from "next/link";
import { DocumentShell } from "@/app/components/DocumentShell";
import { CURRENT_CAMPAIGN } from "@/app/lib/currentCampaign.ts";
import { BRAND } from "@/app/lib/brand.ts";

export const metadata: Metadata = {
  title: `Your claim — ${BRAND.name}`,
  description: "The steps a prize claim follows, and what you will need.",
};

/**
 * The claim portal shell.
 *
 * This surface is read by exactly one person, who has just been told they may
 * have won and is anxious. So it does two things carefully:
 *
 * 1. It never says "you won". A winning result makes someone a potential winner,
 *    and overstating that at the moment of highest emotion is both the product's
 *    biggest legal exposure and its biggest trust risk.
 * 2. It does not pretend to have found a claim. There is no backend, so echoing a
 *    reference back with a plausible status would be fabricating a record about
 *    someone's prize — the worst possible thing to invent.
 */
const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Confirm you control this account",
    body: "You sign in to the account that produced the winning entry. A claim cannot be transferred to another account or another person.",
  },
  {
    title: "Verify who you are",
    body: "Government-issued photo identification, your legal first and last name, and your date of birth. We check that you meet the minimum age and that the details match the account.",
  },
  {
    title: "Verify where you live",
    body: "Proof of address in an eligible jurisdiction. Eligibility is decided by where you live, so this cannot be skipped.",
  },
  {
    title: "Sign the affidavit and publicity release",
    body: "An eligibility affidavit confirming you meet the rules, and a publicity release. Accepting the prize requires the release, because winners are published by name and photograph.",
  },
  {
    title: "Provide a photograph",
    body: "A photograph of you for the winner archive, published alongside your name and your city or region.",
  },
  {
    title: "Tax paperwork, only if the prize requires it",
    body: "For prizes of $600 or more, a completed W-9 carrying your SSN or ITIN. Below that threshold no tax form is requested, and none should be sent. The number itself is never stored in our database.",
  },
  {
    title: "Review, then fulfilment",
    body: "We check everything against the Official Rules and tell you the outcome. Once approved, the prize is arranged and its progress is shown here.",
  },
];

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  // Displayed as the reference in the URL, never as a looked-up record.
  const shown = decodeURIComponent(reference).toUpperCase().slice(0, 32);

  return (
    <DocumentShell
      title="Your claim"
      standfirst="If you have reached a winning result, this is the process that follows. Nothing here is automatic, and nothing is decided until verification is complete."
      draftNotice="Claims are not live yet. This page shows the steps a claim will follow; it is not connected to any claim record and cannot look one up. If you are expecting a real claim, it will reach you by email with a link."
    >
      <section>
        <h2>Reference in this link</h2>
        <p>
          <span className="font-display tracking-[0.06em]">{shown}</span>
        </p>
        <p>
          This is simply the reference contained in the address you opened. No claim
          record exists for it, and its presence here does not mean a claim has been
          started or a prize awarded.
        </p>
      </section>

      <section>
        <h2>What a winning result actually means</h2>
        <p>
          A winning result makes you a <strong>potential winner</strong>. It does not
          mean you have won. The campaign pauses while your eligibility is verified,
          and the prize is only awarded once that verification is complete.
        </p>
        <p>
          If verification is not completed before the deadline, or if the eligibility
          requirements are not met, the prize is not awarded and the campaign resumes
          with the same sealed winning entry — the next entry to reach it wins.
        </p>
      </section>

      <section>
        <h2>Your deadline</h2>
        <p>
          A claim must be started within {CURRENT_CAMPAIGN.claimDeadlineDays} days of
          being notified. The exact date is stated in your notification and shown on
          this page once claims are live. Missing the deadline forfeits the prize, so
          it is the one part of this process worth acting on immediately.
        </p>
      </section>

      <section>
        <h2>The steps</h2>
        <ol className="mt-3 list-decimal pl-5">
          {STEPS.map((step) => (
            <li key={step.title} className="mt-3">
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>How your documents are handled</h2>
        <p>
          Verification documents are held in restricted storage, are never publicly
          accessible, and are reachable only through short-lived signed links by you
          and by the reviewer. They are used to confirm eligibility and fulfil the
          prize, and for nothing else.
        </p>
        <p>
          What gets published is your name, your city or region, the prize, and your
          photograph. Your date of birth, identification documents, address, tax
          information and contact details are never published.
        </p>
      </section>

      <section>
        <h2>Nobody will ever ask you to pay</h2>
        <p>
          There is no fee, no deposit, no shipping charge and no tax payment to us at
          any stage. If anyone contacts you asking for money to release a {BRAND.name}
          prize, it is a fraud and not from us. Please{" "}
          <Link href="/legal/abuse" className="underline">
            report it
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Support</h2>
        <p>
          Questions about a claim go to support, and the{" "}
          <Link href="/rules" className="underline">
            Official Rules
          </Link>{" "}
          govern anything this page summarises.
        </p>
        <p className="mt-3.5 bg-ink/[0.06] px-4 py-3 text-sm text-ink-soft">
          <span className="font-display text-[0.7rem] uppercase tracking-[0.14em] text-ink">
            Still required
          </span>
          <br />A monitored support address for claimants, and the claim portal&rsquo;s
          document upload, which arrives with the backend.
        </p>
      </section>
    </DocumentShell>
  );
}
