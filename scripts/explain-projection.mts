import { readFileSync } from "fs";
import { estimateHalf } from "../src/lib/fitness";
import { buildPredictionSummary, parseTimeToSec, type TrainingSignal } from "../src/lib/predictions";
import { seedRuns } from "../src/lib/seed-runs";
import type { TrainingPlan } from "../src/lib/types";

const plan = JSON.parse(readFileSync("data/plan.json","utf8")) as TrainingPlan;
const asOf = new Date("2026-07-28T20:00:00-07:00");
const prior = parseTimeToSec(plan.athlete.priorHalf);
const clock = (s:number)=>`${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(Math.round(s%60)).padStart(2,"0")}`;

const last28 = seedRuns.filter(r=>{const d=(asOf.getTime()-new Date(r.startDate).getTime())/86400000;return d>=0&&d<=28;});
const weeklyMi = last28.reduce((s,r)=>s+r.distanceMi,0)/4;
const est = estimateHalf({runs:seedRuns, plan, priorHalfSec:prior, asOf, weeklyMi});

console.log("STEP 1 — CURRENT FITNESS  (what you'd run if the race were today)");
console.log(`  estimatedHalfSec = ${clock(est.sec!)}`);
console.log("  built from your logged runs + prior half, with Monterey's flat course");
console.log("  and 58F already applied. This is NOT 'a half in SF on hills today'.\n");

console.log("STEP 2 — BLEND WITH THE KNOWN RACE RESULT");
const w = 0.55; // medium confidence
console.log(`  ${clock(est.sec!)} x ${w}  +  ${clock(prior)} x ${(1-w).toFixed(2)}  =  ${clock(est.sec!*w + prior*(1-w))}`);
console.log("  (a real race is a better anchor than any inference off training)\n");

console.log("STEP 3 — SUBTRACT IMPROVEMENT YOU HAVE YET TO EARN");
for (const [label, adherence] of [["follow the plan fully",1.0],["70% of the plan",0.7],["stop running now",0.0]] as const) {
  const signal: TrainingSignal = { adherence, avgWeeklyMi4: adherence>0?weeklyMi:0, longestMi28: 8, weeksRemaining: 103/7 };
  const p = buildPredictionSummary({plan, runs:seedRuns, estimatedHalfSec:est.sec, confidence:est.confidence, signal, daysToRace:103, asOf});
  console.log(`  ${label.padEnd(24)} credit ${String(p.creditSec).padStart(4)}s  ->  RACE DAY ${clock(p.projectedSec)}   ${p.goals.map(g=>`${g.label} ${String(g.pct).padStart(2)}%`).join("  ")}`);
}
console.log("\n  The percentages come from RACE DAY, not from current fitness.");
console.log("  Right now adherence defaults to 1.0 because no plan week has finished yet —");
console.log("  so today's odds ASSUME you execute. That becomes measured, not assumed,");
console.log("  as soon as week 1 closes.");
