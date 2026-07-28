import { readFileSync } from "fs";
import { backtestEfficacy } from "../src/lib/efficacy";

const j = JSON.parse(readFileSync("/tmp/coach.json", "utf8"));
const result = backtestEfficacy(j.runs);
console.log(
  JSON.stringify(
    {
      usableRuns: result.usableRuns,
      hrTaggedRuns: result.hrTaggedRuns,
      excludedOutliers: result.excludedOutliers,
      maeSec: Math.round(result.maeSec),
      baselineMaeSec: Math.round(result.baselineMaeSec),
      skillScore: Number(result.skillScore.toFixed(3)),
      mapePct: Number((result.meanAbsPctError * 100).toFixed(1)),
      hrPaceCorrelation: result.hrPaceCorrelation,
      verdict: result.verdict,
      limitations: result.limitations,
      nextRunHint: result.nextRunHint,
      predictions: result.predictions.map((p) => ({
        date: p.date,
        actual: p.actualPace,
        pred: Math.round(p.predictedPace),
        err: Math.round(p.errorSec),
      })),
    },
    null,
    2,
  ),
);
