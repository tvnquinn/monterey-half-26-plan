import { differenceInCalendarDays, parseISO } from "date-fns";
import { estimateHalfFromRecent } from "./format";
import { buildWeekStatus, runsInRange } from "./matching";
import { backtestEfficacy } from "./efficacy";
import { attachPaceRecsToWeek } from "./pace-recs";
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
    // Keep easy truly easy: center band around recent easy median ±45s
    easyMin = Math.round(medEasy - 30);
    easyMax = Math.round(medEasy + 60);
    rationale.push(
      `Recent easy median is ${Math.floor(medEasy / 60)}:${String(Math.round(medEasy % 60)).padStart(2, "0")}/mi — keep easy in that neighborhood for injury control.`,
    );
  } else {
    rationale.push("Not enough recent runs to retune easy pace; using plan defaults.");
  }

  const bestRecent = last28
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
      rationale.push("Current projection is inside sub-2 range — protect consistency.");
    } else {
      const gapMin = Math.round((estimatedHalfSec - goal) / 60);
      rationale.push(
        `Projection is ~${gapMin} min slower than sub-2. Volume + late race-pace work matter more than forcing speed now.`,
      );
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
  runs: RunActivity[],
  asOf = new Date(),
): CoachReport {
  const daysToRace = differenceInCalendarDays(parseISO(plan.race.date), asOf);
  const weekStatuses = plan.weeks.map((w) => buildWeekStatus(w, runs, asOf));
  const current = weekStatuses.find(
    (w) =>
      dateIn(asOf, w.week.start, w.week.end),
  ) ?? null;

  const recentWeeklyMi = current?.loggedMi
    ?? weekStatuses
      .filter((w) => w.week.end < asOf.toISOString().slice(0, 10))
      .slice(-1)[0]?.loggedMi
    ?? 0;

  const paceGuidance = buildPaceGuidance(plan, runs, recentWeeklyMi);
  const recommendations = buildRecommendations(plan, runs, current, paceGuidance, asOf);

  if (current) {
    current.sessions = attachPaceRecsToWeek({
      sessions: current.sessions,
      plan,
      guidance: paceGuidance,
      runs,
      asOf,
    });
  }

  // Also attach pace recs onto recommendations as concrete per-run lines
  if (current) {
    for (const s of current.sessions) {
      if (!s.paceRec) continue;
      recommendations.unshift({
        id: `pace-${s.session.id}`,
        priority: s.session.type === "quality" || s.session.type === "race" ? "high" : "medium",
        title: `${s.session.date.slice(5)} ${s.session.type.replace("_", " ")} · ${s.paceRec.label}`,
        detail: `Target ${Math.floor(s.paceRec.targetSecPerMi / 60)}:${String(s.paceRec.targetSecPerMi % 60).padStart(2, "0")}/mi (${Math.floor(s.paceRec.minSecPerMi / 60)}:${String(s.paceRec.minSecPerMi % 60).padStart(2, "0")}–${Math.floor(s.paceRec.maxSecPerMi / 60)}:${String(s.paceRec.maxSecPerMi % 60).padStart(2, "0")})${s.paceRec.hrTarget ? ` · HR ~${s.paceRec.hrTarget}` : ""}`,
        action: s.paceRec.rationale,
      });
    }
  }

  const last14 = runs.filter((r) => {
    const d = differenceInCalendarDays(asOf, parseISO(r.startDate));
    return d >= 0 && d <= 14;
  });
  const mi14 = last14.reduce((s, r) => s + r.distanceMi, 0);

  let sub2OddsBand = "20–30%";
  if (mi14 >= 20 && recentWeeklyMi >= 18) sub2OddsBand = "30–40%";
  if (paceGuidance.confidence === "high" && (paceGuidance.estimatedHalfSec ?? 99999) <= 7200) {
    sub2OddsBand = "40–50%";
  }
  if (mi14 < 12) sub2OddsBand = "15–25%";

  const summary = current
    ? `Week ${current.week.id} (${current.week.phase}): ${current.loggedMi.toFixed(1)} / ${current.targetLow}–${current.targetHigh} mi. ${current.week.focus}`
    : "Outside planned weeks — sync runs and check race date.";

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
    recentRuns: runs.slice(0, 12),
    weeklyMileage: weekStatuses.map((w) => ({
      weekId: w.week.id,
      start: w.week.start,
      loggedMi: w.loggedMi,
      targetLow: w.targetLow,
      targetHigh: w.targetHigh,
    })),
    paceGuidance,
    recommendations,
    sub2OddsBand,
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
      detail: "Cap at 2 easy runs. No strides, no pace work. Protect the calf/knee.",
      action: "Keep remaining Chicago runs easy and short if travel is stressful.",
      planChange: { type: "hold_mileage", weekId: 1 },
    });
  }

  if (key >= plan.constraints.italy.start && key <= plan.constraints.italy.end) {
    recs.push({
      id: "italy",
      priority: "high",
      title: "Italy maintenance mode",
      detail: "Do not chase the pre-Italy peak. 2 short easy runs/week is a win.",
      action: "Skip optional sessions freely; resume rebuild on Sep 22.",
      planChange: { type: "cut_session" },
    });
  }

  if (current && current.loggedMi > current.targetHigh * 1.1) {
    recs.push({
      id: "over-mileage",
      priority: "critical",
      title: "Over weekly mileage band",
      detail: `Logged ${current.loggedMi.toFixed(1)} mi vs ${current.targetHigh} mi cap.`,
      action: "Convert remaining runs to rest or 20–30 min walks.",
      planChange: { type: "hold_mileage", weekId: current.week.id },
    });
  }

  if (current && current.progressPct < 50 && current.week.phase !== "italy") {
    const requiredLeft = current.sessions.filter(
      (s) => s.status === "upcoming" && !s.session.optional,
    );
    if (requiredLeft.length === 0) {
      recs.push({
        id: "behind-week",
        priority: "medium",
        title: "Behind this week's volume",
        detail: "You are under the weekly floor with few sessions left.",
        action: "Do not double tomorrow. Slide one easy run ±1 day if needed.",
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
      r.averageHeartrate > plan.paceGuidance.hrEasyCap + 8 &&
      r.paceSecPerMi >= pace.easyMinSecPerMi,
  );
  if (highHrEasy.length >= 2) {
    recs.push({
      id: "hr-drift",
      priority: "high",
      title: "Easy runs look physiologically hard",
      detail: "Recent easy efforts are averaging above your easy HR cap.",
      action: "Slow another 15–30 sec/mi for 3–4 runs. Delay quality if this continues.",
      planChange: { type: "ease_pace" },
    });
  }

  const phase = current?.week.phase;
  if (phase === "base" || phase === "build") {
    recs.push({
      id: "no-early-quality",
      priority: "medium",
      title: "No race-pace workouts yet",
      detail: "Your injury history makes early time trials the main failure mode.",
      action: "Strides only until the quality block after Italy.",
      planChange: { type: "shift_quality" },
    });
  }

  if (phase === "rebuild") {
    recs.push({
      id: "post-italy",
      priority: "high",
      title: "Rebuild week — patience",
      detail: "Fitness returns faster than tissue tolerance after travel.",
      action: "Keep all runs easy this week even if you feel good.",
      planChange: { type: "hold_mileage", weekId: current?.week.id },
    });
  }

  if (phase === "quality" || phase === "peak") {
    if (pace.confidence !== "low") {
      recs.push({
        id: "quality-ok",
        priority: "medium",
        title: "Quality block is appropriate",
        detail: "Volume base is sufficient to introduce controlled race-pace work.",
        action: "Keep quality segments honest but stop if calf/knee complains.",
        planChange: { type: "advance_quality", weekId: current?.week.id },
      });
    } else {
      recs.push({
        id: "quality-delay",
        priority: "high",
        title: "Delay aggressive race-pace work",
        detail: "Consistency/longest-run confidence is still low.",
        action: "Replace continuous RP with short 2–3 min snippets only.",
        planChange: { type: "shift_quality", weekId: current?.week.id },
      });
    }
  }

  if (pace.estimatedHalfSec && pace.estimatedHalfSec > 7800) {
    recs.push({
      id: "goal-reframe",
      priority: "low",
      title: "Keep sub-2:10 as the success line",
      detail: "Sub-2 remains the stretch A-goal; judge again after week 12.",
      action: "Do not add mystery miles to force the projection down.",
    });
  }

  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs.sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority],
  );
}
