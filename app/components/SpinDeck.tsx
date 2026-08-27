"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FlapDrum } from "./FlapDrum";
import { RulesGate } from "./RulesGate";
import { SYMBOL_LABELS, type SymbolKey } from "@/convex/lib/symbols.ts";
import { reelQueue } from "@/convex/lib/reels.ts";
import { formatOdds } from "@/convex/lib/tiers.ts";
import {
  FLAP_MS,
  SETTLE_TAIL_MS,
  flipTimes,
  settleMs,
} from "@/app/lib/reelTiming.ts";

/** Typed codes to fixed copy, so one failure never gets two explanations. */
function errorCopy(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("NO_SPINS_REMAINING")) return "You've used all your spins today.";
  if (code.includes("CAMPAIGN_NOT_LIVE"))
    return "This jackpot has a potential winner under review. The campaign is paused while we verify.";
  if (code.includes("RULES_NOT_ACCEPTED"))
    return "Read and accept the Official Rules to start spinning.";
  if (code.includes("INELIGIBLE_REGION"))
    return "This campaign isn't open in your region yet. See Official Rules for eligibility.";
  if (code.includes("UNDERAGE")) return "You must be 18 or older to enter.";
  if (code.includes("EMAIL_UNVERIFIED")) return "Verify your email to start spinning.";
  if (code.includes("ACCOUNT_RESTRICTED"))
    return "Your account is under review. Contact support.";
  if (code.includes("NOT_AUTHENTICATED")) return "Sign in to start spinning.";
  return "Something went wrong. Your spins are safe — try again.";
}

/** flipId increments per flip so FlapDrum can remount its animated nodes. */
type DrumState = {
  incoming: SymbolKey;
  outgoing: SymbolKey;
  falling: boolean;
  flipId: number;
};

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

/**
 * A caption plate in the apparatus's own material. Used by the out-of-spins state
 * now, and by the typed spin-error codes once the backend can return them.
 */
function DeckNotice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="brushed-dark max-w-[30rem] rounded-[3px] px-4 py-3 shadow-[0_2px_6px_rgb(0_0_0/0.5)]"
    >
      <p className="font-display text-xs uppercase tracking-[0.14em] text-enamel">
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-enamel">{children}</p>
    </div>
  );
}

/** Resting faces, so a fresh machine is not eight identical tiles. */
function restingFaces(columns: number): DrumState[] {
  const seed: SymbolKey[] = [
    "SEVEN", "STAR", "GIFT", "TICKET", "BELL", "DROP", "LAMP", "DIAMOND",
  ];
  return Array.from({ length: columns }, (_, i) => {
    const s = seed[i % seed.length];
    return { incoming: s, outgoing: s, falling: false, flipId: 0 };
  });
}

