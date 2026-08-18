/**
 * Does dedupeRuns still tell a re-import apart from a real back-to-back day?
 *
 *   npx tsx scripts/dedupe-check.mts
 *
 * Both directions matter and they pull against each other. Collapse too
 * eagerly and the plan's paired Tue/Wed easy days on the same 4.5 route are
 * deleted on arrival — 27.5 of 240.7 planned miles, silently. Collapse too
 * timidly and a Strava import stacked on a Health Auto Export copy of one run
 * counts that run twice.
 *
 * Every case below was run against the old calendar-day rule first, because a
 * fixture no old version fails proves nothing (see LEARNINGS, bug 13). It
 * fails 1, 2 and 5 and passes 3 and 4 — so the two collapse cases are load
 * bearing, not decoration.
 */
import { dedupeRuns } from "../src/lib/dedupe-runs";
import type { RunActivity } from "../src/lib/types";

const base: RunActivity = {
  id: "a", source: "manual", name: "Outdoor Run",
  startDate: "2026-08-18T17:00:00-07:00", distanceMi: 4.5,
  movingTimeSec: 3375, elapsedTimeSec: 3375, paceSecPerMi: 750,
  elevationFt: 40, averageHeartrate: 147, maxHeartrate: 165,
};
const at = (id: string, startDate: string, over: Partial<RunActivity> = {}): RunActivity =>
  ({ ...base, id, startDate, ...over });

const cases: { name: string; runs: RunActivity[]; expect: number }[] = [
  {
    name: "Tue 4.5 and Wed 4.5 on the same route are two runs",
    runs: [at("tue", "2026-08-18T17:00:00-07:00"), at("wed", "2026-08-19T17:00:00-07:00")],
    expect: 2,
  },
  {
    name: "a mis-dated hand entry a full day off is kept, not masked",
    runs: [at("real", "2026-08-13T09:15:00-07:00"), at("misdated", "2026-08-12T09:15:00-07:00")],
    expect: 2,
  },
  {
    name: "the same run from two sources collapses",
    runs: [
      at("hae-2026-08-18", "2026-08-18T17:00:00-07:00"),
      at("gpx-2026-08-18", "2026-08-18T17:02:00-07:00", { averageHeartrate: undefined }),
    ],
    expect: 1,
  },
  {
    name: "a source stamping the finish still collapses",
    runs: [at("start", "2026-08-18T17:00:00-07:00"), at("finish", "2026-08-18T17:56:00-07:00")],
    expect: 1,
  },
  {
    name: "a genuine morning/evening double on one day is two runs",
    runs: [at("am", "2026-08-18T07:00:00-07:00"), at("pm", "2026-08-18T18:00:00-07:00")],
    expect: 2,
  },
];

let failed = 0;
for (const c of cases) {
  const got = dedupeRuns(c.runs).length;
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (expected ${c.expect}, got ${got})`);
}

/** The richer copy has to be the survivor, not merely one of them. */
const merged = dedupeRuns([
  at("gpx-2026-08-18", "2026-08-18T17:00:00-07:00", { averageHeartrate: undefined }),
  at("hae-2026-08-18", "2026-08-18T17:02:00-07:00"),
]);
const keptHr = merged.length === 1 && merged[0].averageHeartrate === 147;
if (!keptHr) failed++;
console.log(`${keptHr ? "ok  " : "FAIL"}  the copy carrying heart rate wins`);

console.log(failed ? `\n${failed} failing` : "\nall passing");
process.exit(failed ? 1 : 0);
