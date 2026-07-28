"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { CoachReport, RunActivity, TrainingPlan } from "@/lib/types";
import { formatDuration, paceToString } from "@/lib/format";

interface CoachPayload {
  plan: TrainingPlan;
  report: CoachReport;
  runs: RunActivity[];
  meta?: {
    storage: "supabase" | "local";
    supabaseConfigured: boolean;
    stravaConfigured: boolean;
  };
}

function priorityClass(priority: string) {
  switch (priority) {
    case "critical":
      return "rec-critical";
    case "high":
      return "rec-high";
    case "medium":
      return "rec-medium";
    default:
      return "rec-low";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "done":
      return "Done";
    case "partial":
      return "Partial";
    case "missed":
      return "Missed";
    case "upcoming":
      return "Upcoming";
    case "optional_skipped":
      return "Optional";
    default:
      return status;
  }
}

export function Dashboard() {
  const [data, setData] = useState<CoachPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/coach", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load coach data");
        const json = (await res.json()) as CoachPayload;
        setData(json);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncRuns() {
    setSyncMsg("Syncing…");
    const res = await fetch("/api/strava/sync", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setSyncMsg(json.error || "Sync failed");
      return;
    }
    setSyncMsg(
      json.message ||
        `Imported ${json.imported} from ${json.source} · ${json.total} total runs`,
    );
    load();
  }

  if (error) {
    return (
      <div className="shell">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <p className="muted">Loading your plan…</p>
      </div>
    );
  }

  const { plan, report, runs } = data;
  const pg = report.paceGuidance;
  const week = report.currentWeek;

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow animate-fade">Nov 8 · Half Marathon</p>
          <h1 className="brand animate-rise">SUB-2</h1>
          <p className="lede animate-fade delay-1">
            Adaptive coach for your build — Strava stats in, pace guidance and plan
            changes out.
          </p>
          <div className="cta-row animate-fade delay-2">
            <button type="button" className="btn primary" onClick={syncRuns} disabled={pending}>
              Sync runs
            </button>
            <a className="btn ghost" href="/api/strava/auth">
              Connect Strava
            </a>
            <a className="btn ghost" href="/api/calendar">
              Add to calendar
            </a>
          </div>
          {syncMsg ? <p className="sync-msg">{syncMsg}</p> : null}
        </div>
        <div className="hero-stats animate-rise delay-1">
          <div>
            <span className="stat-label">Days to race</span>
            <strong>{report.daysToRace}</strong>
          </div>
          <div>
            <span className="stat-label">Sub-2 odds</span>
            <strong>{report.sub2OddsBand}</strong>
          </div>
          <div>
            <span className="stat-label">Est. half</span>
            <strong>
              {pg.estimatedHalfSec ? formatDuration(pg.estimatedHalfSec) : "—"}
            </strong>
          </div>
        </div>
      </header>

      <p className="summary">{report.summary}</p>

      <section className="grid-2">
        <article className="panel">
          <h2>This week</h2>
          {week ? (
            <>
              <div className="meter">
                <div
                  className="meter-fill"
                  style={{ width: `${Math.min(week.progressPct, 100)}%` }}
                />
              </div>
              <p className="meter-label">
                {week.loggedMi.toFixed(1)} mi · target {week.targetLow}–{week.targetHigh} ·{" "}
                {week.progressPct}%
              </p>
              <ul className="session-list">
                {week.sessions.map((s) => (
                  <li key={s.session.id} className={`session ${s.status}`}>
                    <div>
                      <strong>
                        {s.session.date.slice(5)} · {s.session.type.replace("_", " ")}
                      </strong>
                      <span>
                        {s.session.targetMi} mi
                        {s.session.notes ? ` — ${s.session.notes}` : ""}
                      </span>
                    </div>
                    <em>{statusLabel(s.status)}</em>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">No active plan week for today.</p>
          )}
        </article>

        <article className="panel">
          <h2>Pace guidance</h2>
          <div className="pace-grid">
            <div>
              <span className="stat-label">Easy</span>
              <strong>
                {paceToString(pg.easyMinSecPerMi)}–{paceToString(pg.easyMaxSecPerMi)}
              </strong>
            </div>
            <div>
              <span className="stat-label">Race pace</span>
              <strong>{paceToString(pg.racePaceSecPerMi)}</strong>
            </div>
            <div>
              <span className="stat-label">Confidence</span>
              <strong>{pg.confidence}</strong>
            </div>
          </div>
          <ul className="rationale">
            {pg.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel">
        <h2>Active recommendations</h2>
        <div className="recs">
          {report.recommendations.map((rec) => (
            <div key={rec.id} className={`rec ${priorityClass(rec.priority)}`}>
              <div className="rec-top">
                <strong>{rec.title}</strong>
                <span>{rec.priority}</span>
              </div>
              <p>{rec.detail}</p>
              {rec.action ? <p className="action">{rec.action}</p> : null}
              {rec.planChange ? (
                <p className="plan-change">
                  Plan signal: {rec.planChange.type}
                  {rec.planChange.weekId ? ` · week ${rec.planChange.weekId}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="grid-2">
        <article className="panel">
          <h2>Recent runs</h2>
          <ul className="run-list">
            {report.recentRuns.map((run) => (
              <li key={run.id}>
                <div>
                  <strong>{run.startDate.slice(0, 10)}</strong>
                  <span>{run.name}</span>
                </div>
                <div className="run-metrics">
                  <span>{run.distanceMi.toFixed(2)} mi</span>
                  <span>{paceToString(run.paceSecPerMi)}/mi</span>
                  <span>{formatDuration(run.movingTimeSec)}</span>
                  <span>{run.averageHeartrate ? `${run.averageHeartrate} bpm` : "— bpm"}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Mileage plan</h2>
          <ul className="mileage-list">
            {report.weeklyMileage.map((w) => {
              const pct = Math.min(100, (w.loggedMi / w.targetLow) * 100);
              return (
                <li key={w.weekId}>
                  <div className="mileage-row">
                    <span>
                      W{w.weekId} · {w.start.slice(5)}
                    </span>
                    <span>
                      {w.loggedMi.toFixed(1)} / {w.targetLow}–{w.targetHigh}
                    </span>
                  </div>
                  <div className="meter thin">
                    <div className="meter-fill" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
      </section>

      <section className="panel muted-panel">
        <h2>How updates work</h2>
        <ol className="howto">
          <li>Upload runs to Strava as usual (Watch/iPhone → Strava).</li>
          <li>Click <strong>Sync runs</strong> (or Connect Strava once for OAuth).</li>
          <li>
            Full stats are stored: distance, pace, HR, elevation, splits, calories —
            used to retune easy pace and recommendations.
          </li>
          <li>
            <strong>Add to calendar</strong> downloads an .ics of all planned sessions for
            Apple/Google Calendar reminders.
          </li>
        </ol>
        <p className="muted">
          Stored runs: {runs.length}. Storage: {data.meta?.storage ?? "local"}
          {data.meta?.supabaseConfigured ? " (Supabase)" : ""}. Goal:{" "}
          {plan.athlete.goalTime} ({paceToString(plan.athlete.goalPaceSecPerMi)}
          /mi). Prior half: {plan.athlete.priorHalf}.
        </p>
      </section>
    </div>
  );
}
