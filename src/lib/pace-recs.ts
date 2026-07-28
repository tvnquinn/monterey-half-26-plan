import { paceToString } from "./format";
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

function sessionMultiplier(type: SessionType): { paceFactor: number; label: string } {
  switch (type) {
    case "easy":
      return { paceFactor: 1.0, label: "easy" };
    case "easy_strides":
      return { paceFactor: 1.0, label: "easy + strides" };
    case "long":
      return { paceFactor: 1.03, label: "long easy" };
    case "quality":
      return { paceFactor: 0.78, label: "quality" };
    case "race":
      return { paceFactor: 0.74, label: "race" };
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
      label: `${z.z3.label}–${z.z4.label}`,
      range: `${z.z3.min}–${z.z4.max}`,
      hrTarget: z.z3.max,
    };
  }
  // Easy / long / strides: Z2, true easy ~143
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
  const expectedElev = elevPerMi * session.targetMi;
  const easyHr = typicalEasyHr(runs, plan.paceGuidance.hrEasyCap);
  const zone = hrZoneForSession(session.type, plan);

  let easyExpected = (guidance.easyMinSecPerMi + guidance.easyMaxSecPerMi) / 2;

  if (model) {
    const predicted = model.predict({
      distanceMi: session.targetMi,
      elevationFt: expectedElev,
      averageHeartrate: easyHr,
      daysSincePrev: 2,
      miles7d: runs
        .filter((r) => {
          const d = (Date.now() - new Date(r.startDate).getTime()) / 86400000;
          return d >= 0 && d <= 7;
        })
        .reduce((s, r) => s + r.distanceMi, 0),
      miles14d: runs
        .filter((r) => {
          const d = (Date.now() - new Date(r.startDate).getTime()) / 86400000;
          return d >= 0 && d <= 14;
        })
        .reduce((s, r) => s + r.distanceMi, 0),
    });
    if (predicted) easyExpected = predicted;
  }

  let target: number;
  if (session.type === "race") {
    target = plan.athlete.goalPaceSecPerMi;
  } else if (session.type === "quality") {
    target =
      guidance.confidence === "low"
        ? Math.round((easyExpected + plan.athlete.goalPaceSecPerMi) / 2)
        : Math.round(plan.athlete.goalPaceSecPerMi + 8);
  } else {
    target = Math.round(easyExpected * mult.paceFactor);
    target += Math.round(Math.max(0, elevPerMi - 20) * 0.25);
  }

  const spread = session.type === "quality" || session.type === "race" ? 12 : 35;
  const minSec = target - (session.type === "easy" || session.type === "long" ? 15 : 8);
  const maxSec = target + spread;

  return {
    targetSecPerMi: target,
    minSecPerMi: minSec,
    maxSecPerMi: maxSec,
    label: mult.label,
    hrTarget: zone.hrTarget,
    hrZoneLabel: zone.label,
    hrZoneRange: zone.range,
    rationale: `${zone.label} ${zone.range} bpm`,
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
