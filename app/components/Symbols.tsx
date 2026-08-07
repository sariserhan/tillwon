import { type SymbolKey } from "@/app/lib/symbols.ts";

export {
  SYMBOL_KEYS,
  SYMBOL_LABELS,
  isJackpot,
  type SymbolKey,
} from "@/app/lib/symbols.ts";

/**
 * Reel symbols, drawn as one family: 24×24 grid, solid fills in currentColor,
 * matched optical weight, geometric enamel-sign character. Painted signs have
 * no hairlines, so neither do these. Where a symbol needs a second plane, it
 * uses opacity 0.55 — the family's only secondary value.
 */
const paths: Record<SymbolKey, React.ReactNode> = {
  SEVEN: <path d="M5 3h14v3.4L12.6 21H8.1l6.2-14H9.4v2.9H5V3Z" />,
  STAR: (
    <path d="m12 2.5 2.72 6.3 6.84.55-5.2 4.5 1.58 6.68L12 16.98l-5.94 3.55 1.58-6.68-5.2-4.5 6.84-.55L12 2.5Z" />
  ),
  DIAMOND: (
    <>
      <path d="M12 2 2.5 12 12 22l9.5-10L12 2Z" opacity="0.55" />
      <path d="M12 2 2.5 12h19L12 2Z" />
    </>
  ),
  BELL: (
    <>
      <path d="M12 2.2a2.1 2.1 0 0 1 2.1 2.1v.5A7.1 7.1 0 0 1 19 11.5v3.9l1.7 2.3H3.3L5 15.4v-3.9a7.1 7.1 0 0 1 4.9-6.7v-.5A2.1 2.1 0 0 1 12 2.2Z" />
      <path d="M9.4 19h5.2a2.6 2.6 0 0 1-5.2 0Z" />
    </>
  ),
  CHERRY: (
    <>
      <path d="M13.2 3.1c-3.1 1.9-5.4 5-6.4 8.6l2.3.7c.8-3 2.6-5.5 5.1-7l.9 1.7c1.9-1 4-1.4 6.1-1.2l.3-2.4c-2.9-.3-5.8.3-8.3 1.6Z" />
      <circle cx="6.4" cy="17.1" r="4.4" />
      <circle cx="16.6" cy="16.3" r="4" opacity="0.55" />
    </>
  ),
  GIFT: (
    <>
      <path d="M3 10.6h18V21H3V10.6Zm7.7 0h2.6V21h-2.6V10.6Z" />
      <path d="M2 6.6h20v3.4H2V6.6Zm8.7 0h2.6v3.4h-2.6V6.6Z" />
      <path d="M8.2 2.2c1.8 0 3.1 1.6 3.8 4.4H8.2a2.2 2.2 0 0 1 0-4.4Zm7.6 0a2.2 2.2 0 0 1 0 4.4H12c.7-2.8 2-4.4 3.8-4.4Z" />
    </>
  ),
  DROP: (
    <path d="M12 2.2c3.6 4.3 6.4 8 6.4 11.3A6.4 6.4 0 0 1 5.6 13.5C5.6 10.2 8.4 6.5 12 2.2Z" />
  ),
  /* A raffle ticket torn from its stub: the universal free-draw object, and the
     one every visitor has physically held. Drawn as two plain blocks — the
     semicircular perforation notches this started with collapsed into unreadable
     blobs at reel size, where a symbol is about 20px tall. */
  TICKET: (
    <>
      <rect x="2.4" y="6.4" width="11" height="11.2" rx="1.6" />
      <rect x="15" y="6.4" width="6.6" height="11.2" rx="1.6" opacity="0.55" />
    </>
  ),
  /* The studio lamp — the same filament bulb as the on-air tally. */
  LAMP: (
    <>
      <path d="M12 2.3a6.5 6.5 0 0 1 4 11.6v2.3H8v-2.3a6.5 6.5 0 0 1 4-11.6Z" />
      <path d="M8.5 17.4h7v2.2h-7z" />
      <path d="M9.8 20.7h4.4v1.5H9.8z" />
    </>
  ),
  /* The broadcast microphone: the draw is announced out loud, in public. */
  MIC: (
    <>
      <path d="M12 2.4A3.5 3.5 0 0 1 15.5 6v5.2a3.5 3.5 0 0 1-7 0V6A3.5 3.5 0 0 1 12 2.4Z" />
      <path d="M6.1 11.1h2.2a3.7 3.7 0 0 0 7.4 0h2.2a5.9 5.9 0 0 1-4.8 5.8v2.2h2.5v2.3H8.4v-2.3h2.5v-2.2a5.9 5.9 0 0 1-4.8-5.8Z" />
    </>
  ),
};

export function ReelSymbol({
  symbol,
  className,
}: {
  symbol: SymbolKey;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {paths[symbol]}
    </svg>
  );
}
