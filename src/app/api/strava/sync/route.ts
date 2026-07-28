import { NextResponse } from "next/server";
import { seedRuns } from "@/lib/seed-runs";
import { loadRuns, loadTokens, storageMode, upsertRuns } from "@/lib/storage";
import { fetchRecentRuns, stravaConfigured } from "@/lib/strava";
import { supabaseConfigured } from "@/lib/supabase";

export async function POST() {
  try {
    const tokens = await loadTokens();
    if (stravaConfigured() && tokens) {
      const after = Math.floor(new Date("2026-03-01").getTime() / 1000);
      const runs = await fetchRecentRuns(after);
      const merged = await upsertRuns(runs);
      return NextResponse.json({
        source: "strava",
        imported: runs.length,
        total: merged.length,
        storage: storageMode(),
      });
    }

    const existing = await loadRuns();
    if (existing.length === 0) {
      const merged = await upsertRuns(seedRuns);
      return NextResponse.json({
        source: "seed",
        imported: seedRuns.length,
        total: merged.length,
        storage: storageMode(),
        message: "Loaded demo runs from your recent Apple Fitness history. Connect Strava for live sync.",
      });
    }

    return NextResponse.json({
      source: "existing",
      imported: 0,
      total: existing.length,
      storage: storageMode(),
      message: tokens
        ? "Strava tokens present but client env is missing."
        : "Using stored runs. Connect Strava for automatic updates.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const runs = await loadRuns();
  const tokens = await loadTokens();
  return NextResponse.json({
    total: runs.length,
    stravaConnected: Boolean(tokens),
    stravaConfigured: stravaConfigured(),
    supabaseConfigured: supabaseConfigured(),
    storage: storageMode(),
  });
}
