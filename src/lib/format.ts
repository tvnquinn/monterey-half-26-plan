/** Round pace to nearest N seconds to avoid false precision. */
export function roundPaceSec(secPerMi: number, nearest = 10): number {
  if (!Number.isFinite(secPerMi) || secPerMi <= 0) return 0;
  return Math.round(secPerMi / nearest) * nearest;
}

export function paceToString(secPerMi: number, roundTo = 0): string {
  if (!Number.isFinite(secPerMi) || secPerMi <= 0) return "—";
  const total = roundTo > 0 ? roundPaceSec(secPerMi, roundTo) : Math.round(secPerMi);
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

/** Display date as M/D or M/D/YY from ISO date/datetime. */
export function formatShortDate(iso: string, withYear = false): string {
  const key = iso.slice(0, 10);
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (withYear) return `${month}/${day}/${Number(m[1]) % 100}`;
  return `${month}/${day}`;
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
  opts?: {
    /** Month 1–12 of as-of date — summer heat slows training paces. */
    month?: number;
    /** Typical training elev ft/mi; race course elev for credit. */
    trainingElevFtPerMi?: number;
    raceElevFtPerMi?: number;
  },
): number | null {
  if (!bestRecentPaceSecPerMi) return null;
  // Conservative: easy/training paces are slower than race. Use a mild conversion.
  let racePace = bestRecentPaceSecPerMi * 0.78;
  if (weeklyMi < 15) racePace *= 1.06;
  if (weeklyMi >= 22) racePace *= 0.98;
  if (longestRecentMi < 8) racePace *= 1.04;
  if (longestRecentMi >= 10) racePace *= 0.99;

  // Crude heat: summer training (Jul–Sep) understates cool-race fitness (~+2s/mi per °F over 60 ≈ ~15–25s)
  const month = opts?.month;
  if (month != null && month >= 7 && month <= 9) {
    racePace -= 18; // credit cooler November race vs summer heat
  } else if (month === 10) {
    racePace -= 8;
  }

  // Flat race vs hilly training: ~0.25s per ft/mi difference
  const trainElev = opts?.trainingElevFtPerMi ?? 40;
  const raceElev = opts?.raceElevFtPerMi ?? 0;
  const elevDelta = Math.max(0, trainElev - raceElev);
  racePace -= elevDelta * 0.25;

  return Math.round(racePace * 13.1);
}
