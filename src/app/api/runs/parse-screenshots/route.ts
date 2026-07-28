import { NextRequest, NextResponse } from "next/server";
import { extractRunFromScreenshots, visionConfigured } from "@/lib/screenshot-run";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    visionConfigured: visionConfigured(),
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!visionConfigured()) {
      return NextResponse.json(
        {
          error:
            "Add GEMINI_API_KEY (free at https://aistudio.google.com/apikey) or OPENAI_API_KEY to Vercel env vars.",
        },
        { status: 503 },
      );
    }

    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) {
      return NextResponse.json({ error: "Add 1+ screenshots for one run" }, { status: 400 });
    }
    if (files.length > 6) {
      return NextResponse.json({ error: "Max 6 screenshots per run" }, { status: 400 });
    }

    const images = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type || file.name}` },
          { status: 400 },
        );
      }
      if (file.size > 8_000_000) {
        return NextResponse.json({ error: `${file.name} is too large (max 8MB)` }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      images.push({
        mime: file.type || "image/jpeg",
        base64: buf.toString("base64"),
      });
    }

    const draft = await extractRunFromScreenshots(images);
    return NextResponse.json({ draft, imageCount: images.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse screenshots" },
      { status: 400 },
    );
  }
}
