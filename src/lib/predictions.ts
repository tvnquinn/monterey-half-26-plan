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

function volumeBoost(mi14: number, weeklyMi: number): number {
  let b = 0;
  if (mi14 >= 20) b += 4;
  if (mi14 >= 28) b += 3;
  if (weeklyMi >= 18) b += 3;
  if (weeklyMi < 10) b -= 6;
  if (mi14 < 12) b -= 8;
  return b;
}

function confBoost(confidence: PaceGuidanceLive["confidence"]): number {
  if (confidence === "high") return 5;
  if (confidence === "medium") return 2;
  return -3;
}

/** Soft probability that race day finishes at or under goal given current estimate. */
export function goalPct(
  estimatedHalfSec: number | null,
  goalSec: number,
  confidence: PaceGuidanceLive["confidence"],
  mi14: number,
  weeklyMi: number,
): number {
  if (!estimatedHalfSec) {
    // No estimate yet — prior half anchors C, A/B stay low
    const gap = (8156 - goalSec) / 60;
    return clamp(Math.round(38 - gap * 2.2 + volumeBoost(mi14, weeklyMi)), 3, 55);
  }

  const gapMin = (estimatedHalfSec - goalSec) / 60;
  // ~50% when estimate equals goal; drops ~8 pts per minute slow
  const logistic = 100 / (1 + Math.exp(gapMin / 2.8));
  const raw = logistic + volumeBoost(mi14, weeklyMi) + confBoost(confidence);
  return clamp(Math.round(raw), 2, 92);
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
  return estimateHalfFromRecent(bestRecent, weeklyMi, longestRecent);
}

export function buildPredictionSummary(args: {
  plan: TrainingPlan;
  runs: RunActivity[];
  pace: PaceGuidanceLive;
  weeklyMi: number;
  mi14: number;
}): PredictionSummary {
  const { plan, runs, pace, weeklyMi, mi14 } = args;
  const priorHalfSec = parseTimeToSec(plan.athlete.priorHalf || "2:15:56");
  const priorHalfLabel = formatHalfClock(priorHalfSec); // 2:16

  const aSec = 2 * 3600; // 2:00
  const bSec = 2 * 3600 + 10 * 60; // 2:10
  const cSec = priorHalfSec; // beat / match prior ≈ 2:16

  const estimatedHalfSec = pace.estimatedHalfSec;

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
      pct: goalPct(estimatedHalfSec, aSec, pace.confidence, mi14, weeklyMi),
    },
    {
      label: "B",
      timeLabel: "2:10",
      timeSec: bSec,
      pct: goalPct(estimatedHalfSec, bSec, pace.confidence, mi14, weeklyMi),
    },
    {
      label: "C",
      timeLabel: priorHalfLabel,
      timeSec: cSec,
      pct: goalPct(estimatedHalfSec, cSec, pace.confidence, mi14, weeklyMi),
    },
  ];

  // Ensure A < B < C roughly (harder goals shouldn't outrank easier)
  goals[1].pct = Math.max(goals[1].pct, goals[0].pct + 4);
  goals[2].pct = Math.max(goals[2].pct, goals[1].pct + 4);
  goals[0].pct = clamp(goals[0].pct, 2, 88);
  goals[1].pct = clamp(goals[1].pct, 4, 90);
  goals[2].pct = clamp(goals[2].pct, 6, 94);

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
  weeklyMileage: { weekId: number; start: string; loggedMi: number; targetMi: number }[];
  currentWeekId: number | null;
  asOf: Date;
}): { status: "ahead" | "on_track" | "behind" | "rest"; headline: string; detail: string } {
  const today = args.asOf.toISOString().slice(0, 10);
  const past = args.weeklyMileage.filter((w) => {
    // week start already passed and not current unfinished only — use weeks before current
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
