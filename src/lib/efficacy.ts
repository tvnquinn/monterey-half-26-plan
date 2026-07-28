import type { RunActivity } from "./types";

export interface EfficacyPoint {
  id: string;
  date: string;
  distanceMi: number;
  paceSecPerMi: number;
  averageHeartrate?: number;
  daysSincePrev: number | null;
  miles7d: number;
  miles14d: number;
  efficiency?: number; // mi/hr per bpm approx, higher = more economical
}

export interface BacktestPrediction {
  id: string;
  date: string;
  actualPace: number;
  predictedPace: number;
  errorSec: number;
  actualHr?: number;
  predictedPaceAtHr?: number;
}

export interface EfficacyBacktest {
  usableRuns: number;
  hrTaggedRuns: number;
  excludedOutliers: number;
  maeSec: number;
  baselineMaeSec: number;
  skillScore: number; // 1 - mae/baseline; >0 beats naive mean
  meanAbsPctError: number;
  hrPaceCorrelation: number | null;
  predictions: BacktestPrediction[];
  verdict: string;
  limitations: string[];
  nextRunHint: string;
}

function isOutlierPace(pace: number): boolean {
  // Keep plausible easy/steady training paces; drop GPS glitches / all-out anomalies for this model
  return pace < 540 || pace > 960; // 9:00 to 16:00 /mi
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(dayKey(b)).getTime() - new Date(dayKey(a)).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export function buildEfficacyPoints(runs: RunActivity[]): {
  points: EfficacyPoint[];
  excludedOutliers: number;
} {
  const sorted = [...runs]
    .filter((r) => r.distanceMi >= 1 && r.paceSecPerMi > 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  let excludedOutliers = 0;
  const cleaned: RunActivity[] = [];
  for (const r of sorted) {
    if (isOutlierPace(r.paceSecPerMi)) {
      excludedOutliers += 1;
      continue;
    }
    cleaned.push(r);
  }

  const points: EfficacyPoint[] = cleaned.map((r, idx) => {
    const prev = idx > 0 ? cleaned[idx - 1] : null;
    const miles7d = cleaned
      .slice(0, idx)
      .filter((x) => daysBetween(x.startDate, r.startDate) <= 7)
      .reduce((s, x) => s + x.distanceMi, 0);
    const miles14d = cleaned
      .slice(0, idx)
      .filter((x) => daysBetween(x.startDate, r.startDate) <= 14)
      .reduce((s, x) => s + x.distanceMi, 0);

    const efficiency =
      r.averageHeartrate && r.averageHeartrate > 0
        ? 3600 / r.paceSecPerMi / r.averageHeartrate
        : undefined;

    return {
      id: r.id,
      date: dayKey(r.startDate),
      distanceMi: r.distanceMi,
      paceSecPerMi: r.paceSecPerMi,
      averageHeartrate: r.averageHeartrate,
      daysSincePrev: prev ? daysBetween(prev.startDate, r.startDate) : null,
      miles7d,
      miles14d,
      efficiency,
    };
  });

  return { points, excludedOutliers };
}

function mean(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/** Ordinary least squares for y ~ b0 + b·x */
function fitOLS(X: number[][], y: number[]): number[] {
  const n = y.length;
  const p = X[0].length;
  // Build XtX and XtY
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const XtY = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      XtY[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  // Gaussian elimination
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

function features(p: EfficacyPoint, includeHr: boolean): number[] {
  const base = [
    1,
    p.distanceMi,
    p.miles7d,
    p.miles14d,
    p.daysSincePrev ?? 3,
  ];
  if (includeHr) base.push(p.averageHeartrate || 0);
  return base;
}

function predictPace(beta: number[], p: EfficacyPoint, includeHr: boolean): number {
  const x = features(p, includeHr);
  let y = 0;
  for (let i = 0; i < beta.length; i++) y += beta[i] * x[i];
  return y;
}

export function backtestEfficacy(runs: RunActivity[]): EfficacyBacktest {
  const { points, excludedOutliers } = buildEfficacyPoints(runs);
  const hrTaggedRuns = points.filter((p) => p.averageHeartrate).length;
  const limitations: string[] = [];

  if (points.length < 6) {
    return {
      usableRuns: points.length,
      hrTaggedRuns,
      excludedOutliers,
      maeSec: 0,
      baselineMaeSec: 0,
      skillScore: 0,
      meanAbsPctError: 0,
      hrPaceCorrelation: null,
      predictions: [],
      verdict: "Not enough clean runs yet for a reliable backtest (need ~8+).",
      limitations: ["Import more runs with distance + pace (and HR when possible)."],
      nextRunHint: "Keep logging easy runs; model quality rises quickly after ~10 HR-tagged sessions.",
    };
  }

  const includeHr = hrTaggedRuns >= 5;
  if (!includeHr) {
    limitations.push(
      "Most runs are missing average HR, so this backtest predicts pace from mileage/recency/distance only. Add HR via screenshots or Health exports to unlock true HR→pace efficacy.",
    );
  }

  const hrPts = points.filter((p) => p.averageHeartrate);
  const hrPaceCorrelation = pearson(
    hrPts.map((p) => p.averageHeartrate as number),
    hrPts.map((p) => p.paceSecPerMi),
  );

  // Walk-forward: train on all prior points, predict next
  const minTrain = Math.max(4, Math.floor(points.length * 0.4));
  const predictions: BacktestPrediction[] = [];

  for (let i = minTrain; i < points.length; i++) {
    const train = points.slice(0, i);
    const test = points[i];
    const useHr = includeHr && Boolean(test.averageHeartrate);
    const trainX = train
      .filter((p) => !useHr || p.averageHeartrate)
      .map((p) => features(p, useHr));
    const trainY = train
      .filter((p) => !useHr || p.averageHeartrate)
      .map((p) => p.paceSecPerMi);
    if (trainX.length < 4) continue;
    const beta = fitOLS(trainX, trainY);
    const predictedPace = predictPace(beta, test, useHr);
    predictions.push({
      id: test.id,
      date: test.date,
      actualPace: test.paceSecPerMi,
      predictedPace,
      errorSec: predictedPace - test.paceSecPerMi,
      actualHr: test.averageHeartrate,
      predictedPaceAtHr: useHr ? predictedPace : undefined,
    });
  }

  if (!predictions.length) {
    return {
      usableRuns: points.length,
      hrTaggedRuns,
      excludedOutliers,
      maeSec: 0,
      baselineMaeSec: 0,
      skillScore: 0,
      meanAbsPctError: 0,
      hrPaceCorrelation,
      predictions: [],
      verdict: "Backtest window too short after filtering.",
      limitations,
      nextRunHint: "Log a few more consistent easy runs.",
    };
  }

  const maeSec =
    predictions.reduce((s, p) => s + Math.abs(p.errorSec), 0) / predictions.length;

  // Baseline: predict training-mean pace
  let baselineSum = 0;
  for (let i = 0; i < predictions.length; i++) {
    const trainIdx = points.findIndex((p) => p.id === predictions[i].id);
    const trainPaces = points.slice(0, trainIdx).map((p) => p.paceSecPerMi);
    const m = mean(trainPaces);
    baselineSum += Math.abs(predictions[i].actualPace - m);
  }
  const baselineMaeSec = baselineSum / predictions.length;
  const skillScore = baselineMaeSec > 0 ? 1 - maeSec / baselineMaeSec : 0;
  const meanAbsPctError =
    predictions.reduce(
      (s, p) => s + Math.abs(p.errorSec) / p.actualPace,
      0,
    ) / predictions.length;

  let verdict = "";
  if (skillScore > 0.15 && maeSec <= 45) {
    verdict =
      "Useful: model beats a naive average and typical error is under ~45s/mi on held-out runs.";
  } else if (skillScore > 0 && maeSec <= 70) {
    verdict =
      "Somewhat useful: slight edge over average pace, but uncertainty is still high for race forecasting.";
  } else {
    verdict =
      "Not yet reliable for prescription. Keep tagging HR on easy runs; current signal is mostly noise/load inconsistency.";
  }

  // Fit full model for next-run hint
  const fullTrain = includeHr ? points.filter((p) => p.averageHeartrate) : points;
  const hintTrain = fullTrain.length >= 4 ? fullTrain : points;
  const beta = fitOLS(
    hintTrain.map((p) => features(p, includeHr && Boolean(p.averageHeartrate))),
    hintTrain.map((p) => p.paceSecPerMi),
  );
  const last = points[points.length - 1];
  const nextProxy: EfficacyPoint = {
    ...last,
    distanceMi: Math.min(6, Math.max(4, last.distanceMi)),
    daysSincePrev: 2,
    miles7d: last.miles7d + last.distanceMi * 0.3,
    miles14d: last.miles14d + last.distanceMi * 0.3,
  };
  const predicted = predictPace(
    beta,
    nextProxy,
    includeHr && Boolean(last.averageHeartrate),
  );
  const nextRunHint = includeHr && last.averageHeartrate
    ? `If your next ~${nextProxy.distanceMi.toFixed(1)} mi easy run sits near ${Math.round(last.averageHeartrate)} bpm, expect ~${Math.floor(predicted / 60)}:${String(Math.round(predicted % 60)).padStart(2, "0")}/mi (±${Math.round(maeSec)}s).`
    : `Based on recent load, a similar easy run should land near ~${Math.floor(predicted / 60)}:${String(Math.round(predicted % 60)).padStart(2, "0")}/mi (±${Math.round(maeSec)}s). Add HR to sharpen this.`;

  if (excludedOutliers) {
    limitations.push(`Excluded ${excludedOutliers} outlier pace file(s) outside 9:00–16:00/mi.`);
  }

  return {
    usableRuns: points.length,
    hrTaggedRuns,
    excludedOutliers,
    maeSec,
    baselineMaeSec,
    skillScore,
    meanAbsPctError,
    hrPaceCorrelation,
    predictions,
    verdict,
    limitations,
    nextRunHint,
  };
}
