import { readFileSync } from "fs";
import { estimateHalf } from "../src/lib/fitness";
import { buildPredictionSummary, parseTimeToSec } from "../src/lib/predictions";
import { seedRuns } from "../src/lib/seed-runs";
import type { TrainingPlan } from "../src/lib/types";

const plan = JSON.parse(readFileSync("data/plan.json", "utf8")) as TrainingPlan;
const clock = (s: number) => `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(Math.round(s%60)).padStart(2,"0")}`;
const p = (s: number) => `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;

console.log("═".repeat(76));
console.log("OUT-OF-SAMPLE VALIDATION — predict a half he actually ran");
console.log("═".repeat(76));

// Ground truth: 2025-06-22, 13.15 mi in 2:15:56.
// Feed the model ONLY what existed before that date, and only a prior anchor
// that predates the block (his first-ever half is the 6/8 run, 2:20:41).
const TRUTH = 2 * 3600 + 15 * 60 + 56;
const cutoffs = [
  { label: "as of 2025-06-07 (before ANY half)", date: "2025-06-07", anchor: null },
  { label: "as of 2025-06-21 (after the 6/8 half)", date: "2025-06-21", anchor: 2*3600+20*60+41 },
];

for (const c of cutoffs) {
  const asOf = new Date(`${c.date}T20:00:00-07:00`);
  const runs = seedRuns.filter((r) => r.startDate.slice(0, 10) <= c.date);
  const weeklyMi = runs.filter(r => {
    const d = (asOf.getTime() - new Date(r.startDate).getTime()) / 86400000;
    return d >= 0 && d <= 28;
  }).reduce((s, r) => s + r.distanceMi, 0) / 4;

  // Without a prior half, the only honest anchor is a Riegel off his longest run.
  const longest = runs.reduce((m, r) => r.distanceMi > m.distanceMi ? r : m, runs[0]);
  const anchor = c.anchor ?? Math.round(longest.movingTimeSec * Math.pow(13.1 / longest.distanceMi, 1.06));

  const est = estimateHalf({ runs, plan, priorHalfSec: anchor, asOf, weeklyMi });
  const errMin = ((est.sec ?? 0) - TRUTH) / 60;
  console.log(`\n${c.label}`);
  console.log(`  runs available: ${runs.length} · ${weeklyMi.toFixed(1)} mi/wk · longest ${longest.distanceMi} mi`);
  console.log(`  anchor:    ${clock(anchor)}${c.anchor ? " (his 6/8 half)" : ` (Riegel off ${longest.distanceMi} mi)`}`);
  console.log(`  PREDICTED: ${clock(est.sec ?? 0)}   method ${est.method} · ${est.confidence} confidence`);
  console.log(`  ACTUAL:    ${clock(TRUTH)} on 2025-06-22`);
  console.log(`  ERROR:     ${errMin >= 0 ? "+" : ""}${errMin.toFixed(1)} min  (${(Math.abs(errMin)*60/TRUTH*100).toFixed(1)}%)`);
  est.basis.forEach(b => console.log(`    · ${b}`));
}

console.log("\n" + "═".repeat(76));
console.log("CURRENT STATE — 2026-07-28, on real data");
console.log("═".repeat(76));

const asOf = new Date("2026-07-28T20:00:00-07:00");
const priorHalfSec = parseTimeToSec(plan.athlete.priorHalf);
const last28 = seedRuns.filter(r => {
  const d = (asOf.getTime() - new Date(r.startDate).getTime()) / 86400000;
  return d >= 0 && d <= 28;
});
const weeklyMi = last28.reduce((s, r) => s + r.distanceMi, 0) / 4;
const est = estimateHalf({ runs: seedRuns, plan, priorHalfSec, asOf, weeklyMi });
console.log(`\nlast 28d: ${last28.length} runs · ${weeklyMi.toFixed(1)} mi/wk`);
console.log(`estimate: ${clock(est.sec ?? 0)}  method ${est.method} · ${est.confidence} confidence`);
est.basis.forEach(b => console.log(`  · ${b}`));

const pred = buildPredictionSummary({
  plan, runs: seedRuns, estimatedHalfSec: est.sec, confidence: est.confidence,
  signal: { adherence: 1, avgWeeklyMi4: weeklyMi, longestMi28: Math.max(...last28.map(r=>r.distanceMi)), weeksRemaining: 103/7 },
  daysToRace: 103, asOf,
});
console.log(`\nprojection ${clock(pred.projectedSec)} ±${pred.sigmaMin}m (credit ${pred.creditSec}s)`);
console.log("odds:  " + pred.goals.map(g => `${g.label} ${g.timeLabel} ${g.pct}%`).join("   "));

console.log("\n" + "═".repeat(76));
console.log("MONTHLY PACE TREND (real)");
console.log("═".repeat(76));
const months = [...new Set(seedRuns.map(r => r.startDate.slice(0,7)))].sort();
for (const m of months) {
  const rs = seedRuns.filter(r => r.startDate.startsWith(m));
  const mi = rs.reduce((s,r)=>s+r.distanceMi,0);
  const sec = rs.reduce((s,r)=>s+r.movingTimeSec,0);
  const bar = "█".repeat(Math.round(mi / 2));
  console.log(`${m}  ${String(rs.length).padStart(2)} runs  ${mi.toFixed(1).padStart(5)} mi  ${p(sec/mi)}/mi  ${bar}`);
}
