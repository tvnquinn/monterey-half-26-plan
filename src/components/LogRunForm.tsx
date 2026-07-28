"use client";

import { useMemo, useState, type FormEvent } from "react";

interface LogRunFormProps {
  onLogged: () => void;
}

function todayInputValue() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function paceToSeconds(pace: string): number | null {
  const cleaned = pace.trim();
  if (!cleaned) return null;
  const parts = cleaned.split(":");
  if (parts.length !== 2) return null;
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
  return m * 60 + s;
}

export function LogRunForm({ onLogged }: LogRunFormProps) {
  const [date, setDate] = useState(todayInputValue);
  const [name, setName] = useState("Easy outdoor run");
  const [distanceMi, setDistanceMi] = useState("4.5");
  const [pace, setPace] = useState("12:30");
  const [avgHr, setAvgHr] = useState("150");
  const [calories, setCalories] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const dist = Number(distanceMi);
    const paceSec = paceToSeconds(pace);
    if (!dist || !paceSec) return null;
    const moving = Math.round(dist * paceSec);
    return { dist, paceSec, moving };
  }, [distanceMi, pace]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!preview) {
      setStatus("Enter distance and pace like 12:30");
      return;
    }
    setBusy(true);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/openclaw/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startDate: `${date}T12:00:00`,
          distanceMi: preview.dist,
          movingTimeSec: preview.moving,
          paceSecPerMi: preview.paceSec,
          averageHeartrate: avgHr ? Number(avgHr) : undefined,
          calories: calories ? Number(calories) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json.error || "Failed to save run");
        return;
      }
      setStatus(`Saved · ${json.total} runs total`);
      onLogged();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="log-form" onSubmit={submit}>
      <div className="log-grid">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Distance (mi)
          <input
            inputMode="decimal"
            value={distanceMi}
            onChange={(e) => setDistanceMi(e.target.value)}
            required
          />
        </label>
        <label>
          Pace (min/mi)
          <input
            placeholder="12:30"
            value={pace}
            onChange={(e) => setPace(e.target.value)}
            required
          />
        </label>
        <label>
          Avg HR
          <input
            inputMode="numeric"
            value={avgHr}
            onChange={(e) => setAvgHr(e.target.value)}
            placeholder="150"
          />
        </label>
        <label>
          Calories
          <input
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="optional"
          />
        </label>
      </div>
      <div className="log-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          Log run
        </button>
        {preview ? (
          <span className="muted">
            ≈ {(preview.moving / 60).toFixed(0)} min moving @ from Apple Fitness / watch stats
          </span>
        ) : null}
      </div>
      {status ? <p className="sync-msg">{status}</p> : null}
    </form>
  );
}
