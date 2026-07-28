import type { RunActivity } from "./types";

type Qty = { qty?: number; units?: string } | number | null | undefined;

interface HaeWorkout {
  id?: string;
  name?: string;
  start?: string;
  end?: string;
  duration?: number;
  distance?: Qty;
  activeEnergyBurned?: Qty;
  totalEnergy?: Qty;
  elevationUp?: Qty;
  elevation?: { ascent?: number; units?: string };
  heartRate?: {
    avg?: Qty;
    max?: Qty;
    min?: Qty;
  };
  avgHeartRate?: Qty;
  maxHeartRate?: Qty;
  heartRateData?: Array<{ Avg?: number; avg?: number; qty?: number }>;
}

function qtyOf(value: Qty): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  return typeof value.qty === "number" ? value.qty : undefined;
}

function unitsOf(value: Qty): string | undefined {
  if (value == null || typeof value === "number") return undefined;
  return value.units;
}

function toMiles(qty: number | undefined, units?: string): number | undefined {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return undefined;
  const u = (units || "mi").toLowerCase();
  if (u === "km" || u === "kilometer" || u === "kilometers") return qty / 1.609344;
  if (u === "m" || u === "meter" || u === "meters") return qty / 1609.344;
  return qty; // assume miles
}

function toFeet(qty: number | undefined, units?: string): number {
  if (qty == null || !Number.isFinite(qty)) return 0;
  const u = (units || "ft").toLowerCase();
  if (u === "m" || u === "meter" || u === "meters") return qty * 3.28084;
  return qty;
}

function parseHaeDate(raw?: string): string | null {
  if (!raw) return null;
  // Examples: "2026-07-28 07:30:00 -0500" or ISO
  const normalized = raw.includes("T")
    ? raw
    : raw.replace(
        /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
        "$1T$2$3:$4",
      );
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(raw.replace(" ", "T"));
    if (Number.isNaN(fallback.getTime())) return null;
    return fallback.toISOString();
  }
  return d.toISOString();
}

function isRunWorkout(name?: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("run") ||
    n.includes("jog") ||
    n.includes("trail") ||
    n === "running"
  );
}

function avgHr(workout: HaeWorkout): number | undefined {
  const nested = qtyOf(workout.heartRate?.avg) ?? qtyOf(workout.avgHeartRate);
  if (nested) return Math.round(nested);
  const series = workout.heartRateData;
  if (series?.length) {
    const vals = series
      .map((p) => p.Avg ?? p.avg ?? p.qty)
      .filter((v): v is number => typeof v === "number");
    if (vals.length) {
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }
  return undefined;
}

function maxHr(workout: HaeWorkout): number | undefined {
  const nested = qtyOf(workout.heartRate?.max) ?? qtyOf(workout.maxHeartRate);
  return nested ? Math.round(nested) : undefined;
}

export function haeWorkoutToRun(workout: HaeWorkout): RunActivity | null {
  if (!isRunWorkout(workout.name)) return null;
  const startDate = parseHaeDate(workout.start);
  if (!startDate) return null;

  const distanceMi = toMiles(qtyOf(workout.distance), unitsOf(workout.distance));
  if (!distanceMi || distanceMi < 0.1) return null;

  const movingTimeSec =
    typeof workout.duration === "number" && workout.duration > 0
      ? Math.round(workout.duration)
      : (() => {
          const end = parseHaeDate(workout.end);
          if (!end) return 0;
          return Math.max(
            0,
            Math.round((new Date(end).getTime() - new Date(startDate).getTime()) / 1000),
          );
        })();
  if (movingTimeSec <= 0) return null;

  const paceSecPerMi = Math.round(movingTimeSec / distanceMi);
  const calories =
    qtyOf(workout.activeEnergyBurned) ?? qtyOf(workout.totalEnergy);
  const elevationFt =
    toFeet(qtyOf(workout.elevationUp), unitsOf(workout.elevationUp)) ||
    toFeet(workout.elevation?.ascent, workout.elevation?.units);

  const idBase = workout.id || `${startDate}-${distanceMi.toFixed(2)}`;
  return {
    id: `hae-${idBase}`,
    source: "manual",
    name: workout.name || "Outdoor Run",
    startDate,
    distanceMi: Number(distanceMi.toFixed(2)),
    movingTimeSec,
    elapsedTimeSec: movingTimeSec,
    paceSecPerMi,
    elevationFt: Math.round(elevationFt),
    averageHeartrate: avgHr(workout),
    maxHeartrate: maxHr(workout),
    calories: calories ? Math.round(calories) : undefined,
    raw: workout as unknown as Record<string, unknown>,
  };
}

export function extractHaeWorkouts(payload: unknown): HaeWorkout[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;

  // Common wrappers: { data: { workouts: [...] } } or { workouts: [...] } or [...]
  if (Array.isArray(root)) return root as HaeWorkout[];
  if (Array.isArray(root.workouts)) return root.workouts as HaeWorkout[];
  if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    if (Array.isArray(data.workouts)) return data.workouts as HaeWorkout[];
  }
  // Some exports are a bare workout object
  if (root.start && root.name) return [root as HaeWorkout];
  return [];
}

export function convertHaePayload(payload: unknown): RunActivity[] {
  return extractHaeWorkouts(payload)
    .map(haeWorkoutToRun)
    .filter((r): r is RunActivity => Boolean(r));
}
