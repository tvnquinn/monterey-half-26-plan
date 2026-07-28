export type SessionType =
  | "easy"
  | "easy_strides"
  | "long"
  | "quality"
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
  /** Single weekly mileage target (mi). */
  targetMi: number;
  phase: Phase;
  focus: string;
  sessions: PlannedSession[];
}

export interface TrainingPlan {
  athlete: {
    name: string;
    goalTime: string;
    goalPaceSecPerMi: number;
    priorHalf: string;
    notes: string;
  };
  race: {
    name: string;
    date: string;
    distanceMi: number;
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

export interface SessionStatus {
  session: PlannedSession;
  status: "done" | "partial" | "missed" | "upcoming" | "optional_skipped";
  matchedRun?: RunActivity;
  distanceDeltaMi?: number;
  paceRec?: SessionPaceRec;
}

export interface WeekStatus {
  week: PlanWeek;
  loggedMi: number;
  targetMi: number;
  /** Progress vs weekly target (can exceed 100). */
  progressPct: number;
  overTarget: boolean;
  sessions: SessionStatus[];
  longestMi: number;
  avgPaceSecPerMi: number | null;
  avgHr: number | null;
}

export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export interface Recommendation {
  id: string;
  priority: RecommendationPriority;
  title: string;
  detail: string;
  action?: string;
  planChange?: {
    type: "hold_mileage" | "cut_session" | "shift_quality" | "ease_pace" | "advance_quality";
    weekId?: number;
  };
}

export interface PaceGuidanceLive {
  easyMinSecPerMi: number;
  easyMaxSecPerMi: number;
  racePaceSecPerMi: number;
  estimatedHalfSec: number | null;
  confidence: "low" | "medium" | "high";
  rationale: string[];
}

export interface GoalOdds {
  label: "A" | "B" | "C";
  timeLabel: string;
  timeSec: number;
  pct: number;
}

export interface PredictionSummary {
  goals: GoalOdds[];
  estimatedHalfSec: number | null;
  deltaMinVsPrevEst: number | null;
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
  recommendations: Recommendation[];
  /** @deprecated use predictions.goals */
  sub2OddsBand: string;
  predictions: PredictionSummary;
  mileageNarrative: MileageNarrative;
  summary: string;
  efficacy: EfficacyBacktestSummary;
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
