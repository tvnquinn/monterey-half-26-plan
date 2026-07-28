/**
 * Backtest harness.
 *
 *   npx tsx scripts/backtest.mts            # seed data
 *   npx tsx scripts/backtest.mts runs.json  # a runs export
 *
 * Three things get checked:
 *   1. Pace model, walk-forward, old (7-feature OLS) vs new (ridge + gating)
 *   2. Half-marathon estimator on synthetic athletes with a known answer
 *   3. Goal-odds behaviour as the race approaches
 */
import { readFileSync } from "fs";
import {
  buildEfficacyPoints,
  backtestEfficacy,
  fitRidge,
  type EfficacyPoint,
} from "../src/lib/efficacy";
import { estimateHalf } from "../src/lib/fitness";
import {
  buildPredictionSummary,
  parseTimeToSec,
  type TrainingSignal,
} from "../src/lib/predictions";
import { seedRuns } from "../src/lib/seed-runs";
import type { RunActivity, TrainingPlan } from "../src/lib/types";

const plan = JSON.parse(readFileSync("data/plan.json", "utf8")) as TrainingPlan;
const priorHalfSec = parseTimeToSec(plan.athlete.priorHalf);

const arg = process.argv[2];
const runs: RunActivity[] = arg
  ? (JSON.parse(readFileSync(arg, "utf8")) as RunActivity[])
  : seedRuns;

const pace = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const clock = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(
    Math.round(s % 60),
  ).padStart(2, "0")}`;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

function rule(title: string) {
  console.log(`\n${"─".repeat(74)}\n${title}\n${"─".repeat(74)}`);
}

// ---------------------------------------------------------------------------
// 1. Pace model: old vs new
// ---------------------------------------------------------------------------

/** The previous model, verbatim in behaviour: 7 features, plain OLS, no gate. */
function oldFeatures(p: EfficacyPoint, includeHr: boolean, hrImpute: number) {
  return [
    1,
    p.distanceMi,
    p.miles7d,
    p.miles14d,
    p.daysSincePrev ?? 3,
    p.elevFtPerMi,
    includeHr ? p.averageHeartrate || hrImpute : 0,
  ];
}

function oldFitOLS(X: number[][], y: number[]): number[] {
  const n = y.length;
  const p = X[0].length;
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const XtY = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      XtY[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  const A = XtX.map((row, i) => [...row, XtY[i]]);
  for (let col = 0; col < p; col++) {
    let pivot = col;
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const div = A[col][col] || 1e-9;
    for (let c = col; c <= p; c++) A[col][c] /= div;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let c = col; c <= p; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[p]);
}

function walkForwardOld(points: EfficacyPoint[]) {
  const hrAll = points
    .map((p) => p.averageHeartrate)
    .filter((v): v is number => typeof v === "number");
  const includeHr = hrAll.length >= 3;
  const minTrain = Math.max(4, Math.floor(points.length * 0.4)); // old gate: 4
  const errs: number[] = [];
  const baseErrs: number[] = [];
  const coefMagnitudes: number[] = [];

  for (let i = minTrain; i < points.length; i++) {
    const train = points.slice(0, i);
    const test = points[i];
    const trainHr = train
      .map((p) => p.averageHeartrate)
      .filter((v): v is number => typeof v === "number");
    const useHr = includeHr && trainHr.length >= 3;
    const impute = trainHr.length ? mean(trainHr) : 143;
    const y = train.map((p) => p.paceSecPerMi);
    const beta = oldFitOLS(
      train.map((p) => oldFeatures(p, useHr, impute)),
      y,
    );
    coefMagnitudes.push(Math.max(...beta.map(Math.abs)));
    const x = oldFeatures(test, useHr, impute);
    let pred = 0;
    for (let k = 0; k < beta.length; k++) pred += beta[k] * x[k];
    const clamped = Math.min(
      Math.max(...y) + 45,
      Math.max(Math.min(...y) - 45, pred),
    );
    errs.push(Math.abs(clamped - test.paceSecPerMi));
    baseErrs.push(Math.abs(test.paceSecPerMi - mean(y)));
  }
  return {
    mae: mean(errs),
    baseline: mean(baseErrs),
    skill: 1 - mean(errs) / mean(baseErrs),
    worstCoef: Math.max(...coefMagnitudes),
    n: errs.length,
  };
}

rule("1. PACE MODEL — walk-forward, old (OLS x7) vs new (ridge + gating)");

const { points, excludedOutliers } = buildEfficacyPoints(runs);
console.log(
  `Runs: ${runs.length} · clean points: ${points.length} · excluded outliers: ${excludedOutliers}`,
);
console.log(
  `HR-tagged: ${points.filter((p) => p.averageHeartrate).length} · observed pace range ${pace(
    Math.min(...points.map((p) => p.paceSecPerMi)),
  )}–${pace(Math.max(...points.map((p) => p.paceSecPerMi)))}/mi`,
);

const oldRes = walkForwardOld(points);
const newRes = backtestEfficacy(runs);

console.log(`
                          OLD          NEW
