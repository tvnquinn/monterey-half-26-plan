import { differenceInCalendarDays, parseISO } from "date-fns";
import { estimateHalfFromRecent } from "./format";
import type { PaceGuidanceLive, RunActivity, TrainingPlan } from "./types";

export interface GoalOdds {
  label: "A" | "B" | "C";
  timeLabel: string;
  timeSec: number;
  pct: number;
}

export interface PredictionSummary {
  goals: GoalOdds[];
  estimatedHalfSec: number | null;
  /** Minutes vs estimate before latest run (negative = faster). */
  deltaMinVsPrevEst: number | null;
  /** Minutes vs prior half (negative = faster than prior). */
  deltaMinVsPrior: number | null;
  priorHalfSec: number;
  priorHalfLabel: string;
}

function parseTimeToSec(raw: string): number {
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

/**
 * Honest race-day projection: blend fitness with prior half, modest credit
 * for training time left (injury + travel make big jumps unlikely).
 */
function raceDayProjectionSec(args: {
  estimatedHalfSec: number | null;
  priorHalfSec: number;
  daysToRace: number;
  mi14: number;
  weeklyMi: number;
}): number {
  const { estimatedHalfSec, priorHalfSec, daysToRace, mi14, weeklyMi } = args;
  const weeksLeft = Math.max(0, daysToRace / 7);

  const fitness = estimatedHalfSec ?? priorHalfSec;
  // Lean on prior half more — easy-pace conversion is noisy early
  const blended = fitness * 0.4 + priorHalfSec * 0.6;

  // ~25–30s/week of half-time credit while building; less near race
  const weeklyCreditSec = weeksLeft > 4 ? 28 : 18;
  let credit = weeksLeft * weeklyCreditSec;

  if (mi14 >= 20) credit += 40;
  if (mi14 >= 30) credit += 30;
  if (weeklyMi >= 18) credit += 25;
  // Italy zero + short longs early: don't pretend fitness is surging
  if (mi14 < 12) credit -= 60;
  if (weeksLeft > 10 && mi14 < 20) credit -= 45;

  return Math.round(blended - credit);
}

/** Soft probability of finishing at or under goal on race day. */
export function goalPct(projectedSec: number, goalSec: number): number {
  const gapMin = (projectedSec - goalSec) / 60;
  // Steeper than before: ~50% only when projection ≈ goal
  const logistic = 100 / (1 + Math.exp(gapMin / 4.2));
  return clamp(Math.round(logistic), 3, 94);
}

function estimateFromRuns(
  plan: TrainingPlan,
  runs: RunActivity[],
  weeklyMi: number,
): number | null {
  const last28 = runs.filter((r) => {
    const days = differenceInCalendarDays(new Date(), parseISO(r.startDate));
    return days >= 0 && days <= 28;
  });
  const bestRecent =
    last28
      .filter((r) => r.distanceMi >= 4)
      .map((r) => r.paceSecPerMi)
      .sort((a, b) => a - b)[0] ?? null;
  const longestRecent = last28.reduce((m, r) => Math.max(m, r.distanceMi), 0);
  return estimateHalfFromRecent(bestRecent, weeklyMi, longestRecent, {
    month: new Date().getMonth() + 1,
    trainingElevFtPerMi: 40,
    raceElevFtPerMi: plan.race.elevationFtPerMi ?? 0,
  });
}

export function buildPredictionSummary(args: {
  plan: TrainingPlan;
  runs: RunActivity[];
  pace: PaceGuidanceLive;
  weeklyMi: number;
  mi14: number;
  daysToRace: number;
}): PredictionSummary {
  const { plan, runs, pace, weeklyMi, mi14, daysToRace } = args;
  const priorHalfSec = parseTimeToSec(plan.athlete.priorHalf || "2:15:56");
  const priorHalfLabel = formatHalfClock(priorHalfSec);

  const aSec = 2 * 3600; // 2:00
  const bSec = 2 * 3600 + 10 * 60; // 2:10
  const cSec = 2 * 3600 + 30 * 60; // 2:30

  const estimatedHalfSec = pace.estimatedHalfSec;
  const projected = raceDayProjectionSec({
    estimatedHalfSec,
    priorHalfSec,
    daysToRace,
    mi14,
    weeklyMi,
  });

  const sorted = [...runs].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  let deltaMinVsPrevEst: number | null = null;
  if (sorted.length >= 1 && estimatedHalfSec != null) {
    const withoutLatest = sorted.slice(1);
    const prevEst = estimateFromRuns(plan, withoutLatest, weeklyMi);
    if (prevEst != null) {
      deltaMinVsPrevEst = Math.round((estimatedHalfSec - prevEst) / 60);
    }
  }

  const deltaMinVsPrior =
    estimatedHalfSec != null
      ? Math.round((estimatedHalfSec - priorHalfSec) / 60)
      : null;

  const goals: GoalOdds[] = [
    {
      label: "A",
      timeLabel: "2:00",
      timeSec: aSec,
      pct: goalPct(projected, aSec),
    },
    {
      label: "B",
      timeLabel: "2:10",
      timeSec: bSec,
      pct: goalPct(projected, bSec),
    },
    {
      label: "C",
      timeLabel: "2:30",
      timeSec: cSec,
      pct: goalPct(projected, cSec),
    },
  ];

  // Ordering only — no optimistic floors that inflate A
  goals[1].pct = Math.max(goals[1].pct, goals[0].pct + 8);
  goals[2].pct = Math.max(goals[2].pct, goals[1].pct + 10);
  goals[0].pct = clamp(goals[0].pct, 5, 70);
  goals[1].pct = clamp(goals[1].pct, 12, 85);
  goals[2].pct = clamp(goals[2].pct, 40, 95);

  return {
    goals,
    estimatedHalfSec,
    deltaMinVsPrevEst,
    deltaMinVsPrior,
    priorHalfSec,
    priorHalfLabel,
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
}): { status: "ahead" | "on_track" | "behind" | "rest"; headline: string; detail: string } {
  const today = args.asOf.toISOString().slice(0, 10);
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
