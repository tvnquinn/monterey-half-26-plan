import { differenceInCalendarDays, parseISO } from "date-fns";
import { dateKey } from "./matching";
import type { RunActivity } from "./types";

function preference(run: RunActivity): number {
  let score = 0;
  if (run.stravaId) score += 40;
  if (run.id.startsWith("gpx-")) score += 30;
  if (run.source === "manual") score += 10;
  if (run.source === "seed") score -= 20;
  if (run.averageHeartrate) score += 5;
  if (run.elevationFt > 0) score += 2;
  return score;
}

/** Drop near-duplicates (±1 day, similar distance) that inflate weekly mileage. */
export function dedupeRuns(runs: RunActivity[]): RunActivity[] {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  const kept: RunActivity[] = [];

  for (const run of sorted) {
    const dupIdx = kept.findIndex((other) => {
      const dayDiff = Math.abs(
        differenceInCalendarDays(parseISO(dateKey(run.startDate)), parseISO(dateKey(other.startDate))),
      );
      if (dayDiff > 1) return false;
      return Math.abs(run.distanceMi - other.distanceMi) <= 0.3;
    });

    if (dupIdx === -1) {
      kept.push(run);
      continue;
    }

    if (preference(run) > preference(kept[dupIdx])) {
      kept[dupIdx] = run;
    }
  }

  return kept.sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
}
