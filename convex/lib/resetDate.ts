/**
 * The campaign day a timestamp belongs to, as "YYYY-MM-DD".
 *
 * A string key rather than a timestamp range, because the balance lookup then
 * becomes an exact index hit instead of a scan, and because "which campaign day
 * is this" is a question with one right answer that should be computed in exactly
 * one place.
 *
 * Reset is anchored to the campaign's timezone, not the visitor's: every entrant
 * must face the same daily window, or the window itself becomes an eligibility
 * difference. The UI converts the next reset into local time for display.
 */
export function resetDateKey(
  now: number,
  timezone: string,
  resetHour: number,
): string {
  const shifted = new Date(now - resetHour * 3_600_000);
  // en-CA formats as YYYY-MM-DD, which sorts correctly as a string.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}
