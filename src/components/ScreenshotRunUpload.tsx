"use client";

import { useEffect, useState } from "react";
import { paceToString } from "@/lib/format";

interface Draft {
  isRun: boolean;
  activityType?: string;
  name: string;
  startDate?: string;
  distanceMi?: number;
  movingTimeSec?: number;
  paceSecPerMi?: number;
  averageHeartrate?: number;
  maxHeartrate?: number;
  elevationFt?: number;
  calories?: number;
  notes?: string;
  confidence?: string;
}

interface Props {
  onSaved: () => void;
}

function toDateInput(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function paceInput(sec?: number) {
  if (!sec) return "";
  return paceToString(sec);
}

function parsePace(raw: string): number | undefined {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function ScreenshotRunUpload({ onSaved }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [visionReady, setVisionReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/runs/parse-screenshots")
      .then((r) => r.json())
      .then((j) => setVisionReady(Boolean(j.visionConfigured)))
      .catch(() => setVisionReady(false));
  }, []);

  async function parseScreenshots() {
    if (!files.length) {
      setStatus("Pick 1–6 screenshots from the same Strava run");
      return;
    }
    setBusy(true);
    setStatus("Reading screenshots…");
    try {
      const form = new FormData();
      for (const file of files) form.append("file", file);
      const res = await fetch("/api/runs/parse-screenshots", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json.error || "Parse failed");
        return;
      }
      setDraft(json.draft);
      if (!json.draft.isRun) {
        setStatus(
          `Detected “${json.draft.activityType || "non-run"}” — not counted for half training. Upload a run instead.`,
        );
      } else {
        setStatus(`Draft ready (${json.draft.confidence || "medium"} confidence). Review and save.`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setStatus("Saving…");
    try {
      const payload = {
        ...draft,
        startDate: draft.startDate || `${toDateInput(draft.startDate)}T12:00:00`,
        distanceMi: Number(draft.distanceMi),
        movingTimeSec: Number(draft.movingTimeSec),
        paceSecPerMi: draft.paceSecPerMi,
        isRun: true,
        name: draft.name || "Outdoor Run",
      };
      const res = await fetch("/api/runs/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json.error || "Save failed");
        return;
      }
      setStatus(`Saved ${json.saved.distanceMi} mi run · ${json.total} total`);
      setFiles([]);
      setDraft(null);
      onSaved();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shot-box">
      {visionReady === false ? (
        <p className="sync-msg">
          Needs <code>GEMINI_API_KEY</code> (or OpenAI) in env.
        </p>
      ) : null}

      <label className="btn ghost upload-label">
        {files.length ? `${files.length} selected` : "Choose screenshots"}
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          hidden
          onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 6))}
        />
      </label>

      <div className="log-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !files.length || visionReady === false}
          onClick={parseScreenshots}
        >
          Extract
        </button>
        {draft?.isRun ? (
          <button type="button" className="btn ghost" disabled={busy} onClick={saveDraft}>
            Save
          </button>
        ) : null}
      </div>

      {draft ? (
        <div className="log-grid shot-grid">
          <label>
            Name
            <input
              value={draft.name || ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={toDateInput(draft.startDate)}
              onChange={(e) =>
                setDraft({ ...draft, startDate: `${e.target.value}T12:00:00` })
              }
            />
          </label>
          <label>
            Distance (mi)
            <input
              inputMode="decimal"
              value={draft.distanceMi ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, distanceMi: Number(e.target.value) || undefined })
              }
            />
          </label>
          <label>
            Pace (min/mi)
            <input
              value={paceInput(draft.paceSecPerMi)}
              onChange={(e) =>
                setDraft({ ...draft, paceSecPerMi: parsePace(e.target.value) })
              }
            />
          </label>
          <label>
            Moving time (sec)
            <input
              inputMode="numeric"
              value={draft.movingTimeSec ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  movingTimeSec: Number(e.target.value) || undefined,
                })
              }
            />
          </label>
          <label>
            Avg HR
            <input
              inputMode="numeric"
              value={draft.averageHeartrate ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  averageHeartrate: Number(e.target.value) || undefined,
                })
              }
            />
          </label>
          <label>
            Elev (ft)
            <input
              inputMode="numeric"
              value={draft.elevationFt ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  elevationFt: Number(e.target.value) || undefined,
                })
              }
            />
          </label>
          <label>
            Calories
            <input
              inputMode="numeric"
              value={draft.calories ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, calories: Number(e.target.value) || undefined })
              }
            />
          </label>
        </div>
      ) : null}

      {status ? <p className="sync-msg">{status}</p> : null}
    </div>
  );
}
