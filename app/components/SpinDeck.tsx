"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlapDrum } from "./FlapDrum";
import { SYMBOL_LABELS, type SymbolKey } from "./Symbols";
import { demoSpin, reelQueue } from "@/app/lib/demoSpin";

const DAILY_SPINS = 10;

/** Per-drum settle time. The third drum lands last, so the reveal has a beat. */
const SETTLE_MS = [1700, 2100, 2500] as const;

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

/** Next 00:00 UTC, the campaign's configured reset, shown in the visitor's own clock. */
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
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLabel(`${h}h ${m}m`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

export function SpinDeck() {
  const reduced = usePrefersReducedMotion();
  const resetIn = useResetCountdown();

  const [remaining, setRemaining] = useState(DAILY_SPINS);
  const [spinning, setSpinning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [drums, setDrums] = useState<DrumState[]>([
    { incoming: "SEVEN", outgoing: "SEVEN", falling: false },
    { incoming: "STAR", outgoing: "STAR", falling: false },
    { incoming: "GIFT", outgoing: "GIFT", falling: false },
  ]);

  const timers = useRef<number[]>([]);
  const pendingResult = useRef<[SymbolKey, SymbolKey, SymbolKey] | null>(null);
  const pendingRemaining = useRef(DAILY_SPINS);

  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const settle = useCallback((message: string) => {
    setSpinning(false);
    setAnnouncement(message);
  }, []);

  const resultMessage = (
    symbols: [SymbolKey, SymbolKey, SymbolKey],
    left: number,
  ) => {
    const read = symbols.map((s) => SYMBOL_LABELS[s]).join(", ");
    const tail =
      left === 0
        ? "That was your last spin today."
        : `You still have ${left} ${left === 1 ? "spin" : "spins"} left today.`;
    return `${read}. Not this time. ${tail}`;
  };

  /** Land every drum on the result immediately. The outcome does not change. */
  const skip = useCallback(() => {
    const result = pendingResult.current;
    if (!result) return;
    clearTimers();
    setDrums(
      result.map((s) => ({ incoming: s, outgoing: s, falling: false })),
    );
    settle(resultMessage(result, pendingRemaining.current));
  }, [settle]);

  const spin = () => {
    if (spinning || remaining === 0) return;

    const { symbols } = demoSpin();
    const left = remaining - 1;
    pendingResult.current = symbols;
    pendingRemaining.current = left;

    setRemaining(left);
    setSpinning(true);
    setAnnouncement("Spinning.");

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
          }, SETTLE_MS[d]),
        );
      });
      timers.current.push(
        window.setTimeout(
          () => settle(resultMessage(symbols, left)),
          SETTLE_MS[2] + 240,
        ),
      );
      return;
    }

    symbols.forEach((final, d) => {
      const times = flipTimes(SETTLE_MS[d]);
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
            // Retire the leaf once it has finished hinging down.
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
      window.setTimeout(
        () => settle(resultMessage(symbols, left)),
        SETTLE_MS[2] + 180,
      ),
    );
  };

  const spent = DAILY_SPINS - remaining;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Three columns across the band: apparatus, action, outcome. The outcome
          column is what fills the band's right side — the most important text on
          the page belongs there, not in dead space. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div
          className="brushed-dark flex shrink-0 items-center gap-1.5 rounded-[4px] p-2 shadow-[0_3px_10px_rgb(0_0_0/0.5)] sm:gap-2 sm:p-2.5"
          style={{ width: "min(100%, 16.5rem)" }}
        >
          {drums.map((drum, i) => (
            <div key={i} className="min-w-0 flex-1">
              <FlapDrum
                incoming={drum.incoming}
                outgoing={drum.outgoing}
                falling={drum.falling}
                reduced={reduced}
                label={`Reel ${i + 1}: ${SYMBOL_LABELS[drum.incoming]}`}
              />
            </div>
          ))}
        </div>

        <div className="flex min-w-0 shrink-0 flex-col justify-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={spin}
              disabled={spinning || remaining === 0}
              aria-busy={spinning}
              className="font-display rounded-[3px] bg-tally px-7 py-3.5 text-lg uppercase text-enamel shadow-[0_2px_0_var(--color-tally-dim),0_6px_14px_rgb(0_0_0/0.45)] transition-[transform,box-shadow] duration-150 hover:brightness-110 active:translate-y-px active:shadow-[0_1px_0_var(--color-tally-dim),0_3px_8px_rgb(0_0_0/0.45)] disabled:cursor-not-allowed disabled:bg-alu-600 disabled:text-enamel-dim disabled:shadow-none"
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

          {/* Spin counter as enamel ticks: countable, and never colour alone —
              spent ticks are dimmed and hollow, not merely a different hue. */}
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

        {/* The outcome as text. Reaches the DOM the moment the result is known,
            so the animation only ever reveals what is already here. */}
        <div className="min-w-0 flex-1 sm:border-l sm:border-enamel/15 sm:pl-5">
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
                Three sevens wins the prize. The draw is running now.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
