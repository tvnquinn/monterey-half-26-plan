/**
 * Calendar-day helpers pinned to the athlete's timezone.
 *
 * Day math used to run through `toISOString().slice(0, 10)`, which is UTC.
 * Vercel's servers are UTC, so a 6pm Pacific run landed on the next calendar
 * day — training weeks rolled over on Sunday evening and evening runs matched
 * the wrong session. Everything date-shaped goes through here now.
 */

export const DEFAULT_TZ = "America/Los_Angeles";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = formatters.get(tz);
  if (!fmt) {
    // en-CA renders YYYY-MM-DD, which compares and sorts lexically.
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(tz, fmt);
  }
  return fmt;
}

/** Calendar day (YYYY-MM-DD) of an instant, in the athlete's timezone. */
export function dayKeyOf(d: Date, tz: string = DEFAULT_TZ): string {
  return formatterFor(tz).format(d);
}

/**
 * Calendar day of a stored timestamp. Date-only strings pass through; full
 * timestamps resolve in the athlete's timezone, so an evening run counts on
 * the day it was actually run.
 */
export function runDayKey(iso: string, tz: string = DEFAULT_TZ): string {
  if (!iso.includes("T")) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return dayKeyOf(d, tz);
}

/** Midday UTC anchor for a day key — immune to DST when doing day arithmetic. */
export function dayAnchor(key: string): Date {
  return new Date(`${key.slice(0, 10)}T12:00:00Z`);
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round(
    (dayAnchor(to).getTime() - dayAnchor(from).getTime()) / 86_400_000,
  );
}

/** Day key `n` days from `key`. `n` may be negative. */
export function shiftDayKey(key: string, n: number): string {
  const d = dayAnchor(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar month (1–12) of an instant, in the athlete's timezone. */
export function monthOf(d: Date, tz: string = DEFAULT_TZ): number {
  return Number(dayKeyOf(d, tz).slice(5, 7));
}

/** Weekday abbreviation for a day key, timezone-independent. */
export function weekdayOfKey(key: string): string {
  return dayAnchor(key).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}
