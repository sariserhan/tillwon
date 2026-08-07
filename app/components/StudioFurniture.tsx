/**
 * Static studio furniture: the tally lamp, the sealed commitment, and the prize
 * on its plinth. All authored SVG/CSS — no photography exists yet (PRODUCT.md,
 * Evidence on Hand), so nothing here pretends to be a photograph.
 */

/** The on-air lamp. The only element permitted to use tally red. */
export function TallyLamp({ live }: { live: boolean }) {
  return (
    <div className="brushed-dark inline-flex items-center gap-2.5 rounded-[3px] px-3 py-2 shadow-[0_2px_6px_rgb(0_0_0/0.5)]">
      <span
        className={`h-3.5 w-3.5 rounded-full ${
          live
            ? "tally-live"
            : "bg-alu-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]"
        }`}
      />
      <span className="font-display text-xs uppercase tracking-[0.14em] text-enamel">
        {live ? "Live" : "Off air"}
      </span>
    </div>
  );
}

/**
 * The sealed envelope. This is the campaign's cryptographic commitment rendered
 * as the object a televised draw uses to prove itself: the winning entry is
 * fixed and sealed before the first spin, and revealed when the draw ends.
 */
export function SealedCommitment() {
  return (
    <a
      href="/rules"
      className="group flex w-full items-start gap-3 rounded-[3px] bg-studio-900/70 p-3 text-left ring-1 ring-enamel/15 backdrop-blur-[2px] transition-colors hover:ring-enamel/40 sm:max-w-[15rem]"
    >
      <svg
        viewBox="0 0 32 24"
        className="mt-0.5 h-7 w-9 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="0.5" y="0.5" width="31" height="23" rx="1.5" fill="#e8e2d4" />
        <path d="M0.5 1.2 16 13 31.5 1.2" fill="none" stroke="#c9c2b2" strokeWidth="1.2" />
        <circle cx="16" cy="15.5" r="4.6" fill="#8d1e12" />
        <circle cx="16" cy="15.5" r="2.7" fill="none" stroke="#e8e2d4" strokeWidth="0.9" opacity="0.7" />
      </svg>
      <span>
        <span className="block font-display text-sm uppercase tracking-wide text-enamel">
          Sealed before the first entry
        </span>
        {/* The reassurance in full where there is room; on a phone the headline
            and the link carry it, and the rules page has the detail. Space above
            the primary action is worth more than a third line of copy. */}
        <span className="mt-0.5 hidden text-xs leading-snug text-caption sm:block">
          The winning entry is fixed and published as a sealed commitment, then
          revealed when the draw ends.
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-enamel underline decoration-enamel/40 group-hover:decoration-enamel">
          How the winner is decided
        </span>
      </span>
    </a>
  );
}

/**
 * The prize on a lit plinth, as the programme's subject.
 *
 * PLACEHOLDER ART. Real prize photography replaces the card face; the plinth
 * and plaque are the world's own furniture and stay.
 */
export function PrizeOnPlinth({
  valueLabel,
  plaque,
  faceLabel,
}: {
  valueLabel: string;
  plaque: string;
  /** Printed on the card's band. Never hardcode a prize type here — a $50,000
      grand prize labelled "GIFT CARD" is placeholder art telling a lie. */
  faceLabel: string;
}) {
  return (
    <div className="relative flex h-full min-h-0 w-full max-w-[44rem] flex-col items-center justify-end">
      <svg
        viewBox="0 0 400 250"
        preserveAspectRatio="xMidYMax meet"
        className="h-full min-h-0 w-full"
        role="img"
        aria-label={`Prize: ${plaque}, displayed on a plinth.`}
      >
        <defs>
          <linearGradient id="cardFace" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#f4efe3" />
            <stop offset="100%" stopColor="#d9d2c1" />
          </linearGradient>
          <linearGradient id="plinthTop" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d3d7da" />
            <stop offset="60%" stopColor="#9ba2a8" />
            <stop offset="100%" stopColor="#6d757b" />
          </linearGradient>
          <linearGradient id="plinthFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5c646a" />
            <stop offset="100%" stopColor="#2b3237" />
          </linearGradient>
        </defs>

        {/* Card, tilted into the key light. Drawn before the plinth top so its
            base tucks behind the front edge and reads as standing on it. */}
        <g transform="rotate(-2.5 200 120)">
          {/* Contact shadow — the card sits on something, so it casts onto it */}
          <ellipse cx="200" cy="192" rx="112" ry="9" fill="#000" opacity="0.4" />
          <rect
            x="82"
            y="24"
            width="236"
            height="172"
            rx="9"
            fill="url(#cardFace)"
            stroke="#b9b1a0"
            strokeWidth="1"
          />
          <path d="M82 33a9 9 0 0 1 9-9h218a9 9 0 0 1 9 9v30H82V33Z" fill="#0d4a4e" />
          <text
            x="104"
            y="52"
            fill="#e8e2d4"
            fontFamily="var(--font-archivo), sans-serif"
            fontStretch="125%"
            fontSize="16"
            fontWeight="700"
            letterSpacing="1.8"
          >
            {faceLabel.slice(0, 16).toUpperCase()}
          </text>
          <text
            x="104"
            y="146"
            fill="#14100c"
            fontFamily="var(--font-archivo), sans-serif"
            fontStretch="125%"
            fontSize={valueLabel.length > 5 ? 48 : 68}
            fontWeight="700"
            letterSpacing="-2"
          >
            {valueLabel}
          </text>
          <rect x="106" y="162" width="104" height="8" rx="1" fill="#14100c" opacity="0.18" />
        </g>

        {/* Plinth, drawn over the card's base */}
        <polygon points="64,186 336,186 366,212 34,212" fill="url(#plinthTop)" />
        <rect x="34" y="212" width="332" height="30" fill="url(#plinthFace)" />
      </svg>

      {/* Engraved plaque */}
      <div className="brushed -mt-2 rounded-[2px] px-4 py-1.5 shadow-[0_2px_6px_rgb(0_0_0/0.5)]">
        <p className="text-center text-[0.62rem] uppercase tracking-[0.1em] text-ink sm:text-[0.7rem] sm:tracking-[0.12em]">
          {plaque}
        </p>
      </div>
    </div>
  );
}
