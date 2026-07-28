import { dayKeyOf, daysBetweenKeys, runDayKey } from "./dates";
import type {
  PlanWeek,
  PlannedSession,
  RunActivity,
  SessionStatus,
  TrainingPlan,
  WeekStatus,
} from "./types";

/**
 * Calendar day of a stored timestamp, in the athlete's timezone.
 * Previously a raw `slice(0, 10)`, which put evening Pacific runs on the next
 * UTC day and matched them to the wrong session.
 */
export function dateKey(iso: string, tz?: string): string {
  return runDayKey(iso, tz);
}

export function getWeekForDate(plan: TrainingPlan, date: string): PlanWeek | null {
  const key = dateKey(date);
  return plan.weeks.find((w) => key >= w.start && key <= w.end) ?? null;
}

export function getCurrentWeek(plan: TrainingPlan, asOf = new Date()): PlanWeek | null {
  return getWeekForDate(plan, dayKeyOf(asOf, plan.athlete.timeZone));
}

export function runsInRange(runs: RunActivity[], start: string, end: string): RunActivity[] {
  return runs.filter((r) => {
    const key = dateKey(r.startDate);
    return key >= start && key <= end;
  });
}

/** Miles that count toward the weekly training target (excludes race + strength + optionals). */
export function weekTrainingTargetMi(week: PlanWeek): number {
  const sum = week.sessions
    .filter(
      (s) =>
        !s.optional &&
        s.type !== "race" &&
        s.type !== "strength" &&
        s.type !== "rest" &&
        s.targetMi > 0,
    )
    .reduce((n, s) => n + s.targetMi, 0);
  return Number(sum.toFixed(1));
}

function isRunSession(s: PlannedSession): boolean {
  return s.type !== "strength" && s.type !== "rest";
}

function matchRunToSession(
  session: PlannedSession,
  runs: RunActivity[],
  used: Set<string>,
): RunActivity | undefined {
  if (session.type === "strength" || session.type === "rest") return undefined;

  const sameDay = runs
    .filter((r) => dateKey(r.startDate) === session.date && !used.has(r.id))
    .sort((a, b) => b.distanceMi - a.distanceMi);

  if (sameDay.length) return sameDay[0];

  const flex = runs
    .filter((r) => {
      if (used.has(r.id)) return false;
      return Math.abs(daysBetweenKeys(session.date, dateKey(r.startDate))) === 1;
    })
    .sort((a, b) => b.distanceMi - a.distanceMi);

  return flex[0];
}

export function buildWeekStatus(
  week: PlanWeek,
  runs: RunActivity[],
  asOf = new Date(),
): WeekStatus {
  const weekRuns = runsInRange(runs, week.start, week.end);
  const used = new Set<string>();
  const today = dayKeyOf(asOf);
  const raceSession = week.sessions.find((s) => s.type === "race");

  const sessions: SessionStatus[] = week.sessions.map((session) => {
    const matched = matchRunToSession(session, weekRuns, used);
    if (matched) {
      used.add(matched.id);
      const ratio = matched.distanceMi / Math.max(session.targetMi, 0.1);
      const status = ratio >= 0.85 ? "done" : "partial";
      return {
        session,
        status,
        matchedRun: matched,
        distanceDeltaMi: Number((matched.distanceMi - session.targetMi).toFixed(2)),
      };
    }

    if (session.type === "strength" || session.type === "rest") {
      if (session.date > today) return { session, status: "upcoming" as const };
      if (session.date === today) return { session, status: "today" as const };
      return { session, status: "optional_skipped" as const };
    }

    if (session.date === today) {
      return { session, status: "today" };
    }
    if (session.date > today) {
      return { session, status: "upcoming" };
    }
    if (session.optional || session.targetMi <= 0) {
      return { session, status: "optional_skipped" };
    }
    return { session, status: "missed" };
  });

  // Training miles only: exclude race-day long effort from weekly progress
  const loggedMi = Number(
    weekRuns
      .filter((r) => {
        if (!raceSession) return true;
        const key = dateKey(r.startDate);
        if (key !== raceSession.date) return true;
        // Race day: count only short shakeout-ish miles, not the half
        return r.distanceMi < 8;
      })
      .reduce((sum, r) => sum + r.distanceMi, 0)
      .toFixed(2),
  );

  const longestMi = weekRuns.reduce((max, r) => Math.max(max, r.distanceMi), 0);
  const paced = weekRuns.filter((r) => r.paceSecPerMi > 0);
  const avgPaceSecPerMi = paced.length
    ? paced.reduce((s, r) => s + r.paceSecPerMi, 0) / paced.length
    : null;
  const hrRuns = weekRuns.filter((r) => r.averageHeartrate);
  const avgHr = hrRuns.length
    ? hrRuns.reduce((s, r) => s + (r.averageHeartrate || 0), 0) / hrRuns.length
    : null;

  const targetMi = weekTrainingTargetMi(week);
  const dueMi = week.sessions
    .filter(
      (s) =>
        !s.optional &&
        s.type !== "race" &&
        s.type !== "strength" &&
        s.type !== "rest" &&
        s.targetMi > 0 &&
        s.date <= today,
    )
    .reduce((n, s) => n + s.targetMi, 0);
  const expectedPct =
    targetMi <= 0 ? 0 : Math.min(100, Math.round((dueMi / targetMi) * 100));
  const overTarget = targetMi > 0 && loggedMi > targetMi;
  const progressPct =
    targetMi <= 0 ? (loggedMi > 0 ? 100 : 0) : Math.round((loggedMi / targetMi) * 100);

  return {
    week,
    loggedMi,
    targetMi,
    progressPct,
    expectedPct,
    overTarget,
    sessions,
    longestMi,
    avgPaceSecPerMi,
    avgHr,
  };
}

/** Mark the single next actionable session (today first, then soonest upcoming). */
export function markNextSession(weeks: WeekStatus[]): SessionStatus | null {
  const actionable = weeks
    .flatMap((w) => w.sessions)
    .filter(
      (s) =>
        (s.status === "today" || s.status === "upcoming") &&
        isRunSession(s.session) &&
        !s.session.optional,
    )
    .sort((a, b) => a.session.date.localeCompare(b.session.date));

  const next = actionable[0] ?? null;
  for (const w of weeks) {
    for (const s of w.sessions) {
      s.isNext = next != null && s.session.id === next.session.id;
    }
  }
  return next;
}
