/**
 * Reel symbol data. Plain TypeScript, no JSX — the drawing lives in
 * `app/components/Symbols.tsx`, so this stays importable by a node self-check.
 *
 * Ten symbols. Seven came from the brief; ticket, lamp and microphone were added
 * from this surface's own world (a public draw, broadcast live) rather than from
 * fruit-machine iconography, which the product may not resemble.
 *
 * These are decorative. They do not set the odds — the winner is decided by the
 * sealed entry counter and the symbols are rendered afterward. 10³ = 1000
 * combinations is NOT a 1-in-1000 chance of winning.
 */

export const SYMBOL_KEYS = [
  "SEVEN",
  "STAR",
  "DIAMOND",
  "BELL",
  "CHERRY",
  "GIFT",
  "DROP",
  "TICKET",
  "LAMP",
  "MIC",
] as const;

export type SymbolKey = (typeof SYMBOL_KEYS)[number];

/** Spoken by the live region and used for reel labels. */
export const SYMBOL_LABELS: Record<SymbolKey, string> = {
  SEVEN: "seven",
  STAR: "star",
  DIAMOND: "diamond",
  BELL: "bell",
  CHERRY: "cherry",
  GIFT: "gift",
  DROP: "drop",
  TICKET: "ticket",
  LAMP: "lamp",
  MIC: "microphone",
};

/**
 * The jackpot: a seven on every column, however many the tier has. Reel count
 * varies by prize tier, so this is deliberately length-agnostic — an empty reel
 * set is never a win.
 */
export function isJackpot(symbols: readonly SymbolKey[]): boolean {
  return symbols.length > 0 && symbols.every((s) => s === "SEVEN");
}

export function jackpotFor(columns: number): SymbolKey[] {
  return Array.from({ length: columns }, () => "SEVEN" as SymbolKey);
}
