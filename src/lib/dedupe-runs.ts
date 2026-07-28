import { differenceInCalendarDays, parseISO } from "date-fns";
import { dateKey } from "./matching";
import type { RunActivity } from "./types";

/**
 * Rank duplicate copies of the same run by how much the model can learn from
 * them, not by where they came from.
 *
 * This used to give +30 for a `gpx-` id and only +5 for heart rate, so a GPX
 * import with no HR beat a Health Auto Export copy of the same run that had HR,
 * temperature and cadence. Distance is near-identical between sources; heart
 * rate is the field the fitness model actually runs on, so it dominates.
 */
function preference(run: RunActivity): number {
  let score = 0;
  if (run.averageHeartrate) score += 25;
  if (run.temperatureF != null) score += 5;
  if (run.averageCadence) score += 2;
  if (run.elevationFt > 0) score += 2;
  // Provenance, as a tiebreak only.
  if (run.stravaId) score += 8;
  if (run.id.startsWith("gpx-")) score += 4;
  if (run.source === "seed") score -= 20;
  // A pace back-filled from a monthly average is barely an observation.
  if ((run.raw as { paceImputed?: boolean } | undefined)?.paceImputed) score -= 30;
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
