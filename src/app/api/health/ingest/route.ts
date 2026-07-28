import { NextRequest, NextResponse } from "next/server";
import { convertHaePayload } from "@/lib/hae";
import { convertGpxFiles } from "@/lib/gpx";
import { upsertRuns } from "@/lib/storage";
import type { RunActivity } from "@/lib/types";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.HEALTH_INGEST_TOKEN;
  if (!expected) return true;
  const header =
    req.headers.get("x-api-key") ||
    req.headers.get("api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === expected;
}

export async function POST(req: NextRequest) {
  try {
    if (!checkAuth(req)) return unauthorized();

    const contentType = req.headers.get("content-type") || "";
    let runs: RunActivity[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("file").filter((f): f is File => f instanceof File);
      if (!files.length) {
        return NextResponse.json({ error: "Expected file field" }, { status: 400 });
      }

      const gpxFiles: { name: string; text: string }[] = [];
      for (const file of files) {
        const text = await file.text();
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".gpx") || text.trimStart().startsWith("<?xml") || text.includes("<gpx")) {
          gpxFiles.push({ name: file.name, text });
        } else {
          runs.push(...convertHaePayload(JSON.parse(text)));
        }
      }
      if (gpxFiles.length) {
        runs.push(...convertGpxFiles(gpxFiles));
      }
    } else {
      const payload = await req.json();
      runs = convertHaePayload(payload);
    }

    if (runs.length === 0) {
      return NextResponse.json({
        imported: 0,
        message:
          "No running workouts found. Upload Health Auto Export workout JSON or Outdoor Run GPX files.",
      });
    }

    const merged = await upsertRuns(runs);
    return NextResponse.json({
      imported: runs.length,
      total: merged.length,
      source: "health-auto-export",
      sample: runs.slice(0, 3).map((r) => ({
        date: r.startDate.slice(0, 10),
        name: r.name,
        distanceMi: r.distanceMi,
        paceSecPerMi: r.paceSecPerMi,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 400 },
    );
  }
}
