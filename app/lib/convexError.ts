/**
 * Convex wraps a thrown `Error` on the client as something like
 * `[Request ID: ...] Server Error\nUncaught Error: CLAIM_NOT_RESOLVED\n    at ...` —
 * useful for a browser console, useless as UI copy. This pulls out just the
 * short code this codebase's mutations actually throw (e.g. "CLAIM_NOT_RESOLVED").
 */
export function friendlyErrorMessage(e: unknown, fallback = "Something went wrong."): string {
  const message = e instanceof Error ? e.message : String(e);
  const match = message.match(/Uncaught Error:\s*([^\n]+)/);
  return match ? match[1].trim() : fallback;
}
