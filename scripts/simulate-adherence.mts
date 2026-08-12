/**
 * What does the model project if he completes X% of the plan's mileage?
 *
 *   npx tsx scripts/simulate-adherence.mts
 *
 * Synthesises the remaining sessions at a given fraction of target, assigns
 * each a heart rate appropriate to its session type, and improves efficiency
 * factor toward a race-day endpoint in proportion to the volume actually run.
 * Then asks buildCoachReport what it thinks, standing on race morning.
 */
import { readFileSync } from "fs";
import { buildCoachReport } from "../src/lib/coach";
import { seedRuns } from "../src/lib/seed-runs";
import type { RunActivity, TrainingPlan } from "../src/lib/types";

const plan = JSON.parse(readFileSync("data/plan.json", "utf8")) as TrainingPlan;
const TODAY = "2026-08-12";
const RACE = plan.race.date;
const clock = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Current efficiency factor, from his real Z2 runs. */
const EF_NOW = 0.0315;
/** Where a fully-executed block should land him — his Mar-2026 / 2025 level. */
const EF_FULL = 0.0335;

/**
 * 10K effort is run roughly 5% quicker than half-marathon effort. Without this
 * the simulation gave the tune-up the *same* pace as the race itself — a
 * 1:03:27 10K — and Riegel correctly read that as a 2:22 half, dragging the
 * projection down by five minutes. The tune-up looked like a penalty for
 * training more.
 */
const TUNE_UP_PACE_RATIO = 0.95;

const HR_BY_TYPE: Record<string, number> = {
  easy: 148,
  easy_strides: 148,
  long: 146,
  threshold: 160,
  quality: 165,
  race: 175,
};

function simulate(fraction: number): RunActivity[] {
  const future: RunActivity[] = [];
  const upcoming = plan.weeks
    .flatMap((w) => w.sessions)
    .filter(
      (s) =>
        s.date > TODAY &&
        s.date < RACE &&
        s.type !== "strength" &&
        s.type !== "rest" &&
        s.targetMi > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalDays = (new Date(RACE).getTime() - new Date(TODAY).getTime()) / 86_400_000;

  upcoming.forEach((s, i) => {
    // A tune-up race is run at race effort, and you either do it or you don't —
    // "80% of a 10K" is not a thing. Scaling it produced a discontinuity: at 80%
    // it shrank below the Riegel floor, vanished from the estimate, and made
    // less training look faster.
    const isTuneUp = /TUNE-UP/.test(s.notes ?? "");
    const progress =
      (new Date(s.date).getTime() - new Date(TODAY).getTime()) / 86_400_000 / totalDays;
    // Fitness gain accrues over the block, scaled by how much of it gets run.
    const ef = EF_NOW + (EF_FULL - EF_NOW) * fraction * progress;
    const hr = isTuneUp ? HR_BY_TYPE.race : (HR_BY_TYPE[s.type] ?? 148);
    const distanceMi = Number((s.targetMi * (isTuneUp ? 1 : fraction)).toFixed(2));
    const paceSecPerMi = Math.round(
      (3600 / (ef * hr)) * (isTuneUp ? TUNE_UP_PACE_RATIO : 1),
    );
    const movingTimeSec = Math.round(paceSecPerMi * distanceMi);
    future.push({
      id: `sim-${i}-${s.date}`,
      source: "manual",
      name: "Simulated",
      startDate: `${s.date}T09:00:00-07:00`,
      distanceMi,
      movingTimeSec,
      elapsedTimeSec: movingTimeSec,
      paceSecPerMi,
      elevationFt: Math.round(40 * distanceMi),
      averageHeartrate: hr,
    });
  });
  return [...seedRuns, ...future];
}

const raceMorning = new Date(`${RACE}T07:00:00-08:00`);
const plannedTotal = plan.weeks
  .flatMap((w) => w.sessions)
  .filter((s) => s.date > TODAY && s.date < RACE && s.type !== "strength" && s.targetMi > 0)
  .reduce((n, s) => n + s.targetMi, 0);

console.log(`Remaining planned mileage from ${TODAY}: ${plannedTotal.toFixed(0)} mi\n`);
console.log("plan run   miles    est        race-day proj   A    A-    B     C");
console.log("─".repeat(74));

for (const f of [1.0, 0.9, 0.8, 0.6]) {
  const runs = simulate(f);
  const rep = buildCoachReport(plan, runs, raceMorning);
  const p = rep.predictions;
  const odds = p.goals.map((g) => `${String(g.pct).padStart(3)}%`).join(" ");
  console.log(
    `${String(Math.round(f * 100)).padStart(4)}%   ${(plannedTotal * f).toFixed(0).padStart(5)}   ` +
      `${clock(p.estimatedHalfSec!)}    ${clock(p.projectedSec)}       ${odds}`,
  );
}

console.log("\nFor reference — stop training entirely from today:");
const rep = buildCoachReport(plan, seedRuns, raceMorning);
console.log(
  `   0%       0   ${clock(rep.predictions.estimatedHalfSec!)}    ${clock(rep.predictions.projectedSec)}       ` +
    rep.predictions.goals.map((g) => `${String(g.pct).padStart(3)}%`).join(" "),
);
