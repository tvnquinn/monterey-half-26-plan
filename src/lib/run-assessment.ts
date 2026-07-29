import type { RunActivity, TrainingPlan } from "./types";

/**
 * What a run actually was, judged from the watch rather than from what was
 * scheduled.
 *
 * Deliberately not reusing SessionType. A 2.9-mile jog that drifted into Z3 is
 * not a "threshold session", and labelling it one would let unstructured runs
 * masquerade as workouts in the log. These describe observed character only.
 */
export type RunCharacter = "easy" | "steady" | "hard" | "long";

export interface RunAssessment {
  character: RunCharacter;
  /** Short label for a session row, e.g. "steady · progression". */
  label: string;
  /** Heart-rate zone the run averaged in, when HR was recorded. */
  zoneLabel: string | null;
  /** Last third meaningfully quicker than the first third. */
  progression: boolean;
  /** One-line explanation of why it was classified this way. */
  why: string;
}

function zoneFor(hr: number, plan: TrainingPlan): { label: string; index: number } | null {
  const z = plan.paceGuidance.hrZones;
  if (!z) return null;
  if (hr <= z.z1.max) return { label: z.z1.label, index: 1 };
  if (hr <= z.z2.max) return { label: z.z2.label, index: 2 };
  if (hr <= z.z3.max) return { label: z.z3.label, index: 3 };
  if (hr <= z.z4.max) return { label: z.z4.label, index: 4 };
  return { label: z.z5.label, index: 5 };
}

/** Compare the opening third of a run to its closing third. */
function detectProgression(run: RunActivity): boolean {
  const splits = run.splits?.filter((s) => s.paceSecPerMi > 0) ?? [];
  if (splits.length < 3) return false;
  const cut = Math.floor(splits.length / 3) || 1;
  const first = splits.slice(0, cut);
  const last = splits.slice(-cut);
  const avg = (xs: typeof splits) =>
    xs.reduce((s, x) => s + x.paceSecPerMi, 0) / xs.length;
  // 4% quicker is well beyond normal mile-to-mile noise.
  return avg(last) <= avg(first) * 0.96;
}

export function assessRun(args: {
  run: RunActivity;
  plan: TrainingPlan;
  /** Longest run the plan plans this week — the bar for calling something long. */
  plannedLongMi?: number;
}): RunAssessment {
  const { run, plan, plannedLongMi } = args;
  const hr = run.averageHeartrate;
  const zone = hr ? zoneFor(hr, plan) : null;
  const progression = detectProgression(run);

  const longBar = Math.max(7, (plannedLongMi ?? 0) * 0.9);
  let character: RunCharacter;
  let why: string;

  if (run.distanceMi >= longBar) {
    character = "long";
    why = `${run.distanceMi.toFixed(1)} mi clears the long-run bar (${longBar.toFixed(1)} mi).`;
  } else if (zone && zone.index >= 4) {
    character = "hard";
    why = `Averaged ${hr} bpm — ${zone.label}, race-effort territory.`;
  } else if (zone && zone.index === 3) {
    character = "steady";
    why = `Averaged ${hr} bpm — ${zone.label}, above the easy cap of ${plan.paceGuidance.hrEasyCap}.`;
  } else if (zone) {
    character = "easy";
    why = `Averaged ${hr} bpm — ${zone.label}, genuinely aerobic.`;
  } else {
    // No HR: fall back to pace against the athlete's easy band.
    const easyMax = plan.paceGuidance.easyMaxSecPerMi;
    character = run.paceSecPerMi < easyMax * 0.9 ? "steady" : "easy";
    why = "No heart rate recorded — classified from pace alone.";
  }

  const label = progression ? `${character} · progression` : character;
  return { character, label, zoneLabel: zone?.label ?? null, progression, why };
}
