/**
 * Does normalising efficiency factor for heart rate earn its place?
 *
 *   npx tsx scripts/hr-confound-check.mts
 *
 * Two questions, both measured rather than argued:
 *   1. With a known-zero trend and realistic HR drift, how much phantom decline
 *      does the uncorrected fit report?
 *   2. Does correcting damage recovery of a trend that is genuinely there?
 */
import { readFileSync } from "fs";
import type { RunActivity, TrainingPlan } from "../src/lib/types";

const plan = JSON.parse(readFileSync("data/plan.json", "utf8")) as TrainingPlan;
const z2 = plan.paceGuidance.hrZones!.z2;
const asOf = new Date("2026-08-16T20:00:00-07:00");

function fit(runs: RunActivity[], hrCoef: number) {
  const pts = runs.filter(
    (r) => r.averageHeartrate! >= z2.min - 6 && r.averageHeartrate! <= z2.max + 4,
  );
  const xs = pts.map(
    (p) => -(asOf.getTime() - new Date(p.startDate).getTime()) / 86400000 / 7,
  );
  const ys = pts.map((p) => {
    const ef = 3600 / p.paceSecPerMi / p.averageHeartrate!;
    return Math.log(ef) + hrCoef * (145 - p.averageHeartrate!);
  });
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = num / den;
  const span = Math.max(...xs) - Math.min(...xs);
  return { slope, delta: Math.exp(slope * span) - 1 };
}

/** Constant or trending fitness, with heart rate drifting upward over the block. */
function synth(gainPerWeek: number, hrDriftPerStep: number): RunActivity[] {
  const out: RunActivity[] = [];
  let i = 0;
  for (let w = 14; w >= 0; w--) {
    for (let r = 0; r < 3; r++) {
      const d = new Date(asOf);
      d.setUTCDate(d.getUTCDate() - (w * 7 + r * 2));
      const elapsed = 14 - w;
      const hr = Math.round(142 + hrDriftPerStep * elapsed);
      const ef = 0.033 * Math.pow(1 + gainPerWeek, elapsed) * Math.exp(-0.0036 * (hr - 145));
      const pace = Math.round(3600 / (ef * hr));
      out.push({
        id: `s${i++}`, source: "manual", name: "s", startDate: d.toISOString(),
        distanceMi: 5, movingTimeSec: Math.round(pace * 5), elapsedTimeSec: Math.round(pace * 5),
        paceSecPerMi: pace, elevationFt: 200, averageHeartrate: hr,
      });
    }
  }
  return out;
}

const ANCHOR = 8151;
console.log("PHANTOM DECLINE — truth is 0.0% fitness change, HR drifts +0.8 bpm/wk\n");
console.log("  correction        reported trend    race-time error");
for (const [label, k] of [["off", 0], ["on (-0.36%/bpm)", -0.0036]] as [string, number][]) {
  const r = fit(synth(0, 0.8), k);
  console.log(`  ${label.padEnd(17)} ${(r.delta * 100).toFixed(2).padStart(7)}%        ${(r.delta * 0.7 * ANCHOR / 60).toFixed(2).padStart(6)} min`);
}

console.log("\nREAL TREND — truth is +0.50%/wk, same HR drift\n");
console.log("  correction        recovered slope");
for (const [label, k] of [["off", 0], ["on (-0.36%/bpm)", -0.0036]] as [string, number][]) {
  const r = fit(synth(0.005, 0.8), k);
  console.log(`  ${label.padEnd(17)} ${(r.slope * 100).toFixed(2).padStart(6)}%/wk`);
}
