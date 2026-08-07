"use client";

import { ReelSymbol, type SymbolKey } from "./Symbols";

/**
 * One split-flap drum.
 *
 * A real flap, not a blurred reel: the outgoing symbol's top half hinges down
 * over the incoming symbol, so every change is a discrete countable event. That
 * distinction is the product's whole argument against looking like a casino,
 * and it lives here rather than in copy.
 *
 * The half-symbol trick: an inner block sized to the full tile is clipped by a
 * half-height window, offset so the window frames either its top or its bottom.
 */
function Half({
  symbol,
  half,
  className = "",
}: {
  symbol: SymbolKey;
  half: "top" | "bottom";
  className?: string;
}) {
  return (
    <div className={`relative h-1/2 overflow-hidden ${className}`}>
      <div
        className="absolute inset-x-0 flex items-center justify-center"
        style={{ height: "200%", top: half === "top" ? "0" : "-100%" }}
      >
        <ReelSymbol symbol={symbol} className="h-[54%] w-auto text-ink" />
      </div>
    </div>
  );
}

export function FlapDrum({
  incoming,
  outgoing,
  falling,
  reduced,
  label,
}: {
  /** The symbol being revealed. */
  incoming: SymbolKey;
  /** The symbol hinging away. */
  outgoing: SymbolKey;
  falling: boolean;
  reduced: boolean;
  label: string;
}) {
  return (
    <div
      className="brushed rounded-[3px] p-[3px] shadow-[0_2px_6px_rgb(0_0_0/0.55)]"
      aria-label={label}
      role="img"
    >
      <div className="flap relative aspect-[5/6] w-full overflow-hidden rounded-[2px] bg-enamel">
        {/* Resting faces: the incoming symbol's top is revealed as the leaf
            falls; its bottom is already in place. */}
        <Half symbol={incoming} half="top" />
        <Half
          symbol={incoming}
          half="bottom"
          className={reduced && falling ? "reduced-fade" : ""}
        />

        {/* The hinge line. Split-flap boards have a real seam and a shadow
            under the upper leaf. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-px bg-ink/35" />

        {/* The falling leaf. Only present mid-flip, and skipped entirely under
            reduced motion, where the faces cross-fade instead. */}
        {falling && !reduced && (
          <div className="absolute inset-x-0 top-0 h-1/2 flap-leaf flap-falling">
            <div className="relative h-full overflow-hidden bg-enamel">
              <div
                className="absolute inset-x-0 flex items-center justify-center"
                style={{ height: "200%", top: "0" }}
              >
                <ReelSymbol symbol={outgoing} className="h-[54%] w-auto text-ink" />
              </div>
            </div>
            <div className="h-px w-full bg-ink/45" />
          </div>
        )}

        {/* Cheek shadows: the tile sits in a housing, so its edges fall off. */}
        <div className="pointer-events-none absolute inset-0 rounded-[2px] shadow-[inset_0_0_0_1px_rgb(20_16_12/0.16),inset_0_10px_14px_-10px_rgb(20_16_12/0.4)]" />
      </div>
    </div>
  );
}
