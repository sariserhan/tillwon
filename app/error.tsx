"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Without this, an unhandled render error falls through to Next's default page,
 * which looks nothing like the product — the same gap the 404 had. A page that
 * abruptly stops looking like the site is what a visitor already suspicious of a
 * free prize draw reads as confirmation.
 *
 * "Technical fault" rather than "something went wrong": the important thing to
 * communicate is that the draw itself is unaffected, because the alternative
 * reading is that their spins or a pending claim have been lost.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console for now; this is where Sentry goes at checkpoint 14.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="studio-light flex min-h-dvh flex-col items-center justify-center px-4 py-16 sm:px-6">
      <div className="max-w-[48ch] text-center">
        <div className="brushed-dark mx-auto inline-flex items-center gap-2.5 rounded-[3px] px-3 py-2">
          <span className="h-3.5 w-3.5 rounded-full bg-alu-600 shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]" />
          <span className="font-display text-xs uppercase tracking-[0.14em] text-enamel">
            Technical fault
          </span>
        </div>

        <h1 className="font-display mt-6 text-[clamp(1.5rem,4.4vw,2.2rem)] uppercase leading-[1.02] text-enamel">
          This page could not load
        </h1>
        <p className="mt-3 text-base leading-relaxed text-caption">
          A fault on our side, not on yours. Your spins are unaffected, and nothing
          about the draw has changed — the result of every spin already taken is
          recorded and cannot be altered by a page failing to render.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link
            href="/"
            className="text-sm text-caption underline decoration-caption/40 hover:text-enamel"
          >
            Back to the draw
          </Link>
          <Link
            href="/legal/contact"
            className="text-sm text-caption underline decoration-caption/40 hover:text-enamel"
          >
            Contact support
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-caption">
            Reference for support: <span className="text-enamel">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  );
}
