import { differenceInCalendarDays, parseISO } from "date-fns";
import { estimateHalfFromRecent } from "./format";
import { buildWeekStatus, runsInRange } from "./matching";
import { backtestEfficacy } from "./efficacy";
import { attachPaceRecsToWeek } from "./pace-recs";
import { dedupeRuns } from "./dedupe-runs";
import { buildMileageNarrative, buildPredictionSummary } from "./predictions";
import type {
  CoachReport,
  PaceGuidanceLive,
  Recommendation,
  RunActivity,
  TrainingPlan,
} from "./types";

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildPaceGuidance(
  plan: TrainingPlan,
  runs: RunActivity[],
  recentWeeklyMi: number,
): PaceGuidanceLive {
  const last28 = runs.filter((r) => {
    const days = differenceInCalendarDays(new Date(), parseISO(r.startDate));
    return days >= 0 && days <= 28;
  });

  const easyPaces = last28
    .filter((r) => r.distanceMi >= 2 && r.paceSecPerMi > 600)
    .map((r) => r.paceSecPerMi);

  const medEasy = median(easyPaces);
  const longestRecent = last28.reduce((m, r) => Math.max(m, r.distanceMi), 0);

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

  const bestRecent =
    last28
      .filter((r) => r.distanceMi >= 4)
      .map((r) => r.paceSecPerMi)
      .sort((a, b) => a - b)[0] ?? null;

  const estimatedHalfSec = estimateHalfFromRecent(
    bestRecent,
    recentWeeklyMi,
    longestRecent,
  );

  let confidence: PaceGuidanceLive["confidence"] = "low";
  if (last28.length >= 6 && longestRecent >= 8) confidence = "medium";
  if (last28.length >= 10 && longestRecent >= 10 && recentWeeklyMi >= 20) {
    confidence = "high";
  }

  if (estimatedHalfSec) {
    const goal = plan.athlete.goalPaceSecPerMi * 13.1;
    if (estimatedHalfSec <= goal) {
      rationale.push("Projection inside sub-2.");
    } else {
      const gapMin = Math.round((estimatedHalfSec - goal) / 60);
      rationale.push(`~${gapMin} min off sub-2 — volume first.`);
    }
  }

  return {
    easyMinSecPerMi: easyMin,
    easyMaxSecPerMi: easyMax,
    racePaceSecPerMi: plan.paceGuidance.racePaceSecPerMi,
    estimatedHalfSec,
    confidence,
    rationale,
  };
}

export function buildCoachReport(
  plan: TrainingPlan,
  runsInput: RunActivity[],
  asOf = new Date(),
): CoachReport {
  const runs = dedupeRuns(runsInput);
  const daysToRace = differenceInCalendarDays(parseISO(plan.race.date), asOf);
  const weekStatuses = plan.weeks.map((w) => buildWeekStatus(w, runs, asOf));
  const current = weekStatuses.find((w) => dateIn(asOf, w.week.start, w.week.end)) ?? null;

  const recentWeeklyMi =
    current?.loggedMi ??
    weekStatuses.filter((w) => w.week.end < asOf.toISOString().slice(0, 10)).slice(-1)[0]
      ?.loggedMi ??
    0;

  const paceGuidance = buildPaceGuidance(plan, runs, recentWeeklyMi);
  let recommendations = buildRecommendations(plan, runs, current, paceGuidance, asOf);

  const upcomingSource = current
    ? weekStatuses.filter((w) => w.week.id >= current.week.id)
    : weekStatuses;

  const upcomingWeeks = upcomingSource.map((w) => ({
    ...w,
    sessions: attachPaceRecsToWeek({
      sessions: w.sessions,
      plan,
      guidance: paceGuidance,
      runs,
      asOf,
    }),
  }));

  if (current) {
    const withRecs = upcomingWeeks.find((w) => w.week.id === current.week.id);
    if (withRecs) current.sessions = withRecs.sessions;
  }

  const last14 = runs.filter((r) => {
    const d = differenceInCalendarDays(asOf, parseISO(r.startDate));
    return d >= 0 && d <= 14;
  });
  const mi14 = last14.reduce((s, r) => s + r.distanceMi, 0);

  let sub2OddsBand = "20–30%";
  if (mi14 >= 20 && recentWeeklyMi >= 18) sub2OddsBand = "30–40%";
  if (
    paceGuidance.confidence === "high" &&
    (paceGuidance.estimatedHalfSec ?? 99999) <= 7200
  ) {
    sub2OddsBand = "40–50%";
  }
  if (mi14 < 12) sub2OddsBand = "15–25%";

  const predictions = buildPredictionSummary({
    plan,
    runs,
    pace: paceGuidance,
    weeklyMi: recentWeeklyMi,
    mi14,
    daysToRace,
  });
  if (predictions.goals[0]) {
    sub2OddsBand = `${predictions.goals[0].pct}%`;
  }

  const weeklyMileage = weekStatuses.map((w) => ({
    weekId: w.week.id,
    start: w.week.start,
    loggedMi: w.loggedMi,
    targetMi: w.targetMi,
  }));

  const mileageNarrative = buildMileageNarrative({
    weeklyMileage,
    currentWeekId: current?.week.id ?? null,
    asOf,
  });

  const summary = current
    ? `Week ${current.week.id}: ${current.loggedMi.toFixed(1)} / ${current.targetMi} mi. ${current.week.focus}`
    : "Outside planned weeks.";

  const efficacyRaw = backtestEfficacy(runs);
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
    upcomingWeeks,
    recentRuns: runs.slice(0, 12),
    weeklyMileage,
    paceGuidance,
    recommendations,
    sub2OddsBand,
    predictions,
    mileageNarrative,
    summary,
    efficacy,
  };
}

