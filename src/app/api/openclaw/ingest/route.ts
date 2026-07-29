import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertRuns } from "@/lib/storage";
import type { RunActivity } from "@/lib/types";

const dropSchema = z.object({
  id: z.string().optional(),
  name: z.string().default("OpenClaw run"),
  startDate: z.string(),
  distanceMi: z.number().positive(),
  movingTimeSec: z.number().positive(),
  elapsedTimeSec: z.number().positive().optional(),
  paceSecPerMi: z.number().positive().optional(),
  elevationFt: z.number().optional(),
  averageHeartrate: z.number().optional(),
  maxHeartrate: z.number().optional(),
  calories: z.number().optional(),
  temperatureF: z.number().optional(),
  averageCadence: z.number().optional(),
  // Per-mile splits drive progression detection in run-assessment; without
  // them a negative-split run is indistinguishable from a steady one.
  splits: z
    .array(
      z.object({
        mile: z.number(),
        movingTimeSec: z.number(),
        paceSecPerMi: z.number(),
        elevationGain: z.number().optional(),
        averageHeartrate: z.number().optional(),
      }),
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];
    const runs: RunActivity[] = items.map((item, index) => {
      const parsed = dropSchema.parse(item);
      const pace =
        parsed.paceSecPerMi ??
        Math.round(parsed.movingTimeSec / parsed.distanceMi);
      return {
        id: parsed.id || `openclaw-${parsed.startDate}-${index}`,
        source: "manual",
        name: parsed.name,
        startDate: parsed.startDate,
        distanceMi: parsed.distanceMi,
        movingTimeSec: parsed.movingTimeSec,
        elapsedTimeSec: parsed.elapsedTimeSec ?? parsed.movingTimeSec,
        paceSecPerMi: pace,
        elevationFt: parsed.elevationFt ?? 0,
        averageHeartrate: parsed.averageHeartrate,
        maxHeartrate: parsed.maxHeartrate,
        calories: parsed.calories,
        temperatureF: parsed.temperatureF,
        averageCadence: parsed.averageCadence,
        splits: parsed.splits,
      };
    });

    const merged = await upsertRuns(runs);
    return NextResponse.json({ imported: runs.length, total: merged.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid drop payload" },
      { status: 400 },
    );
  }
}