MAE (s/mi)          ${oldRes.mae.toFixed(1).padStart(9)}    ${newRes.maeSec.toFixed(1).padStart(9)}
Baseline MAE        ${oldRes.baseline.toFixed(1).padStart(9)}    ${newRes.baselineMaeSec.toFixed(1).padStart(9)}
Skill score         ${oldRes.skill.toFixed(3).padStart(9)}    ${newRes.skillScore.toFixed(3).padStart(9)}
Held-out preds      ${String(oldRes.n).padStart(9)}    ${String(newRes.predictions.length).padStart(9)}
Largest |coef|      ${oldRes.worstCoef.toExponential(1).padStart(9)}      ridge-bounded`);

console.log(`\nNew verdict: ${newRes.verdict}`);
newRes.limitations.forEach((l) => console.log(`  · ${l}`));

if (newRes.predictions.length) {
  console.log("\nHeld-out predictions (new):");
  for (const p of newRes.predictions) {
    console.log(
      `  ${p.date}  actual ${pace(p.actualPace)}  pred ${pace(p.predictedPace)}  err ${
        p.errorSec >= 0 ? "+" : ""
      }${Math.round(p.errorSec)}s`,
    );
  }
}

rule("1b. CONDITIONING — slope magnitudes (intercept excluded) by sample size");
console.log("Runaway slopes are the signature of a singular fit.\n");
console.log(" n    old params   old max|slope|    new params   new max|slope|");
for (const n of [4, 6, 8, 12]) {
  if (points.length < n) continue;
  const sub = points.slice(0, n);
  const hr = sub
    .map((p) => p.averageHeartrate)
    .filter((v): v is number => typeof v === "number");
  const impute = hr.length ? mean(hr) : 143;
  const oldBeta = oldFitOLS(
    sub.map((p) => oldFeatures(p, hr.length >= 3, impute)),
    sub.map((p) => p.paceSecPerMi),
  );
  const oldSlopes = Math.max(...oldBeta.slice(1).map(Math.abs));

  const keys: ("distance" | "hr")[] = hr.length >= 3 && n >= 8 ? ["distance", "hr"] : ["distance"];
  const ridge = fitRidge(sub, keys, impute);
  const newSlopes = Math.max(...ridge.beta.slice(1).map(Math.abs));

  console.log(
    `${String(n).padStart(2)}    ${String(7).padStart(10)}   ${oldSlopes
      .toExponential(2)
      .padStart(13)}    ${String(keys.length + 1).padStart(10)}   ${newSlopes
      .toExponential(2)
      .padStart(13)}`,
  );
}

// ---------------------------------------------------------------------------
// 2. Half estimator on synthetic athletes with a known answer
// ---------------------------------------------------------------------------
rule("2. HALF ESTIMATOR — synthetic athletes with known ground truth");

function synth(opts: {
  weeks: number;
  startPace: number;
  gainPerWeek: number;
  hr: number;
  distanceMi: number;
  runsPerWeek: number;
  endDate: string;
}): RunActivity[] {
  const out: RunActivity[] = [];
  const end = new Date(`${opts.endDate}T12:00:00Z`);
  let i = 0;
  for (let w = opts.weeks - 1; w >= 0; w--) {
    for (let r = 0; r < opts.runsPerWeek; r++) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - (w * 7 + r * 2));
      const elapsedWeeks = opts.weeks - 1 - w;
      const p = opts.startPace * Math.pow(1 - opts.gainPerWeek, elapsedWeeks);
      out.push({
        id: `syn-${i++}`,
        source: "seed",
        name: "synthetic",
        startDate: d.toISOString(),
        distanceMi: opts.distanceMi,
        movingTimeSec: Math.round(p * opts.distanceMi),
        elapsedTimeSec: Math.round(p * opts.distanceMi),
        paceSecPerMi: Math.round(p),
        elevationFt: 40 * opts.distanceMi,
        averageHeartrate: opts.hr,
      });
    }
  }
  return out;
}

const asOf = new Date("2026-07-28T19:00:00Z");
const scenarios = [
  { name: "Flat — no fitness change", gain: 0 },
  { name: "Improving 0.5%/wk at fixed HR", gain: 0.005 },
  { name: "Improving 1.0%/wk at fixed HR", gain: 0.01 },
  { name: "Detraining 0.5%/wk", gain: -0.005 },
];

console.log(`Prior half ${clock(priorHalfSec)} · 10 weeks × 4 runs/wk, 5 mi at HR 145\n`);
console.log("scenario                            est half    Δ vs prior   method      conf");
for (const s of scenarios) {
  const r = synth({
    weeks: 10,
    startPace: 760,
    gainPerWeek: s.gain,
    hr: 145,
    distanceMi: 5,
    runsPerWeek: 4,
    endDate: "2026-07-28",
  });
  const est = estimateHalf({ runs: r, plan, priorHalfSec, asOf, weeklyMi: 20 });
  const delta = est.sec != null ? (est.sec - priorHalfSec) / 60 : 0;
  console.log(
    s.name.padEnd(35) +
      clock(est.sec ?? 0).padStart(9) +
      ((delta >= 0 ? "+" : "") + delta.toFixed(1) + "m").padStart(13) +
      "   " +
      est.method.padEnd(12) +
      est.confidence,
  );
}

rule("2b. SENSITIVITY — one fluke run, old estimator vs new");

function oldEstimate(rs: RunActivity[], weeklyMi: number): number {
  const best = Math.min(...rs.filter((r) => r.distanceMi >= 4).map((r) => r.paceSecPerMi));
  const longest = Math.max(...rs.map((r) => r.distanceMi));
  let racePace = best * 0.78;
  if (weeklyMi < 15) racePace *= 1.06;
  if (weeklyMi >= 22) racePace *= 0.98;
  if (longest < 8) racePace *= 1.04;
  if (longest >= 10) racePace *= 0.99;
  return Math.round(racePace * 13.1);
}

const base = synth({
  weeks: 10,
  startPace: 760,
  gainPerWeek: 0,
  hr: 145,
  distanceMi: 5,
  runsPerWeek: 4,
  endDate: "2026-07-28",
});
const withFluke: RunActivity[] = [
  ...base,
  {
    id: "fluke",
    source: "manual",
    name: "downhill tailwind",
    startDate: "2026-07-26T15:00:00Z",
    distanceMi: 4.2,
    movingTimeSec: Math.round(600 * 4.2),
    elapsedTimeSec: Math.round(600 * 4.2),
    paceSecPerMi: 600,
    elevationFt: 10,
    averageHeartrate: 149,
  },
];

const oldA = oldEstimate(base, 20);
const oldB = oldEstimate(withFluke, 20);
const newA = estimateHalf({ runs: base, plan, priorHalfSec, asOf, weeklyMi: 20 }).sec!;
const newB = estimateHalf({ runs: withFluke, plan, priorHalfSec, asOf, weeklyMi: 20 }).sec!;

console.log(`Add one 10:00/mi run to 40 steady 12:40/mi runs:
  OLD  ${clock(oldA)} → ${clock(oldB)}   moved ${((oldB - oldA) / 60).toFixed(1)} min
  NEW  ${clock(newA)} → ${clock(newB)}   moved ${((newB - newA) / 60).toFixed(1)} min`);

rule("2c. TAPER — a planned volume drop must not read as detraining");

// Same 14-week block. One athlete keeps hammering; the other tapers correctly.
const block = synth({
  weeks: 14,
  startPace: 775,
  gainPerWeek: 0.004,
  hr: 145,
  distanceMi: 6,
  runsPerWeek: 4,
  endDate: "2026-07-14",
});
const longRun = (dateISO: string, mi: number, id: string): RunActivity => ({
  id,
  source: "seed",
  name: "long",
  startDate: dateISO,
  distanceMi: mi,
  movingTimeSec: Math.round(795 * mi),
  elapsedTimeSec: Math.round(795 * mi),
  paceSecPerMi: 795,
  elevationFt: 40 * mi,
  averageHeartrate: 146,
});
block.push(longRun("2026-07-10T14:00:00Z", 10, "peak-long"));

const keptHammering = [
  ...block,
  ...synth({
    weeks: 2,
    startPace: 748,
    gainPerWeek: 0,
    hr: 145,
    distanceMi: 6,
    runsPerWeek: 4,
    endDate: "2026-07-28",
  }).map((r, i) => ({ ...r, id: `hammer-${i}` })),
];
const tapered = [
  ...block,
  ...synth({
    weeks: 2,
    startPace: 748,
    gainPerWeek: 0,
    hr: 145,
    distanceMi: 3,
    runsPerWeek: 3,
    endDate: "2026-07-28",
  }).map((r, i) => ({ ...r, id: `taper-${i}` })),
];

const hammerEst = estimateHalf({ runs: keptHammering, plan, priorHalfSec, asOf, weeklyMi: 24 });
const taperEst = estimateHalf({ runs: tapered, plan, priorHalfSec, asOf, weeklyMi: 9 });
console.log(`Identical 14-week block, different final two weeks:
  Kept hammering (24 mi/wk)  est ${clock(hammerEst.sec ?? 0)}   conf ${hammerEst.confidence}
  Tapered (9 mi/wk)          est ${clock(taperEst.sec ?? 0)}   conf ${taperEst.confidence}
  Taper penalty: ${(((taperEst.sec ?? 0) - (hammerEst.sec ?? 0)) / 60).toFixed(1)} min`);
console.log(`  ${taperEst.basis.find((b) => b.includes("built volume")) ?? ""}`);

// ---------------------------------------------------------------------------
// 3. Goal odds behaviour
// ---------------------------------------------------------------------------
rule("3. GOAL ODDS — response to time remaining and adherence");

function oddsRow(label: string, daysToRace: number, adherence: number, weeklyMi: number) {
  const signal: TrainingSignal = {
    adherence,
    avgWeeklyMi4: weeklyMi,
    longestMi28: weeklyMi >= 22 ? 10 : 6,
    weeksRemaining: daysToRace / 7,
  };
  const est = estimateHalf({ runs, plan, priorHalfSec, asOf, weeklyMi });
  const p = buildPredictionSummary({
    plan,
    runs,
    estimatedHalfSec: est.sec,
    confidence: est.confidence,
    signal,
    daysToRace,
    asOf,
  });
  const pcts = p.goals.map((g) => `${g.label.padEnd(2)} ${String(g.pct).padStart(2)}%`).join("  ");
  console.log(
    label.padEnd(36) +
      `proj ${clock(p.projectedSec)}  ±${String(p.sigmaMin).padStart(4)}m   ${pcts}`,
  );
}

console.log("Same fitness, varying adherence — credit is earned, not granted:\n");
oddsRow("103d out, full adherence, 20 mi/wk", 103, 1.0, 20);
oddsRow("103d out, 60% adherence, 12 mi/wk", 103, 0.6, 12);
oddsRow("103d out, stopped running", 103, 0.0, 0);

// A season where fitness actually moves. Holding `runs` fixed while the clock
// runs down only shrinks the remaining-improvement term, which reads as decay;
// the real trajectory has EF improving underneath it.
rule("3b. FULL SEASON — fitness improving 0.4%/wk alongside the calendar");
console.log("");
const season = [
  { label: "Aug · 103d out", days: 103, weeksTrained: 4, weeklyMi: 17, longest: 7 },
  { label: "Sep · 60d out", days: 60, weeksTrained: 10, weeklyMi: 21, longest: 9 },
  { label: "Oct · 30d out", days: 30, weeksTrained: 14, weeklyMi: 24, longest: 9 },
  { label: "Late Oct · 14d out", days: 14, weeksTrained: 16, weeklyMi: 26, longest: 10 },
  { label: "Race day", days: 0, weeksTrained: 18, weeklyMi: 20, longest: 10 },
];

for (const s of season) {
  const checkpoint = new Date(asOf.getTime() + (103 - s.days) * 86_400_000);
  const hist = synth({
    weeks: s.weeksTrained,
    startPace: 770,
    gainPerWeek: 0.004,
    hr: 145,
    distanceMi: 5,
    runsPerWeek: 4,
    endDate: checkpoint.toISOString().slice(0, 10),
  });
  // One long run per week so durability is represented.
  hist.push({
    id: "long-recent",
    source: "seed",
    name: "long",
    startDate: new Date(checkpoint.getTime() - 3 * 86_400_000).toISOString(),
    distanceMi: s.longest,
    movingTimeSec: Math.round(790 * s.longest),
    elapsedTimeSec: Math.round(790 * s.longest),
    paceSecPerMi: 790,
    elevationFt: 40 * s.longest,
    averageHeartrate: 146,
  });

  const est = estimateHalf({
    runs: hist,
    plan,
    priorHalfSec,
    asOf: checkpoint,
    weeklyMi: s.weeklyMi,
  });
  const p = buildPredictionSummary({
    plan,
    runs: hist,
    estimatedHalfSec: est.sec,
    confidence: est.confidence,
    signal: {
      adherence: 1,
      avgWeeklyMi4: s.weeklyMi,
      longestMi28: s.longest,
      weeksRemaining: s.days / 7,
    },
    daysToRace: s.days,
    asOf: checkpoint,
  });
  const pcts = p.goals.map((g) => `${g.label.padEnd(2)} ${String(g.pct).padStart(2)}%`).join("  ");
  console.log(
    s.label.padEnd(22) +
      `est ${clock(est.sec ?? 0)}  proj ${clock(p.projectedSec)}  ±${String(p.sigmaMin).padStart(4)}m  ${est.confidence.padEnd(7)}${pcts}`,
  );
}
console.log("");
