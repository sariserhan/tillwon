"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { MINIMUM_AGE } from "@/convex/lib/jurisdictions.ts";

/**
 * The rules-acceptance gate. Spec section 3 requires acceptance before a spin.
 *
 * `onAccept` writes the durable record — a row in `rulesAcceptances` carrying the
 * user, the campaign and the exact rules version agreed to. It resolves to null on
 * success, or to a message to display; nothing local flips until the server has
 * accepted, so this gate never claims a record that does not exist. Nothing is
 * written to localStorage for the same reason: the server row is the truth, and
 * re-asking on reload is the honest behaviour when it cannot be reached.
 *
 * One checkbox, three facts. Splitting age, residency and rules into separate
 * boxes reads as friction engineering; combining them into a single vague "I agree
 * to everything" hides what is being agreed. Naming all three in one sentence is
 * the middle that respects the reader.
 */
export function RulesGate({
  onAccept,
}: {
  /** Resolves to null on success, or to the message to show the reader. */
  onAccept: () => Promise<string | null>;
}) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  const confirm = async () => {
    if (!checked) {
      // Names the problem and the recovery, rather than just refusing.
      setError("Tick the box to confirm you are eligible before your first spin.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const message = await onAccept();
    // On success this component is on its way out, so only failure needs to
    // restore the control.
    if (message !== null) {
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="brushed-dark max-w-[32rem] rounded-[3px] px-4 py-4 shadow-[0_2px_6px_rgb(0_0_0/0.5)]">
      <p className="font-display text-xs uppercase tracking-[0.14em] text-enamel">
        Before your first spin
      </p>

      <div className="mt-2.5 flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            if (e.target.checked) setError(null);
          }}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error !== null}
          className="mt-0.5 h-5 w-5 shrink-0 accent-tally"
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-enamel">
          I am {MINIMUM_AGE} or older, I live in an eligible US state, and I have
          read and accept the{" "}
          <Link
            href="/rules"
            className="underline decoration-enamel/40 hover:decoration-enamel"
          >
            Official Rules
          </Link>
          .
        </label>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-2.5 text-sm text-enamel">
          {error}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          aria-busy={submitting}
          className="btn-primary"
        >
          {submitting ? "Recording…" : "Start spinning"}
        </button>
        <span className="text-xs text-caption">
          Free. Nothing to pay, ever.
        </span>
      </div>
    </div>
  );
}
