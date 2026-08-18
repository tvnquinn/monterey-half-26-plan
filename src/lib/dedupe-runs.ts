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

/**
 * How far apart two records of the *same* run can be. Health Auto Export,
 * Strava and a GPX file disagree by minutes at most; allowing three hours also
 * covers a source that stamps the finish rather than the start.
 *
 * This used to be "within one calendar day", which is a different question. It
 * was written to catch a run stored under the wrong day by the old
 * `toISOString().slice(0, 10)` bug, but it also matched any two genuinely
 * different runs on consecutive days at a similar distance — and the plan
 * schedules exactly that, easy 4.5 on Tuesday and easy 4.5 on Wednesday, on
 * the same route by design. Six weeks of the block pair identical back-to-back
 * easy days; 27.5 of 240.7 planned miles were being deleted on arrival, with
 * nothing shown to say so. Logged mileage feeds adherence and adherence sets
 * the improvement credit, so it was quietly worth about a minute of projected
 * race time.
 *
 * Comparing timestamps rather than day labels separates the two cases cleanly:
 * re-imports of one run share a start time, consecutive-day runs sit ~24 h
 * apart. Note this no longer masks a genuinely mis-dated row — a hand-entered
 * copy a full day off is now kept, and has to be deleted from storage instead.
 */
const SAME_RUN_HOURS = 3;

/** Drop re-imports of a run (same start time, similar distance) that inflate weekly mileage. */
export function dedupeRuns(runs: RunActivity[]): RunActivity[] {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  const kept: RunActivity[] = [];

  for (const run of sorted) {
    const dupIdx = kept.findIndex((other) => {
      if (Math.abs(run.distanceMi - other.distanceMi) > 0.3) return false;
      const hoursApart =
        Math.abs(
          new Date(run.startDate).getTime() - new Date(other.startDate).getTime(),
        ) / 3_600_000;
      return hoursApart <= SAME_RUN_HOURS;
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
