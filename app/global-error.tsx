"use client";

/**
 * Root error boundary — replaces the whole document, so it must render its own
 * <html> and <body> and cannot rely on the root layout's fonts or providers.
 *
 * That is why this is styled inline rather than with utility classes: if the
 * failure is in the layout itself, the stylesheet may not have loaded, and a
 * fallback that depends on the thing that broke is not a fallback. The colours are
 * the world's own, hardcoded on purpose.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          backgroundColor: "#062a2d",
          color: "#e8e2d4",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "44ch", textAlign: "center" }}>
          <p
            style={{
              display: "inline-block",
              margin: 0,
              padding: "0.4rem 0.75rem",
              borderRadius: 3,
              backgroundColor: "#40484e",
              fontSize: "0.75rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Technical fault
          </p>

          <h1
            style={{
              margin: "1.5rem 0 0",
              fontSize: "clamp(1.5rem, 5vw, 2.1rem)",
              lineHeight: 1.05,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
            }}
          >
            TillWon could not start
          </h1>
          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "1rem",
              lineHeight: 1.6,
              color: "#a8bfbc",
            }}
          >
            A fault on our side. Your spins and any claim in progress are unaffected
            — those are recorded on our servers and cannot be changed by a page
            failing to load.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              padding: "0.75rem 1.75rem",
              border: 0,
              borderRadius: 3,
              /* 1.25rem/700 is the contrast floor for cream on tally red — the
                 same rule .btn-primary enforces, restated because this page
                 cannot use the stylesheet. */
              fontSize: "1.25rem",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "#e8e2d4",
              backgroundColor: "#d6301f",
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#a8bfbc" }}>
              Reference for support: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
