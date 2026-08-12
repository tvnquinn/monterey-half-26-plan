import type { RunAssessment } from "./run-assessment";

export type RunCondition =
  | "illness"
  | "injury"
  | "heat"
  | "travel"
  | "altitude";

export type SessionType =
  | "easy"
  | "easy_strides"
  | "long"
  | "quality"
  | "threshold"
  | "strength"
  | "race"
  | "rest";

export type Phase =
  | "chicago"
  | "base"
  | "build"
  | "italy"
  | "rebuild"
  | "quality"
  | "peak"
  | "taper"
  | "race";

export interface PlannedSession {
  id: string;
  date: string;
  type: SessionType;
  targetMi: number;
  optional?: boolean;
  notes?: string;
}

export interface PlanWeek {
  id: number;
  start: string;
  end: string;
  /** Weekly training mileage target (mi). Prefer deriving from sessions. */
  targetMi: number;
  phase: Phase;
  focus: string;
  sessions: PlannedSession[];
}

export interface TrainingPlan {
  athlete: {
    name: string;
    /** Stretch A-goal clock. */
    goalTime: string;
    goalPaceSecPerMi: number;
    /** Design / B-goal clock — quality workouts anchor here. */
    designGoalTime?: string;
    designPaceSecPerMi?: number;
    priorHalf: string;
    /** IANA zone used for all calendar-day math. Defaults to America/Los_Angeles. */
    timeZone?: string;
    notes: string;
  };
  race: {
    name: string;
    date: string;
    distanceMi: number;
    /** Course elev; Monterey ~0 flat coastal. */
    elevationFtPerMi?: number;
    /** Typical race-morning temperature (°F). */
    expectedTempF?: number;
  };
  constraints: {
    chicago: { start: string; end: string; maxRuns: number };
    italy: { start: string; end: string; mode: string };
    injuryFlags: string[];
  };
  paceGuidance: {
    easyMinSecPerMi: number;
    easyMaxSecPerMi: number;
    racePaceSecPerMi: number;
    designPaceSecPerMi?: number;
    /** Typical training elevation, for the flat-course credit. */
    trainingElevFtPerMi?: number;
    hrEasyCap: number;
    hrZones?: {
      z1: { max: number; label: string };
      z2: { min: number; max: number; label: string };
      z3: { min: number; max: number; label: string };
      z4: { min: number; max: number; label: string };
      z5: { min: number; label: string };
    };
    notes: string;
  };
  weeks: PlanWeek[];
}

export interface RunSplit {
  mile: number;
  movingTimeSec: number;
  paceSecPerMi: number;
  elevationGain?: number;
  averageHeartrate?: number;
}

export interface RunActivity {
  id: string;
  source: "strava" | "seed" | "manual";
  stravaId?: number;
  name: string;
  startDate: string;
  distanceMi: number;
  movingTimeSec: number;
  elapsedTimeSec: number;
  paceSecPerMi: number;
  elevationFt: number;
  averageHeartrate?: number;
  maxHeartrate?: number;
  averageCadence?: number;
  /** Ambient temperature at run time (°F), when the watch recorded it. */
  temperatureF?: number;
  /**
   * Circumstance that made this run unrepresentative of fitness. Such runs
   * still count toward volume and durability — the miles were real — but are
   * excluded from the efficiency-factor trend, which would otherwise read
   * illness or heat as aerobic decline.
   */
  condition?: RunCondition;
  calories?: number;
  sufferScore?: number;
  splits?: RunSplit[];
  raw?: Record<string, unknown>;
}

export interface SessionPaceRec {
  targetSecPerMi: number;
  minSecPerMi: number;
  maxSecPerMi: number;
  label: string;
  hrTarget?: number;
  hrZoneLabel?: string;
  hrZoneRange?: string;
  rationale: string;
}

export type SessionStatusKind =
  | "done"
  | "partial"
  | "missed"
  | "upcoming"
  | "today"
  | "substituted"
  | "optional_skipped";

export interface SessionStatus {
  session: PlannedSession;
  status: SessionStatusKind;
  /** True only for the single next actionable session. */
  isNext?: boolean;
  matchedRun?: RunActivity;
  /** An off-schedule run absorbed this planned session. */
  substitutedBy?: RunActivity;
  /** What the substituted run actually was, judged from the watch. */
  assessment?: RunAssessment;
  distanceDeltaMi?: number;
  paceRec?: SessionPaceRec;
}

export interface WeekStatus {
  week: PlanWeek;
  loggedMi: number;
  targetMi: number;
  /** Progress vs weekly training target (can exceed 100). */
  progressPct: number;
  /** Expected % of weekly target scheduled by today. */
  expectedPct: number;
  overTarget: boolean;
  sessions: SessionStatus[];
  longestMi: number;
  avgPaceSecPerMi: number | null;
  avgHr: number | null;
}

// Recommendation / RecommendationPriority lived here alongside a ~160-line
// buildRecommendations() in coach.ts. Nothing ever rendered it — the decision
// in LEARNINGS.md was to keep guidance on the session rows instead of a
// separate card — so it shipped on every /api/coach response for nothing.

export interface PaceGuidanceLive {
  easyMinSecPerMi: number;
  easyMaxSecPerMi: number;
  racePaceSecPerMi: number;
  estimatedHalfSec: number | null;
  confidence: "low" | "medium" | "high";
  /** Which signal produced the estimate — see ./fitness. */
  method: "prior_only" | "ef_trend" | "hard_effort" | "blended";
  rationale: string[];
}

export type GoalKey = "A" | "A-" | "B" | "C";

export interface GoalOdds {
  label: GoalKey;
  timeLabel: string;
  timeSec: number;
  pct: number;
}

export interface PredictionSummary {
  goals: GoalOdds[];
  /** Current fitness, before crediting remaining training. */
  estimatedHalfSec: number | null;
  /** Race-day projection: fitness + earned improvement. */
  projectedSec: number;
  /** Seconds of improvement credited from logged work so far. */
  creditSec: number;
  /** Spread of plausible outcomes, minutes. Widens with time to race. */
  sigmaMin: number;
  confidence: "low" | "medium" | "high";
  /** Change in the estimate over the trailing window (negative = faster). */
  trendMin: number | null;
  trendWindowDays: number;
  deltaMinVsPrior: number | null;
  priorHalfSec: number;
  priorHalfLabel: string;
}

export interface MileageNarrative {
  status: "ahead" | "on_track" | "behind" | "rest";
  headline: string;
  detail: string;
}

export interface CoachReport {
  asOf: string;
  daysToRace: number;
  currentWeek: WeekStatus | null;
  upcomingWeeks: WeekStatus[];
  recentRuns: RunActivity[];
  weeklyMileage: {
    weekId: number;
    start: string;
    loggedMi: number;
    targetMi: number;
    longMi: number;
    longestLoggedMi: number;
  }[];
  paceGuidance: PaceGuidanceLive;
  predictions: PredictionSummary;
  mileageNarrative: MileageNarrative;
  summary: string;
  efficacy: EfficacyBacktestSummary;
  /** Next actionable run/strength session across the plan. */
  nextSession: SessionStatus | null;
}

export interface EfficacyBacktestSummary {
  usableRuns: number;
  hrTaggedRuns: number;
  maeSec: number;
  baselineMaeSec: number;
  skillScore: number;
  meanAbsPctError: number;
  hrPaceCorrelation: number | null;
  verdict: string;
  limitations: string[];
  nextRunHint: string;
  samplePredictions: Array<{
    date: string;
    actualPaceSec: number;
    predictedPaceSec: number;
    errorSec: number;
  }>;
}
