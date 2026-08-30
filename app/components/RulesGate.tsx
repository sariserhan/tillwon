"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ALL_US_JURISDICTIONS, MINIMUM_AGE } from "@/convex/lib/jurisdictions.ts";

/** Today's date as YYYY-MM-DD, the same format `<input type="date">` produces. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The rules-acceptance gate. Spec section 3 requires acceptance before a spin.
 *
 * `onAccept` writes the durable record — a row in `rulesAcceptances` carrying the
 * user, the campaign and the exact rules version agreed to, plus the entrant's
 * self-certified state and birthdate on their user record. It resolves to null on
 * success, or to a message to display; nothing local flips until the server has
 * accepted, so this gate never claims a record that does not exist. Nothing is
 * written to localStorage for the same reason: the server row is the truth, and
 * re-asking on reload is the honest behaviour when it cannot be reached.
 *
 * One submission, three facts. Splitting age, residency and rules into separate
 * steps reads as friction engineering; combining them into a single vague "I agree
 * to everything" hides what is being agreed. Naming all three in one place is the
 * middle that respects the reader. The state and birthdate fields are the same
 * self-certification the checkbox already claimed — this just captures which state
 * and what birthdate, so the backend's eligibility check has something to check.
 * Real verification (photo ID, proof of address) happens only if this entrant
 * later wins.
 */
export function RulesGate({
  onAccept,
}: {
  /** Resolves to null on success, or to the message to show the reader. */
  onAccept: (region: string, birthDate: string) => Promise<string | null>;
}) {
  const [region, setRegion] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const id = useId();
  const regionId = `${id}-region`;
  const birthDateId = `${id}-birthdate`;
  const errorId = `${id}-error`;

  const confirm = async () => {
    if (!region) {
      setError("Choose the state you live in before your first spin.");
      return;
    }
    if (!birthDate) {
      setError("Enter your date of birth before your first spin.");
      return;
    }
    if (!checked) {
      // Names the problem and the recovery, rather than just refusing.
      setError("Tick the box to confirm you are eligible before your first spin.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const message = await onAccept(region, birthDate);
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

      <div className="mt-2.5 flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={regionId} className="text-xs text-caption">
            State you live in
          </label>
          <select
            id={regionId}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-[3px] border border-enamel/35 bg-transparent px-2 py-1.5 text-sm text-enamel"
          >
            <option value="" disabled>
              Choose a state
            </option>
            {ALL_US_JURISDICTIONS.map((code) => (
              <option key={code} value={code} className="text-ink">
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={birthDateId} className="text-xs text-caption">
            Date of birth
          </label>
          <input
            id={birthDateId}
            type="date"
            value={birthDate}
            max={todayIso()}
            onChange={(e) => setBirthDate(e.target.value)}
            className="rounded-[3px] border border-enamel/35 bg-transparent px-2 py-1.5 text-sm text-enamel [color-scheme:dark]"
          />
          <span className="text-[0.7rem] text-caption">
            Used only to confirm you meet the age requirement — never published.
          </span>
        </div>
      </div>

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
