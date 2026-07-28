import {
  metersToMiles,
  mpsToPaceSecPerMi,
} from "./format";
import { loadTokens, saveTokens, type StravaTokens } from "./storage";
import type { RunActivity, RunSplit } from "./types";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_AUTH = "https://www.strava.com/oauth";

export function stravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function getStravaRedirectUri(): string {
  if (process.env.STRAVA_REDIRECT_URI) return process.env.STRAVA_REDIRECT_URI;
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/strava/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/strava/callback`;
  }
  return "http://localhost:3000/api/strava/callback";
}

export function getAuthorizeUrl(state = "runcoach"): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID || "",
    redirect_uri: getStravaRedirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  });
  return `${STRAVA_AUTH}/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${await res.text()}`);
  }
  const data = await res.json();
  const tokens: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
  };
  await saveTokens(tokens);
  return tokens;
}

async function refreshIfNeeded(tokens: StravaTokens): Promise<StravaTokens> {
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 60) return tokens;

  const res = await fetch(`${STRAVA_AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava refresh failed: ${await res.text()}`);
  }
  const data = await res.json();
  const next: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: tokens.athlete,
  };
  await saveTokens(next);
  return next;
}

async function stravaGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Strava GET ${path} failed: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

interface StravaActivityListItem {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  kilojoules?: number;
  suffer_score?: number;
}

interface StravaActivityDetail extends StravaActivityListItem {
  calories?: number;
  splits_standard?: Array<{
    distance: number;
    elapsed_time: number;
    moving_time: number;
    average_heartrate?: number;
    elevation_difference?: number;
    split: number;
  }>;
}

function mapActivity(detail: StravaActivityDetail): RunActivity {
  const distanceMi = metersToMiles(detail.distance);
  const paceSecPerMi =
    detail.average_speed > 0
      ? mpsToPaceSecPerMi(detail.average_speed)
      : detail.moving_time / Math.max(distanceMi, 0.01);

  const splits: RunSplit[] | undefined = detail.splits_standard?.map((s) => ({
    mile: s.split,
    movingTimeSec: s.moving_time,
    paceSecPerMi: s.moving_time / Math.max(metersToMiles(s.distance), 0.01),
    elevationGain: s.elevation_difference,
    averageHeartrate: s.average_heartrate,
  }));

  return {
    id: `strava-${detail.id}`,
    source: "strava",
    stravaId: detail.id,
    name: detail.name,
    startDate: detail.start_date,
    distanceMi: Number(distanceMi.toFixed(2)),
    movingTimeSec: detail.moving_time,
    elapsedTimeSec: detail.elapsed_time,
    paceSecPerMi: Math.round(paceSecPerMi),
    elevationFt: Math.round(detail.total_elevation_gain * 3.28084),
    averageHeartrate: detail.average_heartrate
      ? Math.round(detail.average_heartrate)
      : undefined,
    maxHeartrate: detail.max_heartrate
      ? Math.round(detail.max_heartrate)
      : undefined,
    averageCadence: detail.average_cadence,
    calories: detail.calories ?? (detail.kilojoules ? Math.round(detail.kilojoules) : undefined),
    sufferScore: detail.suffer_score,
    splits,
    raw: detail as unknown as Record<string, unknown>,
  };
}

export async function fetchRecentRuns(afterEpochSec?: number): Promise<RunActivity[]> {
  const existing = await loadTokens();
  if (!existing) {
    throw new Error("Strava not connected");
  }
  const tokens = await refreshIfNeeded(existing);

  const params = new URLSearchParams({
    per_page: "50",
    page: "1",
  });
  if (afterEpochSec) params.set("after", String(afterEpochSec));

  const list = await stravaGet<StravaActivityListItem[]>(
    `/athlete/activities?${params.toString()}`,
    tokens.access_token,
  );

  const runs = list.filter(
    (a) => a.type === "Run" || a.sport_type === "Run" || a.sport_type === "TrailRun",
  );

  const detailed: RunActivity[] = [];
  for (const item of runs.slice(0, 30)) {
    const detail = await stravaGet<StravaActivityDetail>(
      `/activities/${item.id}`,
      tokens.access_token,
    );
    detailed.push(mapActivity(detail));
  }
  return detailed;
}
