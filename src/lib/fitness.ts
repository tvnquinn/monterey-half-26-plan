/**
 * Half-marathon fitness estimation.
 *
 * The old model was `fastestRunInLast28Days * 0.78 * 13.1` — a flat 22%
 * easy→race conversion keyed off a single run, so one downhill Tuesday moved
 * the race projection by minutes. This replaces it with two signals that
 * actually track fitness, anchored on a real result:
 *
 *   1. Efficiency factor (EF) trend — speed per heartbeat on aerobic runs.
 *      Improving EF at the same HR is the cleanest fitness signal available
 *      from a watch. Fit log-linear over time; the slope is fractional
 *      improvement per week.
 *   2. Riegel extrapolation from genuine hard efforts, when any exist.
 *
 * Both are applied as adjustments to the prior half result rather than used
 * standalone, because a known race is a far better anchor than any inference
 * off easy running.
 */

import { daysBetweenKeys, runDayKey } from "./dates";
import type { RunActivity, TrainingPlan } from "./types";

/** Riegel's endurance exponent. 1.06 is the standard road-running value. */
const RIEGEL_EXP = 1.06;

/** EF gains partly reflect weather/terrain/freshness, not just fitness. */
const EF_DAMPING = 0.7;

export interface EfPoint {
  dateKey: string;
  weeksAgo: number;
  /** Miles per hour per bpm. Higher = more economical. */
  ef: number;
  paceSecPerMi: number;
  hr: number;
  distanceMi: number;
}

export interface EfTrend {
  n: number;
  spanDays: number;
  /** Fractional EF change per week (0.01 = 1%/wk faster at the same HR). */
  slopePerWeek: number;
  /** Total fractional change across the observed window, clamped. */
  deltaPct: number;
  r2: number;
}

export type EstimateMethod = "prior_only" | "ef_trend" | "hard_effort" | "blended";

export interface HalfEstimate {
  sec: number | null;
  method: EstimateMethod;
  confidence: "low" | "medium" | "high";
  /** Human-readable inputs, for the UI to show its work. */
  basis: string[];
  efTrend: EfTrend | null;
  hardEffortSec: number | null;
}

export interface EstimateInput {
  runs: RunActivity[];
  plan: TrainingPlan;
  priorHalfSec: number;
  asOf: Date;
  /** Average weekly mileage over the last 4 weeks. */
  weeklyMi: number;
  tz?: string;
}

