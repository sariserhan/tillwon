"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlapDrum } from "./FlapDrum";
import { SYMBOL_LABELS, type SymbolKey } from "@/app/lib/symbols.ts";
import { demoSpin, reelQueue } from "@/app/lib/demoSpin.ts";
import { formatOdds } from "@/app/lib/tiers.ts";

const DAILY_SPINS = 10;

/** First reel settles here; the last lands 1100ms later whatever the count. */
const FIRST_SETTLE_MS = 1500;
const SETTLE_SPREAD_MS = 1100;

function settleMs(index: number, columns: number): number {
  if (columns <= 1) return FIRST_SETTLE_MS;
  return Math.round(
    FIRST_SETTLE_MS + (index * SETTLE_SPREAD_MS) / (columns - 1),
  );
}

type DrumState = { incoming: SymbolKey; outgoing: SymbolKey; falling: boolean };

/** Decelerating flip times filling `total`, landing the final flip exactly on it. */
function flipTimes(total: number): number[] {
  const times: number[] = [];
  let t = 0;
  let gap = 85;
  while (t + gap < total) {
    t += gap;
    times.push(t);
    gap *= 1.16;
  }
  times.push(total);
  return times;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Next 00:00 UTC, the campaign's configured reset, shown in the visitor's clock. */
function useResetCountdown() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      );
      const ms = next - now.getTime();
      setLabel(
        `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`,
      );
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

/** Resting faces, so a fresh machine is not eight identical tiles. */
function restingFaces(columns: number): DrumState[] {
  const seed: SymbolKey[] = [
    "SEVEN", "STAR", "GIFT", "TICKET", "BELL", "DROP", "LAMP", "DIAMOND",
  ];
  return Array.from({ length: columns }, (_, i) => {
    const s = seed[i % seed.length];
    return { incoming: s, outgoing: s, falling: false };
  });
}

