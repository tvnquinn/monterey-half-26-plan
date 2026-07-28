export function paceToString(secPerMi: number): string {
  if (!Number.isFinite(secPerMi) || secPerMi <= 0) return "—";
  const total = Math.round(secPerMi);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function weekdayShort(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function weekdayLong(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

export function stringToPace(pace: string): number {
  const [m, s] = pace.split(":").map(Number);
  return m * 60 + (s || 0);
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Half marathon clock as h:mm (drops seconds). */
export function formatHalfShort(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (m === 60) return `${h + 1}:00`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

export function mpsToPaceSecPerMi(mps: number): number {
  if (!mps || mps <= 0) return 0;
  return 1609.344 / mps;
}

export function estimateHalfFromRecent(
  bestRecentPaceSecPerMi: number | null,
  weeklyMi: number,
  longestRecentMi: number,
): number | null {
  if (!bestRecentPaceSecPerMi) return null;
  // Conservative: easy/training paces are slower than race. Use a mild conversion.
  let racePace = bestRecentPaceSecPerMi * 0.78;
  if (weeklyMi < 15) racePace *= 1.06;
  if (weeklyMi >= 22) racePace *= 0.98;
  if (longestRecentMi < 8) racePace *= 1.04;
  if (longestRecentMi >= 10) racePace *= 0.99;
  return Math.round(racePace * 13.1);
}
