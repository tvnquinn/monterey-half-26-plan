import { paceToString, roundPaceSec } from "./format";
import { monthOf } from "./dates";
import { buildEfficacyPoints, fitPaceModel, type PaceModel } from "./efficacy";
import type {
  PaceGuidanceLive,
  PlannedSession,
  RunActivity,
  SessionPaceRec,
  SessionStatus,
  SessionType,
  TrainingPlan,
} from "./types";

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function typicalElevPerMi(runs: RunActivity[]): number {
  const vals = runs
    .filter((r) => r.distanceMi >= 2 && (r.elevationFt || 0) > 0)
    .map((r) => (r.elevationFt || 0) / r.distanceMi);
  return median(vals) ?? 40;
}

function typicalEasyHr(runs: RunActivity[], fallback: number): number {
  const vals = runs
    .filter((r) => r.averageHeartrate && r.paceSecPerMi >= 660)
    .map((r) => r.averageHeartrate as number);
  return median(vals) ?? fallback;
}

function designPaceSec(plan: TrainingPlan): number {
  return (
    plan.athlete.designPaceSecPerMi ??
    plan.paceGuidance.designPaceSecPerMi ??
    595
  );
}

function sessionMultiplier(type: SessionType): { paceFactor: number; label: string } {
  switch (type) {
    case "easy":
      return { paceFactor: 1.0, label: "easy" };
    case "easy_strides":
      return { paceFactor: 1.0, label: "easy + strides" };
    case "long":
      return { paceFactor: 1.03, label: "long easy" };
    case "threshold":
      return { paceFactor: 0.88, label: "threshold" };
    case "quality":
      return { paceFactor: 0.82, label: "B-pace" };
    case "race":
      return { paceFactor: 0.74, label: "race" };
    case "strength":
      return { paceFactor: 1.0, label: "strength" };
    default:
      return { paceFactor: 1.0, label: "easy" };
  }
}

function hrZoneForSession(
  type: SessionType,
  plan: TrainingPlan,
): { label: string; range: string; hrTarget: number } {
  const z = plan.paceGuidance.hrZones;
  if (!z) {
    const cap = plan.paceGuidance.hrEasyCap;
    return { label: "easy", range: `≤${cap}`, hrTarget: cap };
  }
  if (type === "race") {
    return {
      label: z.z4.label,
      range: `${z.z4.min}–${z.z4.max}`,
      hrTarget: z.z4.max,
    };
  }
  if (type === "quality") {
    return {
      label: z.z3.label,
      range: `${z.z3.min}–${z.z3.max}`,
      hrTarget: z.z3.max,
    };
  }
  if (type === "threshold") {
    return {
      label: z.z3.label,
      range: `${z.z3.min}–${z.z3.max}`,
      hrTarget: z.z3.max,
    };
  }
  if (type === "strength") {
    return { label: "—", range: "—", hrTarget: plan.paceGuidance.hrEasyCap };
  }
  return {
    label: z.z2.label,
    range: `${z.z2.min}–${z.z2.max}`,
    hrTarget: plan.paceGuidance.hrEasyCap,
  };
}

export function buildSessionPaceRec(args: {
  session: PlannedSession;
  plan: TrainingPlan;
  guidance: PaceGuidanceLive;
  model: PaceModel | null;
  runs: RunActivity[];
  asOf: Date;
}): SessionPaceRec {
  const { session, plan, guidance, model, runs } = args;
  const mult = sessionMultiplier(session.type);
  const elevPerMi = typicalElevPerMi(runs);
  const expectedElev = elevPerMi * Math.max(session.targetMi, 0);
  const easyHr = typicalEasyHr(runs, plan.paceGuidance.hrEasyCap);
  const zone = hrZoneForSession(session.type, plan);
  const bPace = designPaceSec(plan);

  if (session.type === "strength" || session.type === "rest") {
    return {
      targetSecPerMi: 0,
      minSecPerMi: 0,
      maxSecPerMi: 0,
      label: mult.label,
      hrTarget: zone.hrTarget,
      hrZoneLabel: zone.label,
      hrZoneRange: zone.range,
      rationale: session.notes || "Strength / mobility",
    };
  }

  let easyExpected = (guidance.easyMinSecPerMi + guidance.easyMaxSecPerMi) / 2;

  if (model && session.targetMi > 0) {
    // asOf, not Date.now() — otherwise the backtest can't time-travel.
    const milesWithin = (days: number) =>
      runs
        .filter((r) => {
          const d = (args.asOf.getTime() - new Date(r.startDate).getTime()) / 86400000;
          return d >= 0 && d <= days;
        })
        .reduce((s, r) => s + r.distanceMi, 0);

    const predicted = model.predict({
      distanceMi: session.targetMi,
      elevationFt: expectedElev,
      averageHeartrate: easyHr,
      daysSincePrev: 2,
      miles7d: milesWithin(7),
      miles14d: milesWithin(14),
    });
    if (predicted) easyExpected = predicted;
  }

  // Summer heat: training paces are slower than cool-race fitness — widen easy band slightly
  const month = monthOf(args.asOf, plan.athlete.timeZone);
  if (month >= 7 && month <= 9 && (session.type === "easy" || session.type === "long" || session.type === "easy_strides")) {
    easyExpected += 15;
  }

  let target: number;
  if (session.type === "race") {
    // Race day: open toward B; A only if gifted — prescribe B as the plan pace
    target = bPace;
  } else if (session.type === "quality") {
    // Design target = B-pace (~9:55), not A 9:09
    target =
      guidance.confidence === "high"
        ? Math.round(bPace - 5)
        : Math.round(bPace + 5);
  } else if (session.type === "threshold") {
    // Comfortably hard ≈ ~15–25s slower than B-pace (hour-effort)
    target = Math.round(bPace + 20);
  } else {
    target = Math.round(easyExpected * mult.paceFactor);
    target += Math.round(Math.max(0, elevPerMi - 20) * 0.25);
  }

  const spread =
    session.type === "quality" || session.type === "threshold" || session.type === "race"
      ? 15
      : 35;
  const minRaw =
    target - (session.type === "easy" || session.type === "long" ? 15 : 10);
  const maxRaw = target + spread;

  // Round bands to 10s — model MAE is tens of seconds
  const minSec = roundPaceSec(minRaw, 10);
  const maxSec = roundPaceSec(maxRaw, 10);

  return {
    targetSecPerMi: roundPaceSec(target, 10),
    minSecPerMi: minSec,
    maxSecPerMi: maxSec,
    label: mult.label,
    hrTarget: zone.hrTarget,
    hrZoneLabel: zone.label,
    hrZoneRange: zone.range,
    // Rows show a single target pace; the band stays available for tooltips.
    rationale: `${paceToString(roundPaceSec(target, 10))}/mi · ${zone.label} ${zone.range}`,
  };
}

export function attachPaceRecsToWeek(args: {
  sessions: SessionStatus[];
  plan: TrainingPlan;
  guidance: PaceGuidanceLive;
  runs: RunActivity[];
  asOf: Date;
}): SessionStatus[] {
  const { points } = buildEfficacyPoints(args.runs);
  const model = fitPaceModel(points);
  return args.sessions.map((s) => ({
    ...s,
    paceRec: buildSessionPaceRec({
      session: s.session,
      plan: args.plan,
      guidance: args.guidance,
      model,
      runs: args.runs,
      asOf: args.asOf,
    }),
  }));
}
