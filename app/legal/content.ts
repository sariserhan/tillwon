import { BRAND } from "@/app/lib/brand.ts";
/**
 * Legal surface content.
 *
 * ⚠️ EVERY PAGE HERE IS A DRAFT AND RENDERS A DRAFT BANNER. Nothing in this file
 * has been reviewed by counsel. Facts that must be supplied by a real entity —
 * legal name, address, governing law, data-protection contact — are marked with
 * `NEEDS:` rather than invented, because a plausible-looking fabricated policy is
 * more dangerous than an obviously unfinished one.
 *
 * Facts that ARE settled appear in full: they come from PRODUCT.md and the design
 * spec, and repeating them here keeps the public surface consistent with the
 * decisions the product actually made.
 */

export type LegalSection = { heading: string; body: string[] };

export type LegalPage = {
  slug: string;
  navLabel: string;
  title: string;
  standfirst: string;
  draftNotice: string;
  sections: LegalSection[];
};

const REVIEW =
  "This page is a working draft written alongside the product, not legal advice, and it has not been reviewed by qualified counsel. It must not be published in this state.";

export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    slug: "terms",
    navLabel: "Terms of Service",
    title: "Terms of Service",
    standfirst:
      `The terms on which you may use ${BRAND.name}. The prize draw itself is governed by the Official Rules, which take precedence over this page wherever the two touch.`,
    draftNotice: REVIEW,
    sections: [
      {
        heading: `What ${BRAND.name} is`,
        body: [
          `${BRAND.name} is a free promotional prize draw. It is not a gambling service, not a lottery you buy into, and not a game of skill. You never pay to enter, you cannot buy additional spins, and no payment of any kind improves your chances of winning.`,
          "There is no wallet, no balance of money, no deposit and no withdrawal. Spins are entries, not currency: they cannot be bought, sold, transferred or redeemed for anything.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "One account per person. Creating multiple accounts to obtain additional spins is a breach of these terms and of the Official Rules, and results in forfeiture of any prize.",
          "You must give accurate information, including your date of birth and the state you live in. Both determine whether you are eligible to enter, and a prize claim is verified against government-issued identification.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Do not use automated tools, scripts, or browser automation to spin. Do not attempt to interfere with the draw mechanism, the entry counter, or another person's account.",
          "We may restrict, suspend or close an account where we reasonably believe these terms have been breached. Where an account is restricted, we will say so on screen rather than silently failing your spins.",
        ],
      },
      {
        heading: "Availability",
        body: [
          `${BRAND.name} is provided as-is. Campaigns may be paused or ended in the circumstances set out in the Official Rules. We do not guarantee uninterrupted availability, and an outage does not entitle you to additional spins beyond the daily allocation.`,
        ],
      },
      {
        heading: "Governing law and contact",
        body: [
          "NEEDS: the operating entity's legal name, registered address, and the governing law and venue for these terms.",
          "NEEDS: a contact address for legal notices.",
        ],
      },
    ],
  },

  {
    slug: "privacy",
    navLabel: "Privacy Policy",
    title: "Privacy Policy",
    standfirst:
      "What we collect, why, and what we do not do with it. Winner verification involves sensitive documents, so that part is described separately and in detail.",
    draftNotice: REVIEW,
    sections: [
      {
        heading: "What we collect when you play",
        body: [
          "To create an account: your email address, and whether it has been verified. To determine eligibility: your date of birth and the state you live in.",
          "Each spin records the time, the result, the entry number it occupied, and a one-way hash of your IP address and device identifier. We store hashes rather than the values themselves, so the record cannot be reversed into a network or device identity.",
        ],
      },
      {
        heading: "Winner verification",
        body: [
          "If you are a potential winner, verification requires more: government-issued photo identification, your legal name, your date of birth, proof of address, a signed eligibility affidavit, a photograph for publication, and a signed publicity release.",
          "Where the prize is $600 or more, US tax reporting requires a W-9 carrying your SSN or ITIN. That number is never stored in our database. It exists only inside the W-9 document itself, held in restricted storage reachable through short-lived signed links, and our systems record only that a W-9 was received and reviewed.",
          "Verification documents are never publicly accessible and are not used for any purpose other than confirming eligibility and fulfilling the prize.",
        ],
      },
      {
        heading: "What we publish about winners",
        body: [
          "Accepting a prize requires a publicity release. We publish the winner's name, their city or region, the prize, and their photograph in the winner archive.",
          "We never publish date of birth, identification documents, address, tax information, email address, or any contact detail. The winner archive is stored separately from verification records precisely so that unpublishable data has no path to a public page.",
        ],
      },
      {
        heading: "Email",
        body: [
          "Service email — verification, claim status, prize fulfilment — is sent because it is necessary to run the draw. Daily reminder emails and marketing email are each separately optional, off by default, and unsubscribable in one click.",
        ],
      },
      {
        heading: "Sponsors",
        body: [
          "Sponsors receive aggregate campaign reporting: totals, rates and distributions. A sponsor cannot access your identity, your email, your spin history, or any individual record, and cannot contact you unless you have separately consented.",
        ],
      },
      {
        heading: "Still to be completed",
        body: [
          "NEEDS: the data controller's identity, retention periods per data category, the lawful basis under GDPR if EU residents are ever made eligible, the process for access and deletion requests, and the sub-processors used for email, analytics and storage.",
        ],
      },
    ],
  },

  {
    slug: "cookies",
    navLabel: "Cookie Policy",
    title: "Cookie Policy",
    standfirst:
      `${BRAND.name} uses the smallest set of cookies it can. There is no advertising tracking.`,
    draftNotice: REVIEW,
    sections: [
      {
        heading: "What we use",
        body: [
          "Strictly necessary cookies keep you signed in and protect against cross-site request forgery. These cannot be turned off without breaking the ability to spin.",
          "Analytics cookies measure how the site is used in aggregate, so that a sponsor can be shown honest engagement figures.",
        ],
      },
      {
        heading: "What we do not use",
        body: [
          "No advertising cookies, no cross-site tracking pixels, and no third-party profiling. A sponsor buys measured attention on this site; it does not buy the ability to follow you off it.",
        ],
      },
      {
        heading: "Still to be completed",
        body: [
          "NEEDS: the final cookie inventory with names, purposes and lifetimes, once analytics is wired.",
        ],
      },
    ],
  },

  {
    slug: "accessibility",
    navLabel: "Accessibility",
    title: "Accessibility Statement",
    standfirst:
      "The core of this product is a three-second animation, which makes the non-animated path a first-class experience rather than a fallback.",
    draftNotice: REVIEW,
    sections: [
      {
        heading: "Target",
        body: [
          "We aim to meet WCAG 2.1 Level AA. This statement describes what is built today, not an aspiration.",
        ],
      },
      {
        heading: "What is in place",
        body: [
          "The spin control is a real button, operable by keyboard, with a visible focus indicator and a busy state announced while a draw is running.",
          "The outcome of every spin reaches the page as text and is announced to screen readers, including the symbols drawn and how many spins remain. The result is never communicated by colour or movement alone.",
          "Reduced-motion preferences are honoured: the reels cross-fade instead of turning, over the same duration, so the pacing of a draw survives without movement. A Skip control ends the animation at any point, and doing so cannot change the outcome — the result was decided before the animation began.",
          "Remaining spins are shown as counters that differ in both fill and outline, so the count is readable without relying on colour.",
        ],
      },
      {
        heading: "Known gaps",
        body: [
          "Sound is not yet implemented; when it is, it will be off by default with a persistent control.",
          "Sponsor video is not yet implemented; captions will be required before any is published.",
          "NEEDS: an audit by an external accessibility tester, and a contact route for reporting barriers.",
        ],
      },
    ],
  },

  {
    slug: "sponsor-disclosure",
    navLabel: "Sponsor Disclosure",
    title: "Sponsor Disclosure",
    standfirst:
      "How sponsorship works here, and the things a sponsor is structurally unable to do.",
    draftNotice: REVIEW,
    sections: [
      {
        heading: "What a sponsor provides",
        body: [
          "A sponsor funds or supplies the prize and receives advertising exposure around the draw. Sponsor branding is always identified as sponsorship, never presented as editorial or as a platform endorsement.",
        ],
      },
      {
        heading: "What a sponsor cannot do",
        body: [
          "A sponsor cannot select or influence the winner, cannot change the odds, and cannot alter the Official Rules after a campaign has launched.",
          "A sponsor cannot access entrant identities or personal data, cannot download individual records, and cannot contact entrants without separate consent.",
          "These are enforced by how the system is built rather than by policy alone: sponsor access is a separate mechanism from administrative access, and sponsor-facing reporting returns aggregate figures only.",
        ],
      },
      {
        heading: "Current campaign",
        body: [
          `The current campaign is self-funded by ${BRAND.name}. There is no third-party sponsor, and none is implied anywhere on the site.`,
        ],
      },
    ],
  },

  {
    slug: "prize-tax",
    navLabel: "Prize Taxes",
    title: "Prize Tax Disclosure",
    standfirst:
      "A prize is income. This page explains what that means in practice, and it is not tax advice.",
    draftNotice: REVIEW,
    sections: [
      {
        heading: "You are responsible for taxes on a prize",
        body: [
          "All federal, state and local taxes on a prize are the winner's responsibility. The value reported is the prize's estimated retail value as stated in the Official Rules for that campaign.",
        ],
      },
      {
        heading: "Reporting at $600 and above",
        body: [
          "Where a prize is valued at $600 or more, US tax rules require the sponsor to report it, which requires a completed W-9 carrying your SSN or ITIN before the prize can be released.",
          "Below $600 no tax form is requested, and none should be provided. We do not ask for a taxpayer identification number where the law does not require one.",
        ],
      },
      {
        heading: "Still to be completed",
        body: [
          "NEEDS: confirmation from a tax adviser on withholding obligations and on the treatment of non-cash prizes for the operating entity.",
        ],
      },
    ],
  },

  {
    slug: "contact",
    navLabel: "Contact",
    title: "Contact",
    standfirst: "How to reach a person about an account, a claim, or this site.",
    draftNotice: REVIEW,
    sections: [
      {
        heading: "Support",
        body: ["NEEDS: a monitored support email address and a response-time commitment."],
      },
      {
        heading: "Prize claims",
        body: [
          "If you have received a claim reference, use the claim portal linked in your notification. It shows your required steps, your deadline, and the documents received so far.",
        ],
      },
      {
        heading: "Legal notices",
        body: ["NEEDS: a postal address for legal and regulatory correspondence."],
      },
    ],
  },

  {
    slug: "abuse",
    navLabel: "Report Abuse",
    title: "Report Abuse",
    standfirst:
      "Report suspected cheating, a duplicate-account operation, or anything that looks like the draw being manipulated.",
    draftNotice: REVIEW,
    sections: [
      {
        heading: "What to report",
        body: [
          "Accounts you believe are being operated in bulk to obtain extra spins. Attempts to automate spinning. Anyone claiming to be able to influence or sell a win — nobody can, and any such offer is a fraud.",
          "Anything about the draw that looks wrong to you. The winning entry for each campaign is sealed and published as a commitment before the first spin, and revealed when the draw ends, specifically so that a claim of manipulation can be checked rather than argued about.",
        ],
      },
      {
        heading: "How to report",
        body: [
          "NEEDS: an abuse reporting address, and whether reports can be made anonymously.",
        ],
      },
    ],
  },
];

export function findLegalPage(slug: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.slug === slug);
}