export function SpinDeck({
  columns,
  oddsDenominator,
}: {
  columns: number;
  oddsDenominator: number;
}) {
  const reduced = usePrefersReducedMotion();
  const resetIn = useResetCountdown();

  const [remaining, setRemaining] = useState(DAILY_SPINS);
  const [spinning, setSpinning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [drums, setDrums] = useState<DrumState[]>(() => restingFaces(columns));

  const timers = useRef<number[]>([]);
  const pendingResult = useRef<SymbolKey[] | null>(null);
  const pendingRemaining = useRef(DAILY_SPINS);

  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  // A tier change is a different machine, so reset the faces rather than
  // leaving stale reels from the previous column count.
  useEffect(() => {
    clearTimers();
    setDrums(restingFaces(columns));
    setSpinning(false);
    setAnnouncement("");
  }, [columns]);

  const settle = useCallback((message: string) => {
    setSpinning(false);
    setAnnouncement(message);
  }, []);

  const resultMessage = (symbols: SymbolKey[], left: number) => {
    const tail =
      left === 0
        ? "That was your last spin today."
        : `You still have ${left} ${left === 1 ? "spin" : "spins"} left today.`;
    // Reading out eight symbol names is noise, not information. Past five reels
    // the outcome and the count carry it, and each reel keeps its own label for
    // a screen-reader user who wants to inspect the row.
    const read =
      symbols.length <= 5
        ? `${symbols.map((s) => SYMBOL_LABELS[s]).join(", ")}. `
        : "";
    return `${read}Not this time. ${tail}`;
  };

  /** Land every reel on the result immediately. The outcome does not change. */
  const skip = useCallback(() => {
    const result = pendingResult.current;
    if (!result) return;
    clearTimers();
    setDrums(result.map((s) => ({ incoming: s, outgoing: s, falling: false })));
    settle(resultMessage(result, pendingRemaining.current));
  }, [settle]);

  const spin = () => {
    if (spinning || remaining === 0) return;

    const { symbols } = demoSpin(columns);
    const left = remaining - 1;
    pendingResult.current = symbols;
    pendingRemaining.current = left;

    setRemaining(left);
    setSpinning(true);
    setAnnouncement("Spinning.");

    const lastSettle = settleMs(columns - 1, columns);

    if (reduced) {
      // No flap. Hold the same beat so the anticipation survives, then reveal.
      symbols.forEach((final, d) => {
        timers.current.push(
          window.setTimeout(() => {
            setDrums((prev) => {
              const next = [...prev];
              next[d] = { incoming: final, outgoing: final, falling: true };
              return next;
            });
          }, settleMs(d, columns)),
        );
      });
      timers.current.push(
        window.setTimeout(() => settle(resultMessage(symbols, left)), lastSettle + 240),
      );
      return;
    }

    symbols.forEach((final, d) => {
      const times = flipTimes(settleMs(d, columns));
      const queue = reelQueue(final, times.length - 1);

      times.forEach((at, i) => {
        timers.current.push(
          window.setTimeout(() => {
            setDrums((prev) => {
              const next = [...prev];
              next[d] = {
                incoming: queue[i],
                outgoing: prev[d].incoming,
                falling: true,
              };
              return next;
            });
            timers.current.push(
              window.setTimeout(() => {
                setDrums((prev) => {
                  const next = [...prev];
                  next[d] = { ...next[d], falling: false };
                  return next;
                });
              }, 150),
            );
          }, at),
        );
      });
    });

    timers.current.push(
      window.setTimeout(() => settle(resultMessage(symbols, left)), lastSettle + 180),
    );
  };

  // Long machines need tighter gaps and narrower tiles to stay on a phone.
  const gapPx = columns <= 4 ? 6 : columns <= 6 ? 4 : 3;
  const housingWidth = `min(100%, ${(columns * 3.4 + 1).toFixed(1)}rem)`;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Wraps rather than crushing: an 8-reel machine takes the width the
          outcome text needed, and a column one word wide is not a column. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-4">
        {/* Apparatus, with its odds stamped on the housing like a spec plate */}
        <div className="shrink-0" style={{ width: housingWidth }}>
          <div
            className="brushed-dark flex items-center rounded-[4px] p-2 shadow-[0_3px_10px_rgb(0_0_0/0.5)] sm:p-2.5"
            style={{ gap: `${gapPx}px` }}
          >
            {drums.map((drum, i) => (
              <div key={i} className="min-w-0 flex-1">
                <FlapDrum
                  incoming={drum.incoming}
                  outgoing={drum.outgoing}
                  falling={drum.falling}
                  reduced={reduced}
                  label={`Reel ${i + 1} of ${columns}: ${SYMBOL_LABELS[drum.incoming]}`}
                />
              </div>
            ))}
          </div>

          <div className="brushed mx-auto mt-1 w-fit rounded-[2px] px-2.5 py-1">
            <p className="text-[0.62rem] uppercase tracking-[0.1em] text-ink">
              {columns} reels · odds {formatOdds(oddsDenominator)}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-col justify-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={spin}
              disabled={spinning || remaining === 0}
              aria-busy={spinning}
              /* .btn-primary carries the size/weight the contrast floor requires.
                 See globals.css — do not restyle this inline. */
              className="btn-primary"
            >
              {remaining === 0 ? "No spins left today" : "Spin now"}
            </button>

            {spinning && (
              <button
                type="button"
                onClick={skip}
                className="rounded-[3px] border border-enamel/35 px-4 py-2.5 text-sm uppercase tracking-wide text-enamel hover:border-enamel/70"
              >
                Skip
              </button>
            )}
          </div>

          {/* Spent ticks are hollow as well as dimmed — never colour alone. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: DAILY_SPINS }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < remaining
                      ? "h-3.5 w-2 rounded-[1px] bg-enamel"
                      : "h-3.5 w-2 rounded-[1px] border border-enamel/30 bg-transparent"
                  }
                />
              ))}
            </div>
            <p className="text-sm text-caption">
              <span className="text-enamel">
                {remaining} of {DAILY_SPINS} free spins left today
              </span>
              {resetIn && <> · resets in {resetIn}</>}
            </p>
          </div>
        </div>

        {/* The outcome reaches the DOM when the result is known; the animation
            only reveals what is already here. */}
        <div className="min-w-0 flex-1 sm:min-w-[15rem]">
          <p
            aria-live="polite"
            className="min-h-[3rem] max-w-[34ch] text-pretty text-base leading-snug text-enamel sm:text-lg"
          >
            {announcement === "Spinning." ? (
              <span className="text-caption">Drawing…</span>
            ) : announcement ? (
              announcement
            ) : (
              <span className="text-caption">
                A seven on all {columns} reels wins the prize.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
