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

function sessionMultiplier(type: SessionType): { paceFactor: number; label: string; hrOffset: number } {
  switch (type) {
    case "easy":
      return { paceFactor: 1.0, label: "easy", hrOffset: 0 };
    case "easy_strides":
      return { paceFactor: 1.0, label: "easy + strides", hrOffset: 0 };
    case "long":
      return { paceFactor: 1.03, label: "long easy", hrOffset: -2 };
    case "quality":
      return { paceFactor: 0.78, label: "quality / race-pace work", hrOffset: 18 };
    case "race":
      return { paceFactor: 0.74, label: "race", hrOffset: 25 };
    default:
      return { paceFactor: 1.0, label: "easy", hrOffset: 0 };
  }
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

  let easyExpected = (guidance.easyMinSecPerMi + guidance.easyMaxSecPerMi) / 2;
  let usedHr = false;
  let usedElev = false;

  if (model) {
    const predicted = model.predict({
      distanceMi: session.targetMi,
      elevationFt: expectedElev,
      averageHeartrate: easyHr,
      daysSincePrev: 2,
      // approximate current load from last 14d
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
    if (predicted) {
      easyExpected = predicted;
      usedElev = true;
      usedHr = model.usesHr;
    }
  }

  let target: number;
  if (session.type === "race") {
    target = plan.athlete.goalPaceSecPerMi;
  } else if (session.type === "quality") {
    // Controlled race-pace work; keep near goal pace unless confidence is low
    target =
      guidance.confidence === "low"
        ? Math.round((easyExpected + plan.athlete.goalPaceSecPerMi) / 2)
        : Math.round(plan.athlete.goalPaceSecPerMi + 8);
  } else {
    target = Math.round(easyExpected * mult.paceFactor);
    // Elevation penalty: ~2–4 sec/mi per 10 ft/mi gain above flat
    const elevPenalty = Math.round(Math.max(0, elevPerMi - 20) * 0.25);
    target += elevPenalty;
    usedElev = usedElev || elevPenalty > 0;
  }

  const spread = session.type === "quality" || session.type === "race" ? 12 : 35;
  const minSec = target - (session.type === "easy" || session.type === "long" ? 15 : 8);
  const maxSec = target + spread;

  const hrTarget =
    session.type === "quality" || session.type === "race"
      ? easyHr + mult.hrOffset
      : Math.min(plan.paceGuidance.hrEasyCap, easyHr + mult.hrOffset);

  const bits = [
    `${mult.label} target ${paceToString(target)}/mi`,
    usedHr ? `anchored to ~${Math.round(easyHr)} bpm easy HR` : "HR sparse — using recent easy pace band",
    usedElev ? `includes ~${Math.round(elevPerMi)} ft/mi elev context` : null,
  ].filter(Boolean);

  return {
    targetSecPerMi: target,
    minSecPerMi: minSec,
    maxSecPerMi: maxSec,
    label: mult.label,
    hrTarget: Math.round(hrTarget),
    rationale: bits.join(" · "),
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