function dateIn(asOf: Date, start: string, end: string): boolean {
  const key = asOf.toISOString().slice(0, 10);
  return key >= start && key <= end;
}

function buildRecommendations(
  plan: TrainingPlan,
  runs: RunActivity[],
  current: ReturnType<typeof buildWeekStatus> | null,
  pace: PaceGuidanceLive,
  asOf: Date,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const key = asOf.toISOString().slice(0, 10);

  if (key >= plan.constraints.chicago.start && key <= plan.constraints.chicago.end) {
    recs.push({
      id: "chicago",
      priority: "high",
      title: "Chicago travel week",
      detail: "Cap at 2 easy runs. No strides, no pace work.",
      action: "Keep remaining Chicago runs easy and short.",
      planChange: { type: "hold_mileage", weekId: 1 },
    });
  }

  if (key >= "2026-09-14" && key <= "2026-09-20") {
    recs.push({
      id: "italy-zero",
      priority: "critical",
      title: "No running this week",
      detail: "Full Italy stop — planned zero miles.",
      action: "Walk / rest only. Rebuild starts Sep 22.",
      planChange: { type: "hold_mileage", weekId: 8 },
    });
  } else if (key >= plan.constraints.italy.start && key <= plan.constraints.italy.end) {
    recs.push({
      id: "italy",
      priority: "high",
      title: "Italy — minimize running",
      detail: "Do not chase volume before/during travel.",
      action: "Skip optional sessions freely.",
      planChange: { type: "cut_session" },
    });
  }

  if (current && current.targetMi > 0 && current.loggedMi > current.targetMi * 1.1) {
    recs.push({
      id: "over-mileage",
      priority: "critical",
      title: "Over weekly target",
      detail: `Logged ${current.loggedMi.toFixed(1)} vs ${current.targetMi} mi.`,
      action: "Rest or walk remaining days.",
      planChange: { type: "hold_mileage", weekId: current.week.id },
    });
  }

  if (
    current &&
    current.targetMi > 0 &&
    current.progressPct < 50 &&
    current.week.phase !== "italy"
  ) {
    const requiredLeft = current.sessions.filter(
      (s) => s.status === "upcoming" && !s.session.optional,
    );
    if (requiredLeft.length === 0) {
      recs.push({
        id: "behind-week",
        priority: "medium",
        title: "Behind this week's volume",
        detail: "Under target with few sessions left.",
        action: "Slide one easy run ±1 day if needed — don't double.",
        planChange: { type: "hold_mileage", weekId: current.week.id },
      });
    }
  }

  const last7 = runsInRange(
    runs,
    new Date(asOf.getTime() - 7 * 86400000).toISOString().slice(0, 10),
    key,
  );
  const highHrEasy = last7.filter(
    (r) =>
      r.averageHeartrate &&
      r.averageHeartrate > plan.paceGuidance.hrEasyCap + 5 &&
      r.paceSecPerMi >= pace.easyMinSecPerMi,
  );
  if (highHrEasy.length >= 2) {
    recs.push({
      id: "hr-drift",
      priority: "high",
      title: "Easy runs looking hard",
      detail: "Recent easy efforts above Z2.",
      action: "Slow 15–30 sec/mi for a few runs.",
      planChange: { type: "ease_pace" },
    });
  }

  const phase = current?.week.phase;
  if (phase === "base" || phase === "build") {
    recs.push({
      id: "no-early-quality",
      priority: "medium",
      title: "No race-pace workouts yet",
      detail: "Injury history — early time trials are the failure mode.",
      action: "Strides only until post-Italy rebuild.",
      planChange: { type: "shift_quality" },
    });
  }

  if (phase === "rebuild") {
    recs.push({
      id: "post-italy",
      priority: "high",
      title: "Rebuild — patience",
      detail: "Fitness returns faster than tissue tolerance.",
      action: "All easy this week even if you feel good.",
      planChange: { type: "hold_mileage", weekId: current?.week.id },
    });
  }

  if (phase === "quality" || phase === "peak") {
    if (pace.confidence !== "low") {
      recs.push({
        id: "quality-ok",
        priority: "medium",
        title: "Quality block OK",
        detail: "Volume base supports controlled race-pace work.",
        action: "Stop if calf/knee complains.",
        planChange: { type: "advance_quality", weekId: current?.week.id },
      });
    } else {
      recs.push({
        id: "quality-delay",
        priority: "high",
        title: "Keep quality light",
        detail: "Consistency/longest-run confidence still low.",
        action: "Short 2–3 min snippets only.",
        planChange: { type: "shift_quality", weekId: current?.week.id },
      });
    }
  }

  if (phase === "taper" || phase === "race") {
    recs.push({
      id: "taper",
      priority: "high",
      title: "Taper — trust the work",
      detail: "Short easy only. Freshness > fitness this week.",
      action: "No bonus miles. Sleep and carbs.",
      planChange: { type: "hold_mileage", weekId: current?.week.id },
    });
  }

  if (pace.estimatedHalfSec && pace.estimatedHalfSec > 7800) {
    recs.push({
      id: "goal-reframe",
      priority: "low",
      title: "Keep sub-2:10 as success line",
      detail: "Sub-2 is stretch A-goal; reassess after peak week.",
      action: "Don't add mystery miles to force the projection.",
    });
  }

  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}