function mean(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function riegelSec(
  knownMi: number,
  knownSec: number,
  targetMi: number,
): number {
  return knownSec * Math.pow(targetMi / knownMi, RIEGEL_EXP);
}

/**
 * Aerobic runs only. EF is comparable within the easy/steady domain but rises
 * with intensity up to threshold, so quality sessions would masquerade as
 * fitness gains if we let them in.
 */
export function buildEfPoints(
  runs: RunActivity[],
  plan: TrainingPlan,
  asOf: Date,
  tz?: string,
): EfPoint[] {
  const cap = plan.paceGuidance.hrEasyCap;
  const z2 = plan.paceGuidance.hrZones?.z2;
  const hrFloor = z2 ? z2.min - 6 : cap - 15;
  const hrCeil = z2 ? z2.max + 4 : cap + 12;
  const today = runDayKey(asOf.toISOString(), tz);

  return runs
    .filter((r) => {
      const hr = r.averageHeartrate;
      if (!hr || hr < hrFloor || hr > hrCeil) return false;
      if (r.distanceMi < 2) return false;
      if (r.paceSecPerMi <= 0) return false;
      // Running through illness, injury or a heatwave depresses speed-per-beat
      // without any change in fitness. Counting those runs lets a bad fortnight
      // masquerade as aerobic decline and drags the race projection down for
      // weeks after recovery.
      if (r.condition) return false;
      return true;
    })
    .map((r) => {
      const dateKey = runDayKey(r.startDate, tz);
      const hr = r.averageHeartrate as number;
      return {
        dateKey,
        weeksAgo: daysBetweenKeys(dateKey, today) / 7,
        ef: 3600 / r.paceSecPerMi / hr,
        paceSecPerMi: r.paceSecPerMi,
        hr,
        distanceMi: r.distanceMi,
      };
    })
    .filter((p) => p.weeksAgo >= 0 && p.weeksAgo <= 16)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * Log-linear fit of EF against time. Log space makes the slope a *fractional*
 * change per week, which is what we want to apply to a race time.
 */
export function fitEfTrend(points: EfPoint[]): EfTrend | null {
  if (points.length < 6) return null;
  const spanDays = daysBetweenKeys(
    points[0].dateKey,
    points[points.length - 1].dateKey,
  );
  if (spanDays < 21) return null;

  // x = weeks before today (negated so positive slope = improving over time)
  const xs = points.map((p) => -p.weeksAgo);
  const ys = points.map((p) => Math.log(p.ef));
  const mx = mean(xs);
  const my = mean(ys);

  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const rawSlope = num / den;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    const fit = my + rawSlope * (xs[i] - mx);
    ssRes += (ys[i] - fit) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot > 0 ? clamp(1 - ssRes / ssTot, 0, 1) : 0;

  // No one gains more than ~1.5%/wk of aerobic efficiency for long.
  const slopePerWeek = clamp(rawSlope, -0.015, 0.015);
  const weeks = spanDays / 7;
  const deltaPct = clamp(Math.exp(slopePerWeek * weeks) - 1, -0.08, 0.1);

  return { n: points.length, spanDays, slopePerWeek, deltaPct, r2 };
}

/** Median pace across recent runs — the reference for "was this actually fast?". */
function medianPace(runs: RunActivity[]): number | null {
  const v = runs.filter((r) => r.paceSecPerMi > 0).map((r) => r.paceSecPerMi);
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Best Riegel-projected half from a genuine hard effort.
 *
 * High HR alone is not enough: a hot or tired easy run drifts into Z3 at easy
 * pace, and extrapolating that with Riegel produced a 2:54 projection off a
 * 12:25/mi jog. A hard effort has to be meaningfully *faster* than this
 * athlete's normal running, not merely higher-HR.
 */
const HARD_EFFORT_PACE_RATIO = 0.92;
/** At or beyond this distance, finishing at all is the fitness demonstration. */
const ENDURANCE_EFFORT_MI = 10;
/**
 * Shortest effort Riegel may be extrapolated from, as a fraction of race
 * distance. The exponent is only dependable within roughly a 3× stretch; below
 * that the projection is arithmetic dressed up as evidence.
 *
 * This mattered: a 3-mile B-pace rep session was being extrapolated 4.4× to a
 * half and blended in at 35% weight. In an adherence simulation it made
 * running 80% of the plan project *faster* than running 100%, because at 80%
 * that session shrank under the old 3-mile floor and stopped polluting the
 * estimate.
 */
const MIN_RIEGEL_FRACTION = 0.4;

function bestHardEffortSec(
  runs: RunActivity[],
  plan: TrainingPlan,
  asOf: Date,
  tz?: string,
): number | null {
  const z3 = plan.paceGuidance.hrZones?.z3;
  const hardHr = z3 ? z3.min : plan.paceGuidance.hrEasyCap + 12;
  const today = runDayKey(asOf.toISOString(), tz);

  const med = medianPace(runs);
  if (med == null) return null;

  const candidates = runs
    .filter((r) => {
      const days = daysBetweenKeys(runDayKey(r.startDate, tz), today);
      if (days < 0 || days > 180) return false;
      if (r.movingTimeSec <= 0) return false;
      // Too short to extrapolate from without inventing the answer.
      if (r.distanceMi < plan.race.distanceMi * MIN_RIEGEL_FRACTION) return false;

      const hr = r.averageHeartrate;

      // A 10+ mile run is most of a half, so the pace bar relaxes — for an
      // athlete whose race pace is only a few percent quicker than his jogging
      // pace, a pure speed test would never fire. Quinn's 13.15 @ 10:20 sits 6%
      // under his median, so the 8%-faster rule alone discarded his actual
      // half. But distance alone is not enough: an *easy* long run says nothing
      // about race capability, so it still has to have been run hard.
      if (r.distanceMi >= ENDURANCE_EFFORT_MI) {
        if (r.paceSecPerMi > med * 1.02) return false;
        return hr ? hr >= hardHr : r.paceSecPerMi <= med * 0.95;
      }

      if (r.paceSecPerMi > med * HARD_EFFORT_PACE_RATIO) return false;
      return hr ? hr >= hardHr : r.paceSecPerMi <= med * 0.85;
    })
    .map((r) => riegelSec(r.distanceMi, r.movingTimeSec, 13.1));

  if (!candidates.length) return null;
  return Math.round(Math.min(...candidates));
}

/**
 * Net cost of rolling terrain, seconds per mile per ft/mi of climb.
 *
 * Two independent estimates land close together, which is why this value is
 * trusted more than the earlier guess:
 *
 *   - Whole-run regression (pace ~ elev + HR + distance, 43 runs) returns 0.64,
 *     but that is inflated: he picks hilly routes on easy days, so the
 *     coefficient absorbs effort as well as grade.
 *   - Within-run regression over 22 mile splits with heart rate controlled
 *     returns 0.489 s/mi per foot of *net* change. Halved to account for the
 *     descent refund on a loop, that is ~2.2 min over 13.1 at his 42 ft/mi.
 *
 * 0.20 applied to cumulative gain yields ~1.8 min — the same answer from the
 * other direction. Kept at the conservative end deliberately: over-crediting
 * the course is exactly how a projection quietly becomes a fantasy.
 */
const ELEV_SEC_PER_FT_PER_MI = 0.2;

/** Above roughly this, heat starts costing measurable time. */
const HEAT_NEUTRAL_F = 60;
const HEAT_SEC_PER_F = 1.5;

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Conditions adjustment, in seconds of half-marathon time.
 * Positive = race day should be faster than training conditions imply.
 *
 * Measured from the athlete's own runs, not from the calendar. The previous
 * version handed out ~4 minutes for "summer training" on the assumption that
 * July means heat. Quinn trains in San Francisco: median run temperature is
 * 62°F and only one run in the whole history was above 70°F. There is no heat
 * penalty to refund, and the prior-half anchor was itself run at 56°F — so the
 * only honest conditions credit is terrain.
 */
function conditionsCreditSec(
  runs: RunActivity[],
  plan: TrainingPlan,
  asOf: Date,
  tz?: string,
): { sec: number; note: string | null } {
  void asOf;
  void tz;
  const raceElev = plan.race.elevationFtPerMi ?? 0;
  const raceTemp = plan.race.expectedTempF ?? null;

  const trainElev =
    median(
      runs.filter((r) => r.distanceMi >= 2).map((r) => r.elevationFt / r.distanceMi),
    ) ??
    plan.paceGuidance.trainingElevFtPerMi ??
    40;

  const elevCredit =
    Math.max(0, trainElev - raceElev) * ELEV_SEC_PER_FT_PER_MI * 13.1;

  // Heat only counts when training was actually hotter than race day.
  const trainTemp = median(
    runs.filter((r) => r.temperatureF != null).map((r) => r.temperatureF as number),
  );
  let heatCredit = 0;
  if (trainTemp != null && raceTemp != null) {
    const trainPenalty = Math.max(0, trainTemp - HEAT_NEUTRAL_F);
    const racePenalty = Math.max(0, raceTemp - HEAT_NEUTRAL_F);
    heatCredit = Math.max(0, trainPenalty - racePenalty) * HEAT_SEC_PER_F * 13.1;
  }

  const sec = Math.round(elevCredit + heatCredit);
  if (sec <= 0) return { sec: 0, note: null };

  const parts = [`${Math.round(trainElev)} ft/mi training vs flat course`];
  if (heatCredit > 0) parts.push(`${Math.round(trainTemp!)}°F vs ${raceTemp}°F`);
  return { sec, note: `${parts.join(" · ")}: −${(sec / 60).toFixed(1)} min.` };
}

/** Durability: a half is only as good as your longest run supports. */
function durabilityFactor(longestMi: number): number {
  if (longestMi >= 11) return 0.99;
  if (longestMi >= 9) return 1.0;
  if (longestMi >= 7) return 1.02;
  if (longestMi >= 5) return 1.045;
  return 1.07;
}

function volumeFactor(weeklyMi: number): number {
  if (weeklyMi >= 26) return 0.985;
  if (weeklyMi >= 20) return 1.0;
  if (weeklyMi >= 14) return 1.015;
  return 1.04;
}

/**
 * Fitness built over a block doesn't evaporate during a planned taper.
 *
 * Keying volume and durability off the trailing 28 days made the projection get
 * *worse* through race week — the backtest showed race day landing 4 min slower
 * than two weeks out, purely because taper mileage is lower by design. Both now
 * look back far enough to see the peak of the block.
 */
function builtVolumeMi(runs: RunActivity[], today: string, recentMi: number, tz?: string): number {
  let peak4wk = 0;
  for (let offset = 0; offset <= 112; offset += 7) {
    const total = runs
      .filter((r) => {
        const age = daysBetweenKeys(runDayKey(r.startDate, tz), today);
        return age >= offset && age < offset + 28;
      })
      .reduce((s, r) => s + r.distanceMi, 0);
    peak4wk = Math.max(peak4wk, total / 4);
  }
  // Taper costs a little sharpness, not the whole block.
  return Math.max(recentMi, peak4wk * 0.85);
}

/**
 * How much a long run still counts for, by age.
 *
 * A hard 56-day cliff threw away Quinn's 10.06-miler at 69 days and reported
 * his longest as 5.76 — which drove both the durability penalty and the
 * confidence gate off a run that was two weeks past an arbitrary boundary.
 * Endurance adaptation fades gradually; the evidence that you covered the
 * distance fades slower still. Full credit for five weeks, half credit at four
 * months, gone by eight.
 */
function longRunRecencyWeight(ageDays: number): number {
  if (ageDays < 0) return 0;
  if (ageDays <= 35) return 1;
  if (ageDays <= 120) return 1 - ((ageDays - 35) / 85) * 0.5;
  if (ageDays <= 240) return 0.5 - ((ageDays - 120) / 120) * 0.5;
  return 0;
}

/** How far back a long run still counts as *evidence* you can cover the distance. */
const EVIDENCE_WINDOW_DAYS = 150;

/**
 * Longest run, measured two ways, because they answer different questions.
 *
 * `effectiveMi` — how much durability you still carry, decayed by age. Drives
 *   the physiological penalty.
 * `evidenceMi` — the longest you actually covered inside a generous window,
 *   undecayed. Drives the confidence gate.
 *
 * Collapsing these into one number put a hard `>= 8` threshold on a
 * continuously decaying quantity: Quinn's 10.06-miler decayed past 8.0 on day
 * 70 and confidence flipped medium → low overnight with no change in his
 * training. Fitness fades; the fact that you ran ten miles does not.
 */
function builtLongest(
  runs: RunActivity[],
  today: string,
  tz?: string,
): { effectiveMi: number; sourceMi: number; ageDays: number; evidenceMi: number } {
  let best = { effectiveMi: 0, sourceMi: 0, ageDays: 0 };
  let evidenceMi = 0;
  for (const r of runs) {
    const ageDays = daysBetweenKeys(runDayKey(r.startDate, tz), today);
    if (ageDays < 0) continue;
    const effectiveMi = r.distanceMi * longRunRecencyWeight(ageDays);
    if (effectiveMi > best.effectiveMi) {
      best = { effectiveMi, sourceMi: r.distanceMi, ageDays };
    }
    if (ageDays <= EVIDENCE_WINDOW_DAYS) {
      evidenceMi = Math.max(evidenceMi, r.distanceMi);
    }
  }
  return { ...best, evidenceMi };
}

export function estimateHalf(input: EstimateInput): HalfEstimate {
  const { runs, plan, priorHalfSec, asOf, weeklyMi, tz } = input;
  const basis: string[] = [];
  const today = runDayKey(asOf.toISOString(), tz);

  // Look back past the taper so race week doesn't read as detraining.
  const longest = builtLongest(runs, today, tz);
  const longestMi = longest.effectiveMi;
  const effectiveWeeklyMi = builtVolumeMi(runs, today, weeklyMi, tz);

  const efPoints = buildEfPoints(runs, plan, asOf, tz);
  const efTrend = fitEfTrend(efPoints);
  const hardEffortSec = bestHardEffortSec(runs, plan, asOf, tz);

  if (!runs.length) {
    return {
      sec: priorHalfSec,
      method: "prior_only",
      confidence: "low",
      basis: ["No runs logged — showing prior half."],
      efTrend: null,
      hardEffortSec: null,
    };
  }

  // Start from the known result and move it with observed fitness change.
  let efBased = priorHalfSec;
  if (efTrend) {
    efBased = priorHalfSec * (1 - efTrend.deltaPct * EF_DAMPING);
    const dir = efTrend.deltaPct >= 0 ? "faster" : "slower";
    basis.push(
      `EF ${(efTrend.deltaPct * 100).toFixed(1)}% ${dir} at the same HR over ${efTrend.spanDays}d (${efTrend.n} runs, R²=${efTrend.r2.toFixed(2)}).`,
    );
  } else {
    basis.push(
      `Not enough aerobic HR runs for a fitness trend yet (${efPoints.length}/6, need 3+ weeks of span).`,
    );
  }

  efBased *= durabilityFactor(longestMi);
  efBased *= volumeFactor(effectiveWeeklyMi);
  basis.push(
    longest.effectiveMi < longest.sourceMi - 0.1
      ? `Longest ${longest.sourceMi.toFixed(1)} mi (${longest.ageDays}d ago) counts as ${longest.effectiveMi.toFixed(1)} mi · ~${Math.round(effectiveWeeklyMi)} mi/wk of built volume.`
      : `Longest ${longest.sourceMi.toFixed(1)} mi · ~${Math.round(effectiveWeeklyMi)} mi/wk of built volume.`,
  );

  let sec: number;
  let method: EstimateMethod;

  if (hardEffortSec != null && efTrend) {
    // Both signals: weight the hard effort, but don't let one workout rule.
    sec = hardEffortSec * 0.35 + efBased * 0.65;
    method = "blended";
    basis.push(
      `Hard effort projects ${Math.round(hardEffortSec / 60)} min (Riegel), blended 35%.`,
    );
  } else if (hardEffortSec != null) {
    sec = hardEffortSec * 0.3 + efBased * 0.7;
    method = "hard_effort";
    basis.push(`Hard effort projects ${Math.round(hardEffortSec / 60)} min (Riegel).`);
  } else if (efTrend) {
    sec = efBased;
    method = "ef_trend";
  } else {
    sec = efBased;
    method = "prior_only";
  }

  const credit = conditionsCreditSec(runs, plan, asOf, tz);
  if (credit.sec > 0) {
    sec -= credit.sec;
    if (credit.note) basis.push(credit.note);
  }

  let confidence: HalfEstimate["confidence"] = "low";
  if (efTrend && efTrend.n >= 8 && longest.evidenceMi >= 8) confidence = "medium";
  if (
    efTrend &&
    efTrend.n >= 14 &&
    efTrend.r2 >= 0.25 &&
    longest.evidenceMi >= 10 &&
    effectiveWeeklyMi >= 20 &&
    hardEffortSec != null
  ) {
    confidence = "high";
  }

  return {
    sec: Math.round(sec),
    method,
    confidence,
    basis,
    efTrend,
    hardEffortSec,
  };
}
