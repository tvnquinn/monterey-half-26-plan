import { NextRequest, NextResponse } from "next/server";
import { convertHaePayload } from "@/lib/hae";
import { upsertRuns } from "@/lib/storage";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.HEALTH_INGEST_TOKEN;
  if (!expected) return true; // open during setup; set token later
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
    let payload: unknown;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Expected file field" }, { status: 400 });
      }
      const text = await file.text();
      payload = JSON.parse(text);
    } else {
      payload = await req.json();
    }

    const runs = convertHaePayload(payload);
    if (runs.length === 0) {
      return NextResponse.json({
        imported: 0,
        total: (await upsertRuns([])).length,
        message:
          "No running workouts found in payload. Make sure the export includes Workouts (Outdoor/Indoor Run).",
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
