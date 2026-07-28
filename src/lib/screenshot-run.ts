import { z } from "zod";

export const extractedRunSchema = z.object({
  isRun: z.boolean(),
  activityType: z.string().optional(),
  name: z.string().default("Outdoor Run"),
  startDate: z.string().optional(),
  distanceMi: z.number().positive().optional(),
  movingTimeSec: z.number().int().positive().optional(),
  paceSecPerMi: z.number().int().positive().optional(),
  averageHeartrate: z.number().positive().optional(),
  maxHeartrate: z.number().positive().optional(),
  elevationFt: z.number().nonnegative().optional(),
  calories: z.number().positive().optional(),
  notes: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

export type ExtractedRun = z.infer<typeof extractedRunSchema>;

function paceToSeconds(raw: string): number | undefined {
  const m = raw.trim().match(/^(\d{1,2})[:'’](\d{2})$/);
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

function durationToSeconds(raw: string): number | undefined {
  const parts = raw.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return undefined;
}

export function finalizeExtractedRun(draft: ExtractedRun): ExtractedRun {
  const next = { ...draft };
  if (next.distanceMi && next.movingTimeSec && !next.paceSecPerMi) {
    next.paceSecPerMi = Math.round(next.movingTimeSec / next.distanceMi);
  }
  if (next.distanceMi && next.paceSecPerMi && !next.movingTimeSec) {
    next.movingTimeSec = Math.round(next.distanceMi * next.paceSecPerMi);
  }
  return next;
}

export function parseLooseStats(text: string): Partial<ExtractedRun> {
  const out: Partial<ExtractedRun> = {};
  const dist =
    text.match(/(\d+(?:\.\d+)?)\s*(?:mi|miles)\b/i) ||
    text.match(/Distance\s*[^\d]*(\d+(?:\.\d+)?)/i);
  if (dist) out.distanceMi = Number(dist[1]);

  const pace = text.match(/(?:Avg\.?\s*Pace|Pace)\s*[^\d]*(\d{1,2}[:'’]\d{2})/i);
  if (pace) out.paceSecPerMi = paceToSeconds(pace[1]);

  const moving =
    text.match(/(?:Moving\s*Time|Elapsed\s*Time|Time)\s*[^\d]*(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if (moving) out.movingTimeSec = durationToSeconds(moving[1]);

  const hr = text.match(/(?:Avg\.?\s*HR|Average\s*Heart\s*Rate|Heart\s*Rate)\s*[^\d]*(\d{2,3})/i);
  if (hr) out.averageHeartrate = Number(hr[1]);

  const elev = text.match(/(?:Elev(?:ation)?\s*Gain|Gain)\s*[^\d]*(\d{1,5})\s*(?:ft|feet)?/i);
  if (elev) out.elevationFt = Number(elev[1]);

  const cal = text.match(/(?:Calories|Cal)\s*[^\d]*(\d{2,5})/i);
  if (cal) out.calories = Number(cal[1]);

  const lower = text.toLowerCase();
  out.isRun = /(run|jog|trail)/i.test(lower);
  if (/ride|bike|swim|walk|hike|pickle|yoga|weight|soccer|tennis/i.test(lower) && !out.isRun) {
    out.isRun = false;
    out.activityType = "non-run";
  } else if (out.isRun) {
    out.activityType = "run";
    out.name = /indoor/i.test(lower) ? "Indoor Run" : "Outdoor Run";
  }
  return out;
}

const SYSTEM_PROMPT = `You extract ONE workout from Strava (or Apple Fitness) screenshots.
Return ONLY compact JSON with these fields:
{
  "isRun": boolean,
  "activityType": string,
  "name": string,
  "startDate": "ISO-8601 date/time if visible, else omit",
  "distanceMi": number (miles),
  "movingTimeSec": integer seconds,
  "paceSecPerMi": integer seconds per mile,
  "averageHeartrate": number,
  "maxHeartrate": number,
  "elevationFt": number,
  "calories": number,
  "notes": string,
  "confidence": "low"|"medium"|"high"
}
Rules:
- Multiple images may be the SAME run (overview + splits + charts). Merge into one workout.
- Convert km to miles (mi = km / 1.609344).
- Pace like 9:10 => 550 seconds.
- Time like 1:02:11 => 3731 seconds.
- If activity is not running/jogging/trail, set isRun=false.
- Prefer moving time over elapsed when both appear.
- Omit unknown fields rather than guessing wildly.`;

async function callOpenAI(
  images: Array<{ mime: string; base64: string }>,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: "Extract the single workout from these screenshots." },
    ...images.map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    })),
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI vision failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

async function callGemini(
  images: Array<{ mime: string; base64: string }>,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const parts: Array<Record<string, unknown>> = [
    { text: `${SYSTEM_PROMPT}\n\nExtract the single workout from these screenshots.` },
    ...images.map((img) => ({
      inline_data: { mime_type: img.mime, data: img.base64 },
    })),
  ];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini vision failed: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") || "{}";
  return text;
}

export function visionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export async function extractRunFromScreenshots(
  images: Array<{ mime: string; base64: string }>,
): Promise<ExtractedRun> {
  if (!images.length) {
    throw new Error("Upload at least one screenshot");
  }

  let raw = "{}";
  if (process.env.GEMINI_API_KEY) {
    raw = await callGemini(images);
  } else if (process.env.OPENAI_API_KEY) {
    raw = await callOpenAI(images);
  } else {
    throw new Error(
      "Screenshot parsing needs GEMINI_API_KEY (free) or OPENAI_API_KEY on Vercel.",
    );
  }

  const cleaned = raw.trim().replace(/^```json\s*|```$/g, "");
  const parsed = extractedRunSchema.partial().parse(JSON.parse(cleaned));
  const merged = finalizeExtractedRun(
    extractedRunSchema.parse({
      isRun: parsed.isRun ?? true,
      activityType: parsed.activityType,
      name: parsed.name || "Outdoor Run",
      startDate: parsed.startDate,
      distanceMi: parsed.distanceMi,
      movingTimeSec: parsed.movingTimeSec,
      paceSecPerMi: parsed.paceSecPerMi,
      averageHeartrate: parsed.averageHeartrate,
      maxHeartrate: parsed.maxHeartrate,
      elevationFt: parsed.elevationFt,
      calories: parsed.calories,
      notes: parsed.notes,
      confidence: parsed.confidence || "medium",
    }),
  );
  return merged;
}
