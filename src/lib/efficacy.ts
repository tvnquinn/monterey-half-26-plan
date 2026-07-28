import { daysBetweenKeys, runDayKey } from "./dates";
import type { RunActivity } from "./types";

export interface EfficacyPoint {
  id: string;
  date: string;
  distanceMi: number;
  paceSecPerMi: number;
  averageHeartrate?: number;
  elevationFt: number;
  elevFtPerMi: number;
  daysSincePrev: number | null;
  miles7d: number;
  miles14d: number;
  efficiency?: number; // mi/hr per bpm, higher = more economical
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

function mean(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Outliers are relative to this athlete, not absolute.
 *
 * The old rule dropped anything faster than 9:00/mi — which would have started
 * discarding exactly the workouts that show progress as fitness improved.
 */
function outlierBounds(paces: number[]): { lo: number; hi: number } {
  const med = median(paces) ?? 760;
  return {
    lo: Math.max(300, med * 0.62), // never accept sub-5:00/mi GPS glitches
    hi: Math.min(1500, med * 1.5),
  };
}

export function buildEfficacyPoints(
  runs: RunActivity[],
  tz?: string,
): {
  points: EfficacyPoint[];
  excludedOutliers: number;
} {
  const sorted = [...runs]
    .filter((r) => r.distanceMi >= 1 && r.paceSecPerMi > 0)
    // Runs whose pace was back-filled from a monthly average are not
    // observations — every run in that month carries the same number, so
    // scoring predictions against them measures the imputation, not the model.
    .filter((r) => !(r.raw as { paceImputed?: boolean } | undefined)?.paceImputed)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const { lo, hi } = outlierBounds(sorted.map((r) => r.paceSecPerMi));

  let excludedOutliers = 0;
  const cleaned: RunActivity[] = [];
  for (const r of sorted) {
    if (r.paceSecPerMi < lo || r.paceSecPerMi > hi) {
      excludedOutliers += 1;
      continue;
    }
    cleaned.push(r);
  }

  const points: EfficacyPoint[] = cleaned.map((r, idx) => {
    const date = runDayKey(r.startDate, tz);
    const prev = idx > 0 ? cleaned[idx - 1] : null;
    const within = (x: RunActivity, days: number) => {
      const d = daysBetweenKeys(runDayKey(x.startDate, tz), date);
      return d >= 0 && d <= days;
    };
    const miles7d = cleaned
      .slice(0, idx)
      .filter((x) => within(x, 7))
      .reduce((s, x) => s + x.distanceMi, 0);
    const miles14d = cleaned
      .slice(0, idx)
      .filter((x) => within(x, 14))
      .reduce((s, x) => s + x.distanceMi, 0);

    const efficiency =
      r.averageHeartrate && r.averageHeartrate > 0
        ? 3600 / r.paceSecPerMi / r.averageHeartrate
        : undefined;
    const elevationFt = Math.max(0, r.elevationFt || 0);

    return {
      id: r.id,
      date,
      distanceMi: r.distanceMi,
      paceSecPerMi: r.paceSecPerMi,
      averageHeartrate: r.averageHeartrate,
      elevationFt,
      elevFtPerMi: elevationFt / Math.max(r.distanceMi, 0.1),
      daysSincePrev: prev
        ? daysBetweenKeys(runDayKey(prev.startDate, tz), date)
        : null,
      miles7d,
      miles14d,
      efficiency,
    };
  });

  return { points, excludedOutliers };
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

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

type FeatureKey =
  | "distance"
  | "hr"
  | "elev"
  | "miles7d"
  | "miles14d"
  | "daysSincePrev";

/**
 * Feature count scales with sample size — roughly one predictor per six runs.
 *
 * The previous model fit seven coefficients on as few as four observations.
 * That system is underdetermined: XtX is singular, Gaussian elimination fell
 * through to a 1e-9 pivot guard, and the resulting "predictions" were noise
 * dressed up by an output clamp.
 */
function selectFeatures(n: number, usesHr: boolean): FeatureKey[] {
  const keys: FeatureKey[] = ["distance"];
  if (usesHr && n >= 8) keys.push("hr");
  if (n >= 14) keys.push("elev");
  if (n >= 20) keys.push("miles7d");
  if (n >= 26) keys.push("daysSincePrev");
  return keys;
}

function featureValue(
  key: FeatureKey,
  p: EfficacyPoint,
  hrImpute: number,
): number {
  switch (key) {
    case "distance":
      return p.distanceMi;
    case "hr":
      return p.averageHeartrate || hrImpute;
    case "elev":
      return p.elevFtPerMi;
    case "miles7d":
      return p.miles7d;
    case "miles14d":
      return p.miles14d;
    case "daysSincePrev":
      return p.daysSincePrev ?? 3;
  }
}

function designRow(
  p: EfficacyPoint,
  keys: FeatureKey[],
  hrImpute: number,
): number[] {
  return keys.map((k) => featureValue(k, p, hrImpute));
}

/** Solve an augmented [A|b] system in place. Returns the solution vector. */
function gaussSolve(A: number[][], q: number): number[] {
  for (let col = 0; col < q; col++) {
    let pivot = col;
    for (let r = col + 1; r < q; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    const div = A[col][col] || 1e-9;
    for (let c = col; c <= q; c++) A[col][c] /= div;
    for (let r = 0; r < q; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let c = col; c <= q; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[q]);
}

export interface RidgeFit {
  /** Intercept followed by one coefficient per feature key. */
  beta: number[];
  keys: FeatureKey[];
  hrImpute: number;
}

/**
 * Ridge regression on standardized features.
 *
 * Standardizing makes a single lambda meaningful across features whose units
 * differ by orders of magnitude (miles vs bpm vs ft/mi).
 */
export function fitRidge(
  points: EfficacyPoint[],
  keys: FeatureKey[],
  hrImpute: number,
  lambda = 2,
): RidgeFit {
  const q = keys.length;
  const X = points.map((p) => designRow(p, keys, hrImpute));
  const y = points.map((p) => p.paceSecPerMi);
  const n = y.length;

  const mu = Array(q).fill(0);
  const sd = Array(q).fill(1);
  for (let j = 0; j < q; j++) {
    const col = X.map((r) => r[j]);
    mu[j] = mean(col);
    const variance = mean(col.map((c) => (c - mu[j]) ** 2));
    sd[j] = Math.sqrt(variance) || 1;
  }
  const my = mean(y);
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const yc = y.map((v) => v - my);

  const A = Array.from({ length: q }, () => Array(q + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < q; a++) {
      A[a][q] += Z[i][a] * yc[i];
      for (let b = 0; b < q; b++) A[a][b] += Z[i][a] * Z[i][b];
    }
  }
  for (let a = 0; a < q; a++) A[a][a] += lambda;

  const bz = gaussSolve(A, q);
  const beta = Array(q + 1).fill(0);
  let intercept = my;
  for (let k = 0; k < q; k++) {
    beta[k + 1] = bz[k] / sd[k];
    intercept -= beta[k + 1] * mu[k];
  }
  beta[0] = intercept;

  return { beta, keys, hrImpute };
}

function predictWith(fit: RidgeFit, p: EfficacyPoint): number {
  let y = fit.beta[0];
  const row = designRow(p, fit.keys, fit.hrImpute);
  for (let i = 0; i < row.length; i++) y += fit.beta[i + 1] * row[i];
  return y;
}

export interface PaceModel {
  usesHr: boolean;
  n: number;
  keys: FeatureKey[];
  hrImpute: number;
  predict: (input: {
    distanceMi: number;
    elevationFt?: number;
    averageHeartrate?: number;
    daysSincePrev?: number;
    miles7d?: number;
    miles14d?: number;
  }) => number | null;
}

/** Minimum clean runs before the pace model is allowed to say anything. */
export const MIN_MODEL_RUNS = 6;

export function fitPaceModel(points: EfficacyPoint[]): PaceModel | null {
  if (points.length < MIN_MODEL_RUNS) return null;

  const hrVals = points
    .map((p) => p.averageHeartrate)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const usesHr = hrVals.length >= Math.max(3, points.length * 0.4);
  const hrImpute = hrVals.length ? mean(hrVals) : 143;

  const keys = selectFeatures(points.length, usesHr);
  const fit = fitRidge(points, keys, hrImpute);

  const paces = points.map((p) => p.paceSecPerMi);
  const lo = Math.min(...paces) - 45;
  const hi = Math.max(...paces) + 45;

  return {
    usesHr: keys.includes("hr"),
    n: points.length,
    keys,
    hrImpute,
    predict: (input) => {
      const elev = input.elevationFt ?? 0;
      const proxy: EfficacyPoint = {
        id: "proxy",
        date: "2099-01-01",
        distanceMi: input.distanceMi,
        paceSecPerMi: 0,
        averageHeartrate: input.averageHeartrate,
        elevationFt: elev,
        elevFtPerMi: elev / Math.max(input.distanceMi, 0.1),
        daysSincePrev: input.daysSincePrev ?? 2,
        miles7d: input.miles7d ?? 0,
        miles14d: input.miles14d ?? 0,
      };
      const raw = predictWith(fit, proxy);
      return Math.min(hi, Math.max(lo, raw));
    },
  };
}

export function backtestEfficacy(
  runs: RunActivity[],
  tz?: string,
): EfficacyBacktest {
  const { points, excludedOutliers } = buildEfficacyPoints(runs, tz);
  const hrTaggedRuns = points.filter((p) => p.averageHeartrate).length;
  const limitations: string[] = [];

  if (points.length < MIN_MODEL_RUNS + 2) {
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
      verdict: `Not enough clean runs yet for a reliable backtest (${points.length}; need ~8+).`,
      limitations: ["Import more runs with distance + pace (and HR when possible)."],
      nextRunHint:
        "Keep logging easy runs; model quality rises quickly after ~10 HR-tagged sessions.",
    };
  }

  const includeHr = hrTaggedRuns >= 3;
  if (!includeHr) {
    limitations.push(
      "Fewer than 3 HR-tagged runs, so HR is excluded. Add avg HR on easy runs to unlock HR→pace predictions.",
    );
  }

  const hrPts = points.filter((p) => p.averageHeartrate);
  const hrPaceCorrelation = pearson(
    hrPts.map((p) => p.averageHeartrate as number),
    hrPts.map((p) => p.paceSecPerMi),
  );
  const hrImputeAll = hrPts.length
    ? mean(hrPts.map((p) => p.averageHeartrate as number))
    : 143;

  // Walk-forward: train on everything prior, predict the next run.
  const minTrain = Math.max(MIN_MODEL_RUNS, Math.floor(points.length * 0.4));
  const predictions: BacktestPrediction[] = [];

  for (let i = minTrain; i < points.length; i++) {
    const train = points.slice(0, i);
    const test = points[i];
    const trainHr = train
      .map((p) => p.averageHeartrate)
      .filter((v): v is number => typeof v === "number");
    const useHr = includeHr && trainHr.length >= Math.max(3, train.length * 0.4);
    const impute = trainHr.length ? mean(trainHr) : hrImputeAll;
    const keys = selectFeatures(train.length, useHr);
    const fit = fitRidge(train, keys, impute);

    let predictedPace = predictWith(fit, test);
    const trainY = train.map((p) => p.paceSecPerMi);
    const trainMin = Math.min(...trainY);
    const trainMax = Math.max(...trainY);
    const pad = 45;
    predictedPace = Math.min(trainMax + pad, Math.max(trainMin - pad, predictedPace));

    predictions.push({
      id: test.id,
      date: test.date,
      actualPace: test.paceSecPerMi,
      predictedPace,
      errorSec: predictedPace - test.paceSecPerMi,
      actualHr: test.averageHeartrate,
      predictedPaceAtHr: keys.includes("hr") && test.averageHeartrate ? predictedPace : undefined,
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

  limitations.push(
    `Model uses ${selectFeatures(points.length, includeHr).join(", ")} with ridge (λ=2) — feature count scales with sample size.`,
  );

  const maeSec =
    predictions.reduce((s, p) => s + Math.abs(p.errorSec), 0) / predictions.length;

  // Baseline: predict the running mean of training paces.
  let baselineSum = 0;
  for (const pred of predictions) {
    const trainIdx = points.findIndex((p) => p.id === pred.id);
    const trainPaces = points.slice(0, trainIdx).map((p) => p.paceSecPerMi);
    baselineSum += Math.abs(pred.actualPace - mean(trainPaces));
  }
  const baselineMaeSec = baselineSum / predictions.length;
  const skillScore = baselineMaeSec > 0 ? 1 - maeSec / baselineMaeSec : 0;
  const meanAbsPctError =
    predictions.reduce((s, p) => s + Math.abs(p.errorSec) / p.actualPace, 0) /
    predictions.length;

  const recent = predictions.slice(-5);
  const recentMae = recent.reduce((s, p) => s + Math.abs(p.errorSec), 0) / recent.length;

  let verdict: string;
  if (skillScore > 0.15 && maeSec <= 45) {
    verdict =
      "Useful: model beats a naive average and typical error is under ~45s/mi on held-out runs.";
  } else if (recentMae <= 40 && predictions.length >= 5) {
    verdict = `Mixed overall, but recent form is useful: last ${recent.length} held-out runs MAE ~${Math.round(recentMae)}s/mi.`;
  } else if (skillScore > 0 && maeSec <= 70) {
    verdict =
      "Somewhat useful: slight edge over average pace, but uncertainty is still high for race forecasting.";
  } else {
    verdict =
      "Not yet reliable for prescription. Keep tagging HR on easy runs; current signal is mostly noise/load inconsistency.";
  }

  const model = fitPaceModel(points);
  const last = points[points.length - 1];
  const hintDist = Math.min(6, Math.max(4, last.distanceMi));
  const predicted =
    model?.predict({
      distanceMi: hintDist,
      elevationFt: last.elevFtPerMi * hintDist,
      averageHeartrate: last.averageHeartrate || hrImputeAll,
      daysSincePrev: 2,
      miles7d: last.miles7d + last.distanceMi * 0.3,
      miles14d: last.miles14d + last.distanceMi * 0.3,
    }) ?? last.paceSecPerMi;
  const paceLabel = `${Math.floor(predicted / 60)}:${String(Math.round(predicted % 60)).padStart(2, "0")}`;
  const nextRunHint = model?.usesHr
    ? `If your next ~${hintDist.toFixed(1)} mi easy run sits near ${Math.round(last.averageHeartrate || hrImputeAll)} bpm with similar hills, expect ~${paceLabel}/mi (±${Math.round(maeSec)}s).`
    : `Based on recent load + elevation, a similar easy run should land near ~${paceLabel}/mi (±${Math.round(maeSec)}s). Add HR to sharpen this.`;

  if (excludedOutliers) {
    limitations.push(
      `Excluded ${excludedOutliers} run(s) outside ±40% of your median pace.`,
    );
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
