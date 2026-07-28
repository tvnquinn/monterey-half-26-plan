import type { SessionType } from "./types";

export interface SessionDefinition {
  type: SessionType;
  /** Short label used on session rows. */
  short: string;
  /** One-line definition — lives in the legend, not on every row. */
  what: string;
  /** How it should feel, so pace is a sanity check rather than a rule. */
  feel: string;
  /** True for anything that isn't a run — drives the muted row styling. */
  nonRun?: boolean;
}

export const SESSION_DEFINITIONS: SessionDefinition[] = [
  {
    type: "easy",
    short: "easy",
    what: "Conversational aerobic running. The bulk of the plan.",
    feel: "Full sentences without gasping. Z2, true easy ~143 bpm. If HR climbs, slow down — the pace is whatever your HR allows that day.",
  },
  {
    type: "easy_strides",
    short: "strides",
    what: "An easy run, then 4–6 × 20s smooth accelerations with full recovery.",
    feel: "Strides are not a workout. Build to about mile effort, stay relaxed, walk or jog until fully recovered. You should finish fresh.",
  },
  {
    type: "long",
    short: "long",
    what: "Friday cornerstone. Easy pace, longer duration.",
    feel: "Slightly slower than a normal easy run is correct. Time on feet is the goal, not pace.",
  },
  {
    type: "threshold",
    short: "threshold",
    what: "Sustained comfortably-hard running — roughly one-hour race effort.",
    feel: "A few words at a time, not a sentence. Z3. Should feel controlled and repeatable, never like a time trial.",
  },
  {
    type: "quality",
    short: "B-pace",
    what: "Race-rhythm practice at goal-B pace (2:10 / ~9:55).",
    feel: "Hard but rhythmic — the pace you want to hold on race day. If you can't hold form, the rep is over.",
  },
  {
    type: "race",
    short: "race",
    what: "Monterey Bay Half.",
    feel: "Open controlled at B-pace. If mile 9 feels easy, then you spend it.",
  },
  {
    type: "strength",
    short: "strength",
    what: "Lower-body strength on a non-run day.",
    feel: "Quality of movement over load. Stop a set early rather than grinding a rep with bad form.",
    nonRun: true,
  },
  {
    type: "rest",
    short: "rest",
    what: "No planned training.",
    feel: "Pickleball is fine. Rest is a session — it's when the adaptation happens.",
    nonRun: true,
  },
];

const byType = new Map(SESSION_DEFINITIONS.map((d) => [d.type, d]));

export function sessionDefinition(type: SessionType): SessionDefinition | undefined {
  return byType.get(type);
}

export function isNonRunSession(type: SessionType): boolean {
  return Boolean(byType.get(type)?.nonRun);
}

export function sessionShortLabel(type: SessionType): string {
  return byType.get(type)?.short ?? type.replaceAll("_", " ");
}
