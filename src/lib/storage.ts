import { promises as fs } from "fs";
import path from "path";
import { getSupabase, supabaseConfigured } from "./supabase";
import type { RunActivity, TrainingPlan } from "./types";

const dataDir = path.join(process.cwd(), "data");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function loadPlan(): Promise<TrainingPlan> {
  const raw = await fs.readFile(path.join(dataDir, "plan.json"), "utf8");
  return JSON.parse(raw) as TrainingPlan;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

type RunRow = {
  id: string;
  source: RunActivity["source"];
  strava_id: number | null;
  name: string;
  start_date: string;
  distance_mi: number;
  moving_time_sec: number;
  elapsed_time_sec: number;
  pace_sec_per_mi: number;
  elevation_ft: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  calories: number | null;
  suffer_score: number | null;
  splits: RunActivity["splits"] | null;
  raw: Record<string, unknown> | null;
};

function rowToRun(row: RunRow): RunActivity {
  return {
    id: row.id,
    source: row.source,
    stravaId: row.strava_id ?? undefined,
    name: row.name,
    startDate: row.start_date,
    distanceMi: row.distance_mi,
    movingTimeSec: row.moving_time_sec,
    elapsedTimeSec: row.elapsed_time_sec,
    paceSecPerMi: row.pace_sec_per_mi,
    elevationFt: row.elevation_ft,
    averageHeartrate: row.average_heartrate ?? undefined,
    maxHeartrate: row.max_heartrate ?? undefined,
    averageCadence: row.average_cadence ?? undefined,
    calories: row.calories ?? undefined,
    sufferScore: row.suffer_score ?? undefined,
    splits: row.splits ?? undefined,
    condition:
      (row.raw as { condition?: RunActivity["condition"] } | null)?.condition ??
      undefined,
    raw: row.raw ?? undefined,
  };
}

function runToRow(run: RunActivity): RunRow {
  return {
    id: run.id,
    source: run.source,
    strava_id: run.stravaId ?? null,
    name: run.name,
    start_date: run.startDate,
    distance_mi: run.distanceMi,
    moving_time_sec: run.movingTimeSec,
    elapsed_time_sec: run.elapsedTimeSec,
    pace_sec_per_mi: run.paceSecPerMi,
    elevation_ft: run.elevationFt,
    average_heartrate: run.averageHeartrate ?? null,
    max_heartrate: run.maxHeartrate ?? null,
    average_cadence: run.averageCadence ?? null,
    calories: run.calories ?? null,
    suffer_score: run.sufferScore ?? null,
    splits: run.splits ?? null,
    // Supabase has no condition column; ride along in raw so it round-trips.
    raw: run.condition
      ? { ...(run.raw ?? {}), condition: run.condition }
      : (run.raw ?? null),
  };
}

async function loadRunsLocal(): Promise<RunActivity[]> {
  try {
    const raw = await fs.readFile(path.join(dataDir, "runs.json"), "utf8");
    return JSON.parse(raw) as RunActivity[];
  } catch {
    return [];
  }
}

async function saveRunsLocal(runs: RunActivity[]): Promise<void> {
  await ensureDataDir();
  const sorted = [...runs].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
  await fs.writeFile(path.join(dataDir, "runs.json"), JSON.stringify(sorted, null, 2));
}

async function loadRunsSupabase(): Promise<RunActivity[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw new Error(`Supabase loadRuns failed: ${error.message}`);
  return (data as RunRow[]).map(rowToRun);
}

async function upsertRunsSupabase(incoming: RunActivity[]): Promise<RunActivity[]> {
  const supabase = getSupabase();
  const rows = incoming.map(runToRow);
  const { error } = await supabase.from("runs").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsertRuns failed: ${error.message}`);
  return loadRunsSupabase();
}

export async function loadRuns(): Promise<RunActivity[]> {
  if (supabaseConfigured()) return loadRunsSupabase();
  return loadRunsLocal();
}

export async function saveRuns(runs: RunActivity[]): Promise<void> {
  if (supabaseConfigured()) {
    await upsertRunsSupabase(runs);
    return;
  }
  await saveRunsLocal(runs);
}

export async function upsertRuns(incoming: RunActivity[]): Promise<RunActivity[]> {
  if (supabaseConfigured()) {
    return upsertRunsSupabase(incoming);
  }

  const existing = await loadRunsLocal();
  const byKey = new Map<string, RunActivity>();
  for (const run of existing) {
    const key = run.stravaId ? `strava:${run.stravaId}` : run.id;
    byKey.set(key, run);
  }
  for (const run of incoming) {
    const key = run.stravaId ? `strava:${run.stravaId}` : run.id;
    byKey.set(key, run);
  }
  const merged = Array.from(byKey.values());
  await saveRunsLocal(merged);
  return merged;
}

async function loadTokensLocal(): Promise<StravaTokens | null> {
  try {
    const raw = await fs.readFile(path.join(dataDir, "strava-tokens.json"), "utf8");
    return JSON.parse(raw) as StravaTokens;
  } catch {
    return null;
  }
}

async function saveTokensLocal(tokens: StravaTokens): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(
    path.join(dataDir, "strava-tokens.json"),
    JSON.stringify(tokens, null, 2),
  );
}

export async function loadTokens(): Promise<StravaTokens | null> {
  if (!supabaseConfigured()) return loadTokensLocal();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("strava_tokens")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Supabase loadTokens failed: ${error.message}`);
  if (!data) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Number(data.expires_at),
    athlete: data.athlete ?? undefined,
  };
}

export async function saveTokens(tokens: StravaTokens): Promise<void> {
  if (!supabaseConfigured()) {
    await saveTokensLocal(tokens);
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("strava_tokens").upsert(
    {
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      athlete: tokens.athlete ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`Supabase saveTokens failed: ${error.message}`);
}

export function storageMode(): "supabase" | "local" {
  return supabaseConfigured() ? "supabase" : "local";
}
