import { differenceInCalendarDays, parseISO, formatISO, startOfDay } from "date-fns";
import type {
  PlanWeek,
  PlannedSession,
  RunActivity,
  SessionStatus,
  TrainingPlan,
  WeekStatus,
} from "./types";

export function dateKey(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  return formatISO(startOfDay(parseISO(iso)), { representation: "date" });
}

export function getWeekForDate(plan: TrainingPlan, date: string): PlanWeek | null {
  const key = dateKey(date);
  return plan.weeks.find((w) => key >= w.start && key <= w.end) ?? null;
}

export function getCurrentWeek(plan: TrainingPlan, asOf = new Date()): PlanWeek | null {
  return getWeekForDate(plan, asOf.toISOString());
}

export function runsInRange(runs: RunActivity[], start: string, end: string): RunActivity[] {
  return runs.filter((r) => {
    const key = dateKey(r.startDate);
    return key >= start && key <= end;
  });
}

function matchRunToSession(
  session: PlannedSession,
  runs: RunActivity[],
  used: Set<string>,
): RunActivity | undefined {
  const sameDay = runs
    .filter((r) => dateKey(r.startDate) === session.date && !used.has(r.id))
    .sort((a, b) => b.distanceMi - a.distanceMi);

  if (sameDay.length) return sameDay[0];

  const flex = runs
    .filter((r) => {
      if (used.has(r.id)) return false;
      const delta = Math.abs(
        differenceInCalendarDays(parseISO(dateKey(r.startDate)), parseISO(session.date)),
      );
      return delta === 1;
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
  const today = dateKey(asOf.toISOString());

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

    if (session.date > today) {
      return { session, status: "upcoming" };
    }
    if (session.optional || session.targetMi <= 0) {
      return { session, status: "optional_skipped" };
    }
    return { session, status: "missed" };
  });

  const loggedMi = Number(
    weekRuns.reduce((sum, r) => sum + r.distanceMi, 0).toFixed(2),
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

  const targetMi = week.targetMi;
  const overTarget = targetMi > 0 && loggedMi > targetMi;
  const progressPct =
    targetMi <= 0 ? (loggedMi > 0 ? 100 : 0) : Math.round((loggedMi / targetMi) * 100);

  return {
    week,
    loggedMi,
    targetMi,
    progressPct,
    overTarget,
    sessions,
    longestMi,
    avgPaceSecPerMi,
    avgHr,
  };
}
