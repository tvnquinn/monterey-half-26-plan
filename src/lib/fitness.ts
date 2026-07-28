/**
 * Half-marathon fitness estimation.
 *
 * The old model was `fastestRunInLast28Days * 0.78 * 13.1` — a flat 22%
 * easy→race conversion keyed off a single run, so one downhill Tuesday moved
 * the race projection by minutes. This replaces it with two signals that
 * actually track fitness, anchored on a real result:
 *
 *   1. Efficiency factor (EF) trend — speed per heartbeat on aerobic runs.
 *      Improving EF at the same HR is the cleanest fitness signal available
 *      from a watch. Fit log-linear over time; the slope is fractional
 *      improvement per week.
 *   2. Riegel extrapolation from genuine hard efforts, when any exist.
 *
 * Both are applied as adjustments to the prior half result rather than used
 * standalone, because a known race is a far better anchor than any inference
 * off easy running.
 */

import { daysBetweenKeys, monthOf, runDayKey } from "./dates";
import type { RunActivity, TrainingPlan } from "./types";

/** Riegel's endurance exponent. 1.06 is the standard road-running value. */
const RIEGEL_EXP = 1.06;

/** EF gains partly reflect weather/terrain/freshness, not just fitness. */
const EF_DAMPING = 0.7;

export interface EfPoint {
  dateKey: string;
  weeksAgo: number;
  /** Miles per hour per bpm. Higher = more economical. */
  ef: number;
  paceSecPerMi: number;
  hr: number;
  distanceMi: number;
}

export interface EfTrend {
  n: number;
  spanDays: number;
  /** Fractional EF change per week (0.01 = 1%/wk faster at the same HR). */
  slopePerWeek: number;
  /** Total fractional change across the observed window, clamped. */
  deltaPct: number;
  r2: number;
}

export type EstimateMethod = "prior_only" | "ef_trend" | "hard_effort" | "blended";

export interface HalfEstimate {
  sec: number | null;
  method: EstimateMethod;
  confidence: "low" | "medium" | "high";
  /** Human-readable inputs, for the UI to show its work. */
  basis: string[];
  efTrend: EfTrend | null;
  hardEffortSec: number | null;
}

export interface EstimateInput {
  runs: RunActivity[];
  plan: TrainingPlan;
  priorHalfSec: number;
  asOf: Date;
  /** Average weekly mileage over the last 4 weeks. */
  weeklyMi: number;
  tz?: string;
}

