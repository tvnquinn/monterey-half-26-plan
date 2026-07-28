import type { RunActivity } from "./types";

interface TrkPt {
  lat: number;
  lon: number;
  ele: number;
  time: string;
}

function haversineMeters(a: TrkPt, b: TrkPt): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lon - a.lon);
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseTrackPoints(gpxText: string): TrkPt[] {
  const pts: TrkPt[] = [];
  const re =
    /<trkpt lat="([^"]+)" lon="([^"]+)"><ele>([^<]*)<\/ele><time>([^<]+)<\/time>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(gpxText))) {
    pts.push({
      lat: Number(match[1]),
      lon: Number(match[2]),
      ele: Number(match[3]),
      time: match[4],
    });
  }
  return pts;
}

export function convertGpxText(gpxText: string, filename = "outdoor-run.gpx"): RunActivity | null {
  const pts = parseTrackPoints(gpxText);
  if (pts.length < 2) return null;

  let distM = 0;
  let elevUp = 0;
  for (let i = 1; i < pts.length; i++) {
    distM += haversineMeters(pts[i - 1], pts[i]);
    const de = pts[i].ele - pts[i - 1].ele;
    if (de > 0) elevUp += de;
  }

  const start = new Date(pts[0].time);
  const end = new Date(pts[pts.length - 1].time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const movingTimeSec = Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000));
  const distanceMi = distM / 1609.344;
  if (distanceMi < 0.05) return null;

  const paceSecPerMi = Math.round(movingTimeSec / distanceMi);
  const stem = filename.replace(/\.[^.]+$/, "") || "outdoor-run";

  return {
    id: `gpx-${stem}`,
    source: "manual",
    name: "Outdoor Run",
    startDate: start.toISOString(),
    distanceMi: Number(distanceMi.toFixed(2)),
    movingTimeSec,
    elapsedTimeSec: movingTimeSec,
    paceSecPerMi,
    elevationFt: Math.round(elevUp * 3.28084),
  };
}

export function convertGpxFiles(
  files: Array<{ name: string; text: string }>,
): RunActivity[] {
  return files
    .map((f) => convertGpxText(f.text, f.name))
    .filter((r): r is RunActivity => Boolean(r));
}
