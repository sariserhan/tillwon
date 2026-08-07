import type { Metadata } from "next";
import Link from "next/link";
import { DocumentShell } from "@/app/components/DocumentShell";
import { TIERS, formatMoney, formatOdds } from "@/app/lib/tiers.ts";
import {
  ELIGIBLE_JURISDICTIONS,
  EXCLUSIONS,
  MINIMUM_AGE,
  registrationDuty,
} from "@/app/lib/jurisdictions.ts";
import {
  CURRENT_CAMPAIGN,
  CURRENT_ODDS,
  CURRENT_TIER,
} from "@/app/lib/currentCampaign.ts";

export const metadata: Metadata = {
  title: "Official Rules — SpinDrop",
  description:
    "Eligibility, how entries work, how the winner is determined, and how a prize is claimed. No purchase necessary.",
};

const value = formatMoney(CURRENT_CAMPAIGN.prizeValueCents);
const duty = registrationDuty(CURRENT_CAMPAIGN.prizeValueCents);

export default function RulesPage() {
  return (
    <DocumentShell
      title="Official Rules"
      standfirst={`Current campaign: the ${CURRENT_CAMPAIGN.prizeTitle}. Free to enter, ${CURRENT_CAMPAIGN.dailySpins} spins a day, and the prize stays live until a valid winner is confirmed.`}
      draftNotice="These rules were drafted alongside the product and have not been reviewed by qualified counsel. They must be reviewed, and any required state registration completed, before a campaign accepts real entries."
    >
      <section>
        <h2>No purchase necessary</h2>
        <p>
          No purchase or payment of any kind is necessary to enter or win. A
          purchase will not improve your chances of winning. There is nothing to
          buy on SpinDrop: spins cannot be purchased, sold, transferred or
          exchanged, and no subscription, payment or product purchase grants
          additional spins or better odds.
        </p>
      </section>

      <section>
        <h2>Who may enter</h2>
        <p>
          Open to legal residents of {ELIGIBLE_JURISDICTIONS.length} US
          jurisdictions — 46 states and the District of Columbia — who are{" "}
          {MINIMUM_AGE} years of age or older at the time of entry.
        </p>
        <p>Void in the following, and wherever else prohibited by law:</p>
        <ul>
          {EXCLUSIONS.map((exclusion) => (
            <li key={exclusion.code}>
              <strong>{exclusion.code}</strong> —{" "}
              {exclusion.code === "TN"
                ? "accepting a prize requires a publicity release, which Tennessee law does not permit as a condition of receiving a prize."
                : "the minimum entry age in this state is above the age this campaign is open to."}
            </li>
          ))}
          <li>
            <strong>US territories and overseas military installations</strong> —
            including Puerto Rico, Guam and the US Virgin Islands, which operate
            under separate promotional regimes.
          </li>
        </ul>
        <p>
          One account per person. Employees, officers and immediate family or
          household members of SpinDrop, of the sponsor, and of any party involved
          in administering the campaign are not eligible.
        </p>
      </section>

      <section>
        <h2>How to enter</h2>
        <p>
          Create a free account and verify your email address. Each eligible
          entrant receives {CURRENT_CAMPAIGN.dailySpins} free spins per calendar
          day. Each spin is one entry.
        </p>
        <p>
          Spins reset daily at {String(CURRENT_CAMPAIGN.resetHour).padStart(2, "0")}
          :00 {CURRENT_CAMPAIGN.resetTimezone}. The reset time is the same for every
          entrant regardless of where they are, and the site shows you the next
          reset in your own local time. Unused spins expire at the reset and do not
          accumulate.
        </p>
      </section>

      <section>
        <h2>How the winner is determined</h2>
        <p>
          Before the campaign accepts its first entry, a single winning entry
          number is drawn at random and sealed. The entry that lands on that number
          wins. Nobody — including SpinDrop staff — can change it afterwards, and
          nobody can select a preferred winner.
        </p>
        <p>
          To make that verifiable rather than merely asserted, a cryptographic
          commitment to the sealed number is published when the campaign opens, and
          the number itself is revealed when the campaign ends. Anyone can then
          confirm that the revealed number matches the commitment published before
          the first entry, and that the winning entry occupies exactly that
          position.
        </p>
        <p>
          The reel symbols shown on screen present the result; they do not
          determine it. The outcome of every spin is decided by the sealed entry
          count before the reels finish moving, and reloading the page, closing the
          browser or skipping the animation cannot change it.
        </p>
      </section>

      <section>
        <h2>Odds of winning</h2>
        <p>
          For this campaign, the stated odds are{" "}
          <strong>{formatOdds(CURRENT_ODDS)}</strong> per entry. Stated odds are
          based on the expected number of eligible entries; actual odds depend on
          the total number of eligible entries received.
        </p>
        <p>
          Odds are set by the prize tier, which also sets how many reels the
          machine has. A larger prize is a longer machine and longer odds:
        </p>
        <ul>
          {TIERS.map((tier) => (
            <li key={tier.tier}>
              {tier.label} — {tier.columns} reels,{" "}
              {formatOdds(Math.pow(10, tier.columns))}
              {tier.tier === CURRENT_TIER.tier ? " (this campaign)" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>If you may have won</h2>
        <p>
          A winning result does not mean you have won. It means you are a potential
          winner, and the campaign is paused for verification. You will be told on
          screen and by email, and you will receive a claim reference and a
          deadline of {CURRENT_CAMPAIGN.claimDeadlineDays} days to begin your claim.
          Failing to begin a claim before the deadline forfeits the prize.
        </p>
        <p>To confirm a claim you must provide:</p>
        <ul>
          <li>Government-issued photo identification</li>
          <li>Your legal first and last name, and your date of birth</li>
          <li>Proof of address in an eligible jurisdiction</li>
          <li>A signed eligibility affidavit</li>
          <li>A photograph for publication, and a signed publicity release</li>
          <li>
            For prizes of $600 or more, a completed W-9 carrying your SSN or ITIN.
            Below $600 no tax form is requested.
          </li>
        </ul>
        <p>
          Verification documents are held in restricted storage, are never publicly
          accessible, and are used only to confirm eligibility and fulfil the prize.
          A taxpayer identification number is never stored in our database — it
          exists only within the tax form itself.
        </p>
      </section>

      <section>
        <h2>Publicity</h2>
        <p>
          <strong>Winners are not anonymous.</strong> Accepting a prize requires
          granting a publicity release, and the winner archive publishes the
          winner&rsquo;s name, their city or region, the prize, and their
          photograph.
        </p>
        <p>
          Date of birth, identification documents, address, tax information and
          contact details are never published. Because this release is a condition
          of accepting a prize, residents of states that do not permit such a
          condition are not eligible to enter — see the exclusions above.
        </p>
      </section>

      <section>
        <h2>Taxes</h2>
        <p>
          All federal, state and local taxes on a prize are the sole responsibility
          of the winner. The value used for reporting is the estimated retail value
          stated for the prize, which for this campaign is {value}. See the{" "}
          <Link href="/legal/prize-tax" className="underline">
            prize tax disclosure
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>When the campaign ends</h2>
        <p>
          This campaign has no scheduled end date: the prize stays available until a
          valid winner is confirmed.
        </p>
        <p>
          It may also end earlier under these rules if the prize becomes
          unavailable, if a regulator or operational requirement demands it, in the
          event of fraud or a security incident, or if the campaign is cancelled.
          The campaign does not run forever, and we do not promise that it will.
        </p>
        {duty.required ? (
          <p>
            Because this prize exceeds $5,000 in value, the campaign is registered
            and bonded in the states that require it, and runs for a stated period
            rather than open-endedly.
          </p>
        ) : (
          <p>
            This prize is valued at or below $5,000, so no state prize registration
            or surety bond is required for it. A future campaign with a larger prize
            will carry a stated end date, because the states that require
            registration also require a defined promotional period.
          </p>
        )}
      </section>

      <section>
        <h2>If a potential winner is disqualified</h2>
        <p>
          If a potential winner fails verification, does not meet the eligibility
          requirements, or does not complete their claim before the deadline, the
          prize is not awarded to them and{" "}
          <strong>the campaign resumes</strong>. The sealed winning entry number is
          left untouched, and the next entry to reach it wins. This is decided in
          advance, on purpose: the outcome of a disqualification is not a judgement
          made after the fact.
        </p>
      </section>

      <section>
        <h2>Suspension</h2>
        <p>
          A campaign may be paused. While paused, no entries are accepted and the
          campaign page remains visible so that entrants can see its status. We do
          not remove a campaign silently.
        </p>
      </section>

      <section>
        <h2>Sponsor</h2>
        <p>
          This campaign is provided by {CURRENT_CAMPAIGN.sponsorName}. A sponsor
          funds or supplies the prize and receives advertising exposure. A sponsor
          cannot select the winner, change the odds, alter these rules after launch,
          or access entrant personal data. See the{" "}
          <Link href="/legal/sponsor-disclosure" className="underline">
            sponsor disclosure
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Still required before launch</h2>
        <p className="mt-3.5 bg-ink/[0.06] px-4 py-3 text-sm text-ink-soft">
          <span className="font-display text-[0.7rem] uppercase tracking-[0.14em] text-ink">
            Still required
          </span>
          <br />
          Review by qualified counsel for every listed jurisdiction; the operating
          entity&rsquo;s legal name and address; a winners-list request address; the
          administrator&rsquo;s identity; and any state registration or bonding that
          applies to a future higher-value campaign.
        </p>
      </section>
    </DocumentShell>
  );
}
