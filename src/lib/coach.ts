import { dayKeyOf, daysBetweenKeys, runDayKey } from "./dates";
import { estimateHalf } from "./fitness";
import { buildWeekStatus, markNextSession } from "./matching";
import { backtestEfficacy } from "./efficacy";
import { attachPaceRecsToWeek } from "./pace-recs";
import { dedupeRuns } from "./dedupe-runs";
import {
  buildMileageNarrative,
  buildPredictionSummary,
  buildTrainingSignal,
  parseTimeToSec,
} from "./predictions";
import type {
  CoachReport,
  PaceGuidanceLive,
  RunActivity,
  TrainingPlan,
} from "./types";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildPaceGuidance(args: {
  plan: TrainingPlan;
  runs: RunActivity[];
  weeklyMi: number;
  asOf: Date;
  tz?: string;
}): PaceGuidanceLive {
  const { plan, runs, weeklyMi, asOf, tz } = args;
  const today = dayKeyOf(asOf, tz);

  const last28 = runs.filter((r) => {
    const days = daysBetweenKeys(runDayKey(r.startDate, tz), today);
    return days >= 0 && days <= 28;
  });

  const easyPaces = last28
    .filter((r) => r.distanceMi >= 2 && r.paceSecPerMi > 600)
    .map((r) => r.paceSecPerMi);
  const medEasy = median(easyPaces);

  let easyMin = plan.paceGuidance.easyMinSecPerMi;
  let easyMax = plan.paceGuidance.easyMaxSecPerMi;
  const rationale: string[] = [];

  if (medEasy) {
    easyMin = Math.round(medEasy - 30);
    easyMax = Math.round(medEasy + 60);
    rationale.push("Easy band from recent median.");
  } else {
    rationale.push("Using plan easy defaults.");
  }

  const estimate = estimateHalf({
    runs,
    plan,
    priorHalfSec: parseTimeToSec(plan.athlete.priorHalf || "2:15:56"),
    asOf,
    weeklyMi,
    tz,
  });
  rationale.push(...estimate.basis);

  return {
    easyMinSecPerMi: easyMin,
    easyMaxSecPerMi: easyMax,
    racePaceSecPerMi: plan.paceGuidance.racePaceSecPerMi,
    estimatedHalfSec: estimate.sec,
    confidence: estimate.confidence,
    method: estimate.method,
    rationale,
  };
}

export function buildCoachReport(
  plan: TrainingPlan,
  runsInput: RunActivity[],
  asOf = new Date(),
): CoachReport {
  const tz = plan.athlete.timeZone;
  const today = dayKeyOf(asOf, tz);
  const runs = dedupeRuns(runsInput);
  const daysToRace = daysBetweenKeys(today, plan.race.date);

  const weekStatuses = plan.weeks.map((w) => buildWeekStatus(w, runs, asOf, plan));
  const current =
    weekStatuses.find((w) => today >= w.week.start && today <= w.week.end) ?? null;

  // Rolling 4-week average is a steadier input than "this week so far".
  const last28 = runs.filter((r) => {
    const d = daysBetweenKeys(runDayKey(r.startDate, tz), today);
    return d >= 0 && d <= 28;
  });
  const avgWeeklyMi = last28.reduce((s, r) => s + r.distanceMi, 0) / 4;

  const paceGuidance = buildPaceGuidance({
    plan,
    runs,
    weeklyMi: avgWeeklyMi,
    asOf,
    tz,
  });

  // Every week, past included. Previously this dropped anything before the
  // current week, so finished weeks vanished from the UI and there was no way
  // to look back at what you actually ran.
  const weeks = weekStatuses.map((w) => ({
    ...w,
    sessions: attachPaceRecsToWeek({
      sessions: w.sessions,
      plan,
      guidance: paceGuidance,
      runs,
      asOf,
    }),
  }));

  const weeklyMileage = weekStatuses.map((w) => {
    const longSession = [...w.week.sessions]
      .filter((s) => s.type === "long")
      .sort((a, b) => b.targetMi - a.targetMi)[0];
    return {
      weekId: w.week.id,
      start: w.week.start,
      loggedMi: w.loggedMi,
      targetMi: w.targetMi,
      longMi: longSession?.targetMi ?? 0,
      longestLoggedMi: w.longestMi,
    };
  });

  const signal = buildTrainingSignal({
    weeklyMileage,
    currentWeekId: current?.week.id ?? null,
    runs,
    daysToRace,
    asOf,
    tz,
  });

  const predictions = buildPredictionSummary({
    plan,
    runs,
    estimatedHalfSec: paceGuidance.estimatedHalfSec,
    confidence: paceGuidance.confidence,
    signal,
    daysToRace,
    asOf,
    tz,
  });

  const mileageNarrative = buildMileageNarrative({
    weeklyMileage,
    currentWeekId: current?.week.id ?? null,
    asOf,
    tz,
  });

  const nextSession = markNextSession(weeks);
  if (current) {
    const withSessions = weeks.find((w) => w.week.id === current.week.id);
    if (withSessions) current.sessions = withSessions.sessions;
  }

  const summary = current
    ? `Week ${current.week.id}: ${current.loggedMi.toFixed(1)} / ${current.targetMi} mi. ${current.week.focus}`
    : "Outside planned weeks.";

  const efficacyRaw = backtestEfficacy(runs, tz);
  const efficacy = {
    usableRuns: efficacyRaw.usableRuns,
    hrTaggedRuns: efficacyRaw.hrTaggedRuns,
    maeSec: efficacyRaw.maeSec,
    baselineMaeSec: efficacyRaw.baselineMaeSec,
    skillScore: efficacyRaw.skillScore,
    meanAbsPctError: efficacyRaw.meanAbsPctError,
    hrPaceCorrelation: efficacyRaw.hrPaceCorrelation,
    verdict: efficacyRaw.verdict,
    limitations: efficacyRaw.limitations,
    nextRunHint: efficacyRaw.nextRunHint,
    samplePredictions: efficacyRaw.predictions.slice(-5).map((p) => ({
      date: p.date,
      actualPaceSec: Math.round(p.actualPace),
      predictedPaceSec: Math.round(p.predictedPace),
      errorSec: Math.round(p.errorSec),
    })),
  };

  return {
    asOf: asOf.toISOString(),
    daysToRace,
    currentWeek: current,
    weeks,
    recentRuns: runs.slice(0, 12),
    weeklyMileage,
    paceGuidance,
    predictions,
    mileageNarrative,
    summary,
    efficacy,
    nextSession,
  };
}
