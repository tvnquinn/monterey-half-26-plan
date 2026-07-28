import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { finalizeExtractedRun, extractedRunSchema } from "@/lib/screenshot-run";
import { upsertRuns } from "@/lib/storage";
import type { RunActivity } from "@/lib/types";

const confirmSchema = extractedRunSchema.extend({
  startDate: z.string().min(4),
  distanceMi: z.number().positive(),
  movingTimeSec: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const body = confirmSchema.parse(await req.json());
    const draft = finalizeExtractedRun(body);

    if (!draft.isRun) {
      return NextResponse.json(
        {
          error:
            "This doesn’t look like a run. Non-run workouts aren’t counted toward half-marathon mileage.",
          draft,
        },
        { status: 400 },
      );
    }

    const startDate = body.startDate;
    const distanceMi = body.distanceMi;
    const movingTimeSec = body.movingTimeSec;
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }

    const paceSecPerMi =
      draft.paceSecPerMi || Math.round(movingTimeSec / distanceMi);

    const run: RunActivity = {
      id: `strava-shot-${start.toISOString()}-${distanceMi.toFixed(2)}`,
      source: "manual",
      name: draft.name || "Outdoor Run",
      startDate: start.toISOString(),
      distanceMi: Number(distanceMi.toFixed(2)),
      movingTimeSec,
      elapsedTimeSec: movingTimeSec,
      paceSecPerMi,
      elevationFt: Math.round(draft.elevationFt || 0),
      averageHeartrate: draft.averageHeartrate
        ? Math.round(draft.averageHeartrate)
        : undefined,
      maxHeartrate: draft.maxHeartrate ? Math.round(draft.maxHeartrate) : undefined,
      calories: draft.calories ? Math.round(draft.calories) : undefined,
      raw: { fromScreenshots: true, notes: draft.notes, confidence: draft.confidence },
    };

    const merged = await upsertRuns([run]);
    return NextResponse.json({ saved: run, total: merged.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save run" },
      { status: 400 },
    );
  }
}
