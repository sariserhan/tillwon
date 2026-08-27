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
  // Read the local wall-clock date/hour directly, on the *unshifted* instant.
  // Subtracting resetHour as absolute milliseconds and re-reading the clock
  // is wrong across a DST fall-back: one wall-clock hour repeats, so an
  // absolute-hour shift doesn't equal a wall-clock-hour shift there.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));

  // Anchor the extracted calendar date to UTC noon so the day-decrement
  // below is pure calendar arithmetic, decoupled from `timezone` — UTC has
  // no DST, so this can't reintroduce the same class of bug.
  const anchor = Date.UTC(year, month - 1, day, 12);
  const shifted = hour < resetHour ? anchor - 24 * 3_600_000 : anchor;

  // en-CA formats as YYYY-MM-DD, which sorts correctly as a string.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}
