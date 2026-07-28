import { dayKeyOf, daysBetweenKeys, runDayKey } from "./dates";
import { estimateHalf } from "./fitness";
import type {
  GoalOdds,
  GoalKey,
  PredictionSummary,
  RunActivity,
  TrainingPlan,
} from "./types";

/** Goal ladder. A- sits between the stretch goal and the design target. */
export const GOAL_LADDER: { label: GoalKey; timeLabel: string; timeSec: number }[] = [
  { label: "A", timeLabel: "2:00", timeSec: 2 * 3600 },
  { label: "A-", timeLabel: "2:05", timeSec: 2 * 3600 + 5 * 60 },
  { label: "B", timeLabel: "2:10", timeSec: 2 * 3600 + 10 * 60 },
  { label: "C", timeLabel: "2:30", timeSec: 2 * 3600 + 30 * 60 },
];

export function parseTimeToSec(raw: string): number {
  const parts = raw.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(raw) || 0;
}

function formatHalfClock(sec: number): string {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export interface TrainingSignal {
  /** Logged vs target across finished weeks. 1.0 = executed the plan. */
  adherence: number;
  avgWeeklyMi4: number;
  longestMi28: number;
  weeksRemaining: number;
}

/**
 * Race-day projection.
 *
 * The old version handed out ~28s of half-time per remaining calendar week —
 * about 7 free minutes at 15 weeks out, earned by nothing. Credit is now tied
 * to work actually logged: stop training and the projection decays back toward
 * current fitness.
 */
export function raceDayProjectionSec(args: {
  estimatedHalfSec: number | null;
  priorHalfSec: number;
  confidence: "low" | "medium" | "high";
  signal: TrainingSignal;
}): { projectedSec: number; creditSec: number } {
  const { estimatedHalfSec, priorHalfSec, confidence, signal } = args;
  const fitness = estimatedHalfSec ?? priorHalfSec;

  // Lean on the known race result until the fitness estimate earns trust.
  const fitnessWeight =
    confidence === "high" ? 0.7 : confidence === "medium" ? 0.55 : 0.4;
  const blended = fitness * fitnessWeight + priorHalfSec * (1 - fitnessWeight);

  // Remaining improvement, scaled by how well the plan is actually being run.
  const adherence = clamp(signal.adherence, 0, 1.1);
  const perWeekSec = 20;
  let credit = signal.weeksRemaining * perWeekSec * adherence;

  // Durability and volume are earned, not scheduled.
  if (signal.longestMi28 >= 10) credit += 45;
  else if (signal.longestMi28 >= 8) credit += 20;

  if (signal.avgWeeklyMi4 >= 24) credit += 40;
  else if (signal.avgWeeklyMi4 >= 18) credit += 20;
  else if (signal.avgWeeklyMi4 > 0 && signal.avgWeeklyMi4 < 12) credit -= 45;

  // 15 weeks of 3–4 day training doesn't buy unlimited time.
  credit = clamp(credit, -120, 480);

  return { projectedSec: Math.round(blended - credit), creditSec: Math.round(credit) };
}

/**
 * Spread of plausible race-day outcomes, in minutes.
 * Wide when the race is far away or the data is thin — a single fixed spread
 * was what produced "94% for C" at 15 weeks out.
 */
export function projectionSigmaMin(
  daysToRace: number,
  confidence: "low" | "medium" | "high",
): number {
  const base = confidence === "high" ? 3.2 : confidence === "medium" ? 4.3 : 5.5;
  return base + Math.max(0, daysToRace) / 30;
}

/**
 * How much the downside tail shrinks because the athlete has already completed
 * the distance.
 *
 * The dominant failure mode in half-marathon prediction is not "slightly slower
 * than projected" — it is blowing up: going out too hard, walking from mile 10,
 * losing fifteen minutes. That risk is far lower for someone who has covered
 * the distance and paced it without collapsing. Quinn has done it twice, and
 * both times heart rate drifted under 5% from first quarter to last.
 *
 * Pacing judgement does not expire the way fitness does, so this decays slowly:
 * full credit for a year, gone after three.
 */
export function raceExperienceFactor(args: {
  runs: RunActivity[];
  raceDistanceMi: number;
  asOf: Date;
  tz?: string;
}): number {
  const today = dayKeyOf(args.asOf, args.tz);
  const threshold = args.raceDistanceMi * 0.9;

  let best = 0;
  for (const r of args.runs) {
    if (r.distanceMi < threshold) continue;
    const ageDays = daysBetweenKeys(runDayKey(r.startDate, args.tz), today);
    if (ageDays < 0) continue;
    const weight =
      ageDays <= 365 ? 1 : ageDays >= 1095 ? 0 : 1 - (ageDays - 365) / 730;
    best = Math.max(best, weight);
  }
  // No experience keeps the full 15% downside inflation; a proven finisher
  // keeps only ~3%.
  return 1.15 - best * 0.12;
}

/**
 * Probability of finishing at or under `goalSec`.
 *
 * Mildly skewed: beating a projection is harder than missing it, so the upside
 * tail is tighter than the downside. Keeps C off 99% without inflating A.
 *
 * `downsideMult` lets demonstrated race experience collapse the blow-up tail
 * without making the athlete any faster — it raises the soft goals, barely
 * touches the stretch ones, which is exactly the right shape.
 */
export function goalPct(
  projectedSec: number,
  goalSec: number,
  sigmaMin: number,
  downsideMult = 1.15,
): number {
  const gapMin = (projectedSec - goalSec) / 60;
  const sigmaEff = gapMin > 0 ? sigmaMin * 0.85 : sigmaMin * downsideMult;
  const logistic = 100 / (1 + Math.exp(gapMin / sigmaEff));
  return clamp(Math.round(logistic), 2, 97);
}

export function buildPredictionSummary(args: {
  plan: TrainingPlan;
  runs: RunActivity[];
  estimatedHalfSec: number | null;
  confidence: "low" | "medium" | "high";
  signal: TrainingSignal;
  daysToRace: number;
  asOf: Date;
  tz?: string;
}): PredictionSummary {
  const { plan, runs, estimatedHalfSec, confidence, signal, daysToRace, asOf, tz } =
    args;
  const priorHalfSec = parseTimeToSec(plan.athlete.priorHalf || "2:15:56");

  const { projectedSec, creditSec } = raceDayProjectionSec({
    estimatedHalfSec,
    priorHalfSec,
    confidence,
    signal,
  });

  const sigmaMin = projectionSigmaMin(daysToRace, confidence);
  const downsideMult = raceExperienceFactor({
    runs,
    raceDistanceMi: plan.race.distanceMi,
    asOf,
    tz,
  });

  const goals: GoalOdds[] = GOAL_LADDER.map((g) => ({
    ...g,
    pct: goalPct(projectedSec, g.timeSec, sigmaMin, downsideMult),
  }));

  // Monotonic by construction, but guard against rounding inversions.
  for (let i = 1; i < goals.length; i++) {
    goals[i].pct = Math.max(goals[i].pct, goals[i - 1].pct);
  }

  // Trend: re-run the estimate as of 28 days ago, using only what was known then.
  const cutoff = dayKeyOf(new Date(asOf.getTime() - 28 * 86_400_000), tz);
  const priorRuns = runs.filter((r) => runDayKey(r.startDate, tz) <= cutoff);
  let trendMin: number | null = null;
  if (priorRuns.length >= 4 && estimatedHalfSec != null) {
    const then = estimateHalf({
      runs: priorRuns,
      plan,
      priorHalfSec,
      asOf: new Date(asOf.getTime() - 28 * 86_400_000),
      weeklyMi: signal.avgWeeklyMi4,
      tz,
    });
    if (then.sec != null) {
      trendMin = Math.round((estimatedHalfSec - then.sec) / 60);
    }
  }

  const deltaMinVsPrior =
    estimatedHalfSec != null
      ? Math.round((estimatedHalfSec - priorHalfSec) / 60)
      : null;

  return {
    goals,
    estimatedHalfSec,
    projectedSec,
    creditSec,
    sigmaMin: Number(sigmaMin.toFixed(1)),
    confidence,
    trendMin,
    trendWindowDays: 28,
    deltaMinVsPrior,
    priorHalfSec,
    priorHalfLabel: formatHalfClock(priorHalfSec),
  };
}

export function buildMileageNarrative(args: {
  weeklyMileage: {
    weekId: number;
    start: string;
    loggedMi: number;
    targetMi: number;
  }[];
  currentWeekId: number | null;
  asOf: Date;
  tz?: string;
}): { status: "ahead" | "on_track" | "behind" | "rest"; headline: string; detail: string } {
  const today = dayKeyOf(args.asOf, args.tz);
  const past = args.weeklyMileage.filter((w) => {
    if (args.currentWeekId != null) return w.weekId < args.currentWeekId;
    return w.start < today;
  });
  const scored = past.filter((w) => w.targetMi > 0);
  if (!scored.length) {
    const cur = args.weeklyMileage.find((w) => w.weekId === args.currentWeekId);
    if (cur && cur.targetMi === 0) {
      return {
        status: "rest",
        headline: "Rest week",
        detail: "Zero miles planned — stay healthy for the rebuild.",
      };
    }
    return {
      status: "on_track",
      headline: "Just getting started",
      detail: "Log this week’s runs to build the mileage picture.",
    };
  }

  const ratios = scored.map((w) => w.loggedMi / w.targetMi);
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const behindCount = ratios.filter((r) => r < 0.85).length;
  const aheadCount = ratios.filter((r) => r >= 1).length;

  if (avg >= 1.05 || (aheadCount >= behindCount + 1 && avg >= 0.95)) {
    return {
      status: "ahead",
      headline: "Ahead of plan",
      detail: `${aheadCount}/${scored.length} finished weeks at or above target. Keep easy days easy.`,
    };
  }
  if (avg >= 0.85 && behindCount <= 1) {
    return {
      status: "on_track",
      headline: "Making progress",
      detail: `Averaging ${Math.round(avg * 100)}% of weekly targets. Consistency > hero miles.`,
    };
  }
  return {
    status: "behind",
    headline: "Falling behind",
    detail: `${behindCount}/${scored.length} weeks under 85% of target. Don’t double up — nudge the next easy run back on.`,
  };
}

/** Adherence + load signals that feed the projection. */
export function buildTrainingSignal(args: {
  weeklyMileage: { weekId: number; start: string; loggedMi: number; targetMi: number }[];
  currentWeekId: number | null;
  runs: RunActivity[];
  daysToRace: number;
  asOf: Date;
  tz?: string;
}): TrainingSignal {
  const today = dayKeyOf(args.asOf, args.tz);
  const finished = args.weeklyMileage.filter(
    (w) =>
      w.targetMi > 0 &&
      (args.currentWeekId != null ? w.weekId < args.currentWeekId : w.start < today),
  );
  const adherence = finished.length
    ? finished.reduce((s, w) => s + Math.min(1.15, w.loggedMi / w.targetMi), 0) /
      finished.length
    : 1;

  const last28 = args.runs.filter((r) => {
    const d = daysBetweenKeys(runDayKey(r.startDate, args.tz), today);
    return d >= 0 && d <= 28;
  });
  const avgWeeklyMi4 = last28.reduce((s, r) => s + r.distanceMi, 0) / 4;
  const longestMi28 = last28.reduce((m, r) => Math.max(m, r.distanceMi), 0);

  return {
    adherence,
    avgWeeklyMi4,
    longestMi28,
    weeksRemaining: Math.max(0, args.daysToRace / 7),
  };
}
