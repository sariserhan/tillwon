/**
 * Reel symbols, drawn as one family: 24×24 grid, solid fills in currentColor,
 * matched optical weight, geometric enamel-sign character. Painted signs have
 * no hairlines, so neither do these.
 */

export const SYMBOL_KEYS = [
  "SEVEN",
  "STAR",
  "DIAMOND",
  "BELL",
  "CHERRY",
  "GIFT",
  "DROP",
] as const;

export type SymbolKey = (typeof SYMBOL_KEYS)[number];

/** Spoken by the live region and used for alt text. */
export const SYMBOL_LABELS: Record<SymbolKey, string> = {
  SEVEN: "seven",
  STAR: "star",
  DIAMOND: "diamond",
  BELL: "bell",
  CHERRY: "cherry",
  GIFT: "gift",
  DROP: "drop",
};

const paths: Record<SymbolKey, React.ReactNode> = {
  SEVEN: <path d="M5 3h14v3.4L12.6 21H8.1l6.2-14H9.4v2.9H5V3Z" />,
  STAR: <path d="m12 2.5 2.72 6.3 6.84.55-5.2 4.5 1.58 6.68L12 16.98l-5.94 3.55 1.58-6.68-5.2-4.5 6.84-.55L12 2.5Z" />,
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
  DROP: <path d="M12 2.2c3.6 4.3 6.4 8 6.4 11.3A6.4 6.4 0 0 1 5.6 13.5C5.6 10.2 8.4 6.5 12 2.2Z" />,
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