export function SpinDeck({
  columns,
  oddsDenominator,
  dailySpins,
}: {
  columns: number;
  oddsDenominator: number;
  /** Campaign-configured allocation, shown until the real balance loads. */
  dailySpins: number;
}) {
  const reduced = usePrefersReducedMotion();
  const resetIn = useResetCountdown();

  // Skipped while signed out: the balance query requires a user and would
  // otherwise throw NOT_AUTHENTICATED on every anonymous page view. Spinning
  // while signed out still fails, with a clear "sign in" message, on the spin
  // attempt itself rather than a crash on load.
  const { isAuthenticated } = useConvexAuth();
  const balance = useQuery(
    api.balances.getDailySpinBalance,
    isAuthenticated ? {} : "skip",
  );
  const executeSpin = useMutation(api.spins.spinExecute);

  // Allocated falls back to the campaign's configured count — while the query
  // is loading, and for a signed-out visitor who has not spun yet — rather than
  // the fixed 10 this deck used to assume.
  const allocated = balance?.allocated ?? dailySpins;
  // Optimistic before the balance is known: 0 here would show "out of spins"
  // to a fresh or signed-out visitor who has never spun. The server is the
  // real gate regardless of what this shows.
  const remaining = balance?.remaining ?? allocated;

  // Not persisted on purpose — see RulesGate. The durable record is server-side.
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [drums, setDrums] = useState<DrumState[]>(() => restingFaces(columns));

  const timers = useRef<number[]>([]);
  const pendingResult = useRef<SymbolKey[] | null>(null);
  const pendingRemaining = useRef(dailySpins);

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
    setDrums((prev) =>
      result.map((s, d) => ({
        incoming: s,
        outgoing: s,
        falling: false,
        flipId: (prev[d]?.flipId ?? 0) + 1,
      })),
    );
    settle(resultMessage(result, pendingRemaining.current));
  }, [settle]);

  const spin = async () => {
    if (spinning || remaining === 0) return;
    setSpinning(true);
    setAnnouncement("Spinning.");

    let result;
    try {
      result = await executeSpin({
        // A fresh key per attempt; a retry of the SAME attempt must reuse it.
        idempotencyKey: crypto.randomUUID(),
        deviceHash: "browser",
      });
    } catch (error) {
      setSpinning(false);
      setAnnouncement(errorCopy(error));
      return;
    }

    const symbols = result.symbols as SymbolKey[];
    const left = result.remainingSpins;
    pendingResult.current = symbols;
    pendingRemaining.current = left;
    scheduleReveal(symbols, left);
  };

  const scheduleReveal = (symbols: SymbolKey[], left: number) => {
    const lastSettle = settleMs(columns - 1, columns);

    if (reduced) {
      // No flap. Hold the same beat so the anticipation survives, then reveal.
      symbols.forEach((final, d) => {
        timers.current.push(
          window.setTimeout(() => {
            setDrums((prev) => {
              const next = [...prev];
              next[d] = {
                incoming: final,
                outgoing: final,
                falling: true,
                flipId: prev[d].flipId + 1,
              };
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
                flipId: prev[d].flipId + 1,
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
              }, FLAP_MS),
            );
          }, at),
        );
      });
    });

    timers.current.push(
      window.setTimeout(() => settle(resultMessage(symbols, left)), lastSettle + SETTLE_TAIL_MS),
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
                  flipId={drum.flipId}
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
          {/*
            Out of spins replaces the control rather than greying it out. A
            disabled button that cannot re-enable for another twenty hours is a
            dead end, and its label only repeated the counter beneath it. The
            notice states the recovery — when spins return — and closes the door
            on the instinct the product must never monetise.
          */}
          {!rulesAccepted ? (
            <RulesGate onAccept={() => setRulesAccepted(true)} />
          ) : remaining === 0 && !spinning ? (
            <DeckNotice title="Out of spins today">
              Your {allocated} free spins come back
              {resetIn ? ` in ${resetIn}` : " at the daily reset"}. There is no way
              to get more before then, and nothing to buy — that is the whole point.{" "}
              <Link
                href="/rules"
                className="underline decoration-enamel/40 hover:decoration-enamel"
              >
                Official Rules
              </Link>
            </DeckNotice>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={spin}
                disabled={spinning}
                aria-busy={spinning}
                /* .btn-primary carries the size/weight the contrast floor requires.
                   See globals.css — do not restyle this inline. */
                className="btn-primary"
              >
                Spin now
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
          )}

          {/* Spent ticks are hollow as well as dimmed — never colour alone. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1" aria-hidden="true">
              {Array.from({ length: allocated }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < remaining
                      ? "h-3.5 w-2 rounded-[1px] bg-enamel"
                      : "h-3.5 w-2 rounded-[1px] border border-enamel/45 bg-transparent"
                  }
                />
              ))}
            </div>
            <p className="text-sm text-caption">
              <span className="text-enamel">
                {remaining} of {allocated} free spins left today
              </span>
              {/* Suppressed at zero: DeckNotice already carries the reset time,
                  and two copies read as a system unsure what it is telling you. */}
              {resetIn && remaining > 0 && <> · resets in {resetIn}</>}
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