function mean(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function riegelSec(
  knownMi: number,
  knownSec: number,
  targetMi: number,
): number {
  return knownSec * Math.pow(targetMi / knownMi, RIEGEL_EXP);
}

/**
 * Aerobic runs only. EF is comparable within the easy/steady domain but rises
 * with intensity up to threshold, so quality sessions would masquerade as
 * fitness gains if we let them in.
 */
export function buildEfPoints(
  runs: RunActivity[],
  plan: TrainingPlan,
  asOf: Date,
  tz?: string,
): EfPoint[] {
  const cap = plan.paceGuidance.hrEasyCap;
  const z2 = plan.paceGuidance.hrZones?.z2;
  const hrFloor = z2 ? z2.min - 6 : cap - 15;
  const hrCeil = z2 ? z2.max + 4 : cap + 12;
  const today = runDayKey(asOf.toISOString(), tz);

  return runs
    .filter((r) => {
      const hr = r.averageHeartrate;
      if (!hr || hr < hrFloor || hr > hrCeil) return false;
      if (r.distanceMi < 2) return false;
      if (r.paceSecPerMi <= 0) return false;
      return true;
    })
    .map((r) => {
      const dateKey = runDayKey(r.startDate, tz);
      const hr = r.averageHeartrate as number;
      return {
        dateKey,
        weeksAgo: daysBetweenKeys(dateKey, today) / 7,
        ef: 3600 / r.paceSecPerMi / hr,
        paceSecPerMi: r.paceSecPerMi,
        hr,
        distanceMi: r.distanceMi,
      };
    })
    .filter((p) => p.weeksAgo >= 0 && p.weeksAgo <= 16)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * Log-linear fit of EF against time. Log space makes the slope a *fractional*
 * change per week, which is what we want to apply to a race time.
 */
export function fitEfTrend(points: EfPoint[]): EfTrend | null {
  if (points.length < 6) return null;
  const spanDays = daysBetweenKeys(
    points[0].dateKey,
    points[points.length - 1].dateKey,
  );
  if (spanDays < 21) return null;

  // x = weeks before today (negated so positive slope = improving over time)
  const xs = points.map((p) => -p.weeksAgo);
  const ys = points.map((p) => Math.log(p.ef));
  const mx = mean(xs);
  const my = mean(ys);

  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const rawSlope = num / den;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    const fit = my + rawSlope * (xs[i] - mx);
    ssRes += (ys[i] - fit) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot > 0 ? clamp(1 - ssRes / ssTot, 0, 1) : 0;

  // No one gains more than ~1.5%/wk of aerobic efficiency for long.
  const slopePerWeek = clamp(rawSlope, -0.015, 0.015);
  const weeks = spanDays / 7;
  const deltaPct = clamp(Math.exp(slopePerWeek * weeks) - 1, -0.08, 0.1);

  return { n: points.length, spanDays, slopePerWeek, deltaPct, r2 };
}

/** Median pace across recent runs — the reference for "was this actually fast?". */
function medianPace(runs: RunActivity[]): number | null {
  const v = runs.filter((r) => r.paceSecPerMi > 0).map((r) => r.paceSecPerMi);
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Best Riegel-projected half from a genuine hard effort.
 *
 * High HR alone is not enough: a hot or tired easy run drifts into Z3 at easy
 * pace, and extrapolating that with Riegel produced a 2:54 projection off a
 * 12:25/mi jog. A hard effort has to be meaningfully *faster* than this
 * athlete's normal running, not merely higher-HR.
 */
const HARD_EFFORT_PACE_RATIO = 0.92;

function bestHardEffortSec(
  runs: RunActivity[],
  plan: TrainingPlan,
  asOf: Date,
  tz?: string,
): number | null {
  const z3 = plan.paceGuidance.hrZones?.z3;
  const hardHr = z3 ? z3.min : plan.paceGuidance.hrEasyCap + 12;
  const today = runDayKey(asOf.toISOString(), tz);

  const med = medianPace(runs);
  if (med == null) return null;
  const maxPace = med * HARD_EFFORT_PACE_RATIO;

  const candidates = runs
    .filter((r) => {
      const days = daysBetweenKeys(runDayKey(r.startDate, tz), today);
      if (days < 0 || days > 70) return false;
      if (r.distanceMi < 3 || r.movingTimeSec <= 0) return false;
      if (r.paceSecPerMi > maxPace) return false;
      const hr = r.averageHeartrate;
      // A race or tempo without HR still counts if the pace is clearly hard.
      return hr ? hr >= hardHr : r.paceSecPerMi <= med * 0.85;
    })
    .map((r) => riegelSec(r.distanceMi, r.movingTimeSec, 13.1));

  if (!candidates.length) return null;
  return Math.round(Math.min(...candidates));
}

/**
 * Conditions adjustment, in seconds of half-marathon time.
 * Positive = race day should be faster than training suggests.
 */
function conditionsCreditSec(plan: TrainingPlan, asOf: Date, tz?: string): number {
  let credit = 0;

  // Summer training understates cool-race fitness (~2s/mi per °F over 60).
  const month = monthOf(asOf, tz);
  if (month >= 7 && month <= 9) credit += 18 * 13.1;
  else if (month === 10) credit += 8 * 13.1;

  // Flat coastal course vs hilly training.
  const trainElev = plan.paceGuidance.trainingElevFtPerMi ?? 40;
  const raceElev = plan.race.elevationFtPerMi ?? 0;
  credit += Math.max(0, trainElev - raceElev) * 0.25 * 13.1;

  return Math.round(credit);
}

/** Durability: a half is only as good as your longest run supports. */
function durabilityFactor(longestMi: number): number {
  if (longestMi >= 11) return 0.99;
  if (longestMi >= 9) return 1.0;
  if (longestMi >= 7) return 1.02;
  if (longestMi >= 5) return 1.045;
  return 1.07;
}

function volumeFactor(weeklyMi: number): number {
  if (weeklyMi >= 26) return 0.985;
  if (weeklyMi >= 20) return 1.0;
  if (weeklyMi >= 14) return 1.015;
  return 1.04;
}

/**
 * Fitness built over a block doesn't evaporate during a planned taper.
 *
 * Keying volume and durability off the trailing 28 days made the projection get
 * *worse* through race week — the backtest showed race day landing 4 min slower
 * than two weeks out, purely because taper mileage is lower by design. Both now
 * look back far enough to see the peak of the block.
 */
function builtVolumeMi(runs: RunActivity[], today: string, recentMi: number, tz?: string): number {
  let peak4wk = 0;
  for (let offset = 0; offset <= 112; offset += 7) {
    const total = runs
      .filter((r) => {
        const age = daysBetweenKeys(runDayKey(r.startDate, tz), today);
        return age >= offset && age < offset + 28;
      })
      .reduce((s, r) => s + r.distanceMi, 0);
    peak4wk = Math.max(peak4wk, total / 4);
  }
  // Taper costs a little sharpness, not the whole block.
  return Math.max(recentMi, peak4wk * 0.85);
}

function builtLongestMi(runs: RunActivity[], today: string, tz?: string): number {
  return runs
    .filter((r) => {
      const age = daysBetweenKeys(runDayKey(r.startDate, tz), today);
      return age >= 0 && age <= 56;
    })
    .reduce((m, r) => Math.max(m, r.distanceMi), 0);
}

export function estimateHalf(input: EstimateInput): HalfEstimate {
  const { runs, plan, priorHalfSec, asOf, weeklyMi, tz } = input;
  const basis: string[] = [];
  const today = runDayKey(asOf.toISOString(), tz);

  // Look back past the taper so race week doesn't read as detraining.
  const longestMi = builtLongestMi(runs, today, tz);
  const effectiveWeeklyMi = builtVolumeMi(runs, today, weeklyMi, tz);

  const efPoints = buildEfPoints(runs, plan, asOf, tz);
  const efTrend = fitEfTrend(efPoints);
  const hardEffortSec = bestHardEffortSec(runs, plan, asOf, tz);

  if (!runs.length) {
    return {
      sec: priorHalfSec,
      method: "prior_only",
      confidence: "low",
      basis: ["No runs logged — showing prior half."],
      efTrend: null,
      hardEffortSec: null,
    };
  }

  // Start from the known result and move it with observed fitness change.
  let efBased = priorHalfSec;
  if (efTrend) {
    efBased = priorHalfSec * (1 - efTrend.deltaPct * EF_DAMPING);
    const dir = efTrend.deltaPct >= 0 ? "faster" : "slower";
    basis.push(
      `EF ${(efTrend.deltaPct * 100).toFixed(1)}% ${dir} at the same HR over ${efTrend.spanDays}d (${efTrend.n} runs, R²=${efTrend.r2.toFixed(2)}).`,
    );
  } else {
    basis.push(
      `Not enough aerobic HR runs for a fitness trend yet (${efPoints.length}/6, need 3+ weeks of span).`,
    );
  }

  efBased *= durabilityFactor(longestMi);
  efBased *= volumeFactor(effectiveWeeklyMi);
  basis.push(
    `Longest ${longestMi.toFixed(1)} mi · ~${Math.round(effectiveWeeklyMi)} mi/wk of built volume.`,
  );

  let sec: number;
  let method: EstimateMethod;

  if (hardEffortSec != null && efTrend) {
    // Both signals: weight the hard effort, but don't let one workout rule.
    sec = hardEffortSec * 0.35 + efBased * 0.65;
    method = "blended";
    basis.push(
      `Hard effort projects ${Math.round(hardEffortSec / 60)} min (Riegel), blended 35%.`,
    );
  } else if (hardEffortSec != null) {
    sec = hardEffortSec * 0.3 + efBased * 0.7;
    method = "hard_effort";
    basis.push(`Hard effort projects ${Math.round(hardEffortSec / 60)} min (Riegel).`);
  } else if (efTrend) {
    sec = efBased;
    method = "ef_trend";
  } else {
    sec = efBased;
    method = "prior_only";
  }

  const credit = conditionsCreditSec(plan, asOf, tz);
  if (credit > 0) {
    sec -= credit;
    basis.push(`Cool flat race vs summer hills: −${Math.round(credit / 60)} min.`);
  }

  let confidence: HalfEstimate["confidence"] = "low";
  if (efTrend && efTrend.n >= 8 && longestMi >= 8) confidence = "medium";
  if (
    efTrend &&
    efTrend.n >= 14 &&
    efTrend.r2 >= 0.25 &&
    longestMi >= 10 &&
    effectiveWeeklyMi >= 20 &&
    hardEffortSec != null
  ) {
    confidence = "high";
  }

  return {
    sec: Math.round(sec),
    method,
    confidence,
    basis,
    efTrend,
    hardEffortSec,
  };
}
