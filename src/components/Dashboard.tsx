"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { CoachReport, SessionStatus, TrainingPlan, WeekStatus } from "@/lib/types";
import { formatDuration, paceToString, weekdayShort } from "@/lib/format";
import { LogRunForm } from "@/components/LogRunForm";
import { HealthUpload } from "@/components/HealthUpload";
import { ScreenshotRunUpload } from "@/components/ScreenshotRunUpload";

type Tab = "plan" | "log" | "recent" | "backtest";

interface CoachPayload {
  plan: TrainingPlan;
  report: CoachReport;
  runs: { length: number };
  meta?: {
    storage: "supabase" | "local";
    supabaseConfigured: boolean;
    stravaConfigured: boolean;
  };
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
      return "Up next";
    case "optional_skipped":
      return "Skip OK";
    default:
      return status;
  }
}

function SessionRow({ s }: { s: SessionStatus }) {
  const pace = s.paceRec;
  return (
    <li className={`session ${s.status}`}>
      <details className="session-details">
        <summary>
          <div className="session-summary-main">
            <strong>
              {weekdayShort(s.session.date)} {s.session.date.slice(5)} ·{" "}
              {s.session.type.replace("_", " ")}
            </strong>
            <span>
              {s.session.targetMi} mi
              {pace ? ` · ${paceToString(pace.targetSecPerMi)}/mi` : ""}
              {pace?.hrZoneLabel
                ? ` · ${pace.hrZoneLabel}`
                : pace?.hrTarget
                  ? ` · ≤${pace.hrTarget}`
                  : ""}
            </span>
          </div>
          <em>{statusLabel(s.status)}</em>
        </summary>
        <div className="session-guidance">
          {pace ? (
            <p>
              <strong>
                {paceToString(pace.minSecPerMi)}–{paceToString(pace.maxSecPerMi)}/mi
              </strong>
              {pace.hrZoneRange ? (
                <>
                  {" "}
                  · {pace.hrZoneLabel} {pace.hrZoneRange} bpm
                </>
              ) : null}
            </p>
          ) : null}
          {s.session.notes ? <p className="muted">{s.session.notes}</p> : null}
        </div>
      </details>
    </li>
  );
}

function WeekCard({ w, current }: { w: WeekStatus; current?: boolean }) {
  const over = w.overTarget;
  const fill = Math.min(w.progressPct, over ? 100 : 100);
  return (
    <article
      className={`panel week-card ${current ? "week-card-current" : ""} ${over ? "week-over" : ""}`}
    >
      <h3>
        Week {w.week.id}
        {current ? " · this week" : ""}
        {w.targetMi === 0 ? " · rest" : ""}
      </h3>
      <p className="meter-label">
        {w.week.start.slice(5)}–{w.week.end.slice(5)} · {w.loggedMi.toFixed(1)} /{" "}
        {w.targetMi} mi
        {over ? " · over" : ""}
      </p>
      <div className={`meter ${over ? "meter-over" : ""}`}>
        <div className="meter-fill" style={{ width: `${Math.min(fill, 100)}%` }} />
      </div>
      {w.sessions.length === 0 ? (
        <p className="muted week-focus">No runs planned</p>
      ) : (
        <ul className="session-list">
          {w.sessions.map((s) => (
            <SessionRow key={s.session.id} s={s} />
          ))}
        </ul>
      )}
    </article>
  );
}

export function Dashboard() {
  const [data, setData] = useState<CoachPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
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
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const { plan, report } = data;
  const pg = report.paceGuidance;
  const week = report.currentWeek;
  const weeks = report.upcomingWeeks.length
    ? report.upcomingWeeks
    : week
      ? [week]
      : [];
  const zones = plan.paceGuidance.hrZones;

  return (
    <div className="shell">
      <header className="hero hero-compact">
        <div className="hero-copy">
          <p className="eyebrow">Monterey · Nov 8</p>
          <h1 className="brand">SUB-2</h1>
        </div>
        <div className="hero-stats">
          <div>
            <span className="stat-label">Days</span>
            <strong>{report.daysToRace}</strong>
          </div>
          <div>
            <span className="stat-label">Odds</span>
            <strong>{report.sub2OddsBand}</strong>
          </div>
          <div>
            <span className="stat-label">Est</span>
            <strong>
              {pg.estimatedHalfSec ? formatDuration(pg.estimatedHalfSec) : "—"}
            </strong>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["plan", "This week"],
            ["log", "Log"],
            ["recent", "Recent"],
            ["backtest", "Backtest"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? "tab-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "plan" ? (
        <>
          <section className="weeks-scroll-wrap">
            <div className="weeks-scroll">
              {weeks.map((w) => (
                <WeekCard key={w.week.id} w={w} current={w.week.id === week?.week.id} />
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Pace</h2>
            <div className="pace-grid">
              <div>
                <span className="stat-label">Easy</span>
                <strong>
                  {paceToString(pg.easyMinSecPerMi)}–{paceToString(pg.easyMaxSecPerMi)}
                </strong>
              </div>
              <div>
                <span className="stat-label">Goal</span>
                <strong>{paceToString(plan.athlete.goalPaceSecPerMi)}</strong>
              </div>
              <div>
                <span className="stat-label">Conf</span>
                <strong>{pg.confidence}</strong>
              </div>
            </div>
            {zones ? (
              <p className="muted small">
                Z1 ≤{zones.z1.max} · Z2 {zones.z2.min}–{zones.z2.max} · Z3 {zones.z3.min}–
                {zones.z3.max} · Z4 {zones.z4.min}–{zones.z4.max} · Z5 {zones.z5.min}+
              </p>
            ) : null}
            <ul className="progression-list">
              {plan.weeks.map((w) => {
                const long = [...w.sessions]
                  .filter((s) => s.type === "long" || s.type === "race")
                  .sort((a, b) => b.targetMi - a.targetMi)[0];
                return (
                  <li key={w.id}>
                    <span>
                      W{w.id} · {w.phase}
                    </span>
                    <span>
                      {w.targetMi} mi
                      {long ? ` · long ${long.targetMi}` : w.targetMi === 0 ? " · rest" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="panel">
            <h2>Mileage</h2>
            <ul className="mileage-list">
              {report.weeklyMileage.map((w) => {
                const pct =
                  w.targetMi <= 0
                    ? w.loggedMi > 0
                      ? 100
                      : 0
                    : Math.min(140, (w.loggedMi / w.targetMi) * 100);
                const over = w.targetMi > 0 && w.loggedMi > w.targetMi;
                return (
                  <li key={w.weekId}>
                    <div className="mileage-row">
                      <span>
                        W{w.weekId} · {w.start.slice(5)}
                      </span>
                      <span>
                        {w.loggedMi.toFixed(1)} / {w.targetMi}
                        {over ? " · over" : ""}
                      </span>
                    </div>
                    <div className={`meter thin ${over ? "meter-over" : ""}`}>
                      <div
                        className="meter-fill"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : null}

      {tab === "log" ? (
        <section className="panel" id="log-run">
          <h2>Log a run</h2>
          <ol className="howto">
            <li>Finish the run (Watch / Strava / Fitness).</li>
            <li>Add it here via screenshot, Health file, or manual entry.</li>
            <li>Odds, pace, and weekly progress update from what’s logged.</li>
          </ol>

          <h2 className="subhead">Screenshots</h2>
          <ScreenshotRunUpload
            onSaved={() => {
              load();
              setTab("plan");
            }}
          />

          <h2 className="subhead">Health JSON / GPX</h2>
          <HealthUpload onImported={load} />

          <h2 className="subhead">Manual</h2>
          <LogRunForm onLogged={load} />

          <div className="cta-row">
            <a className="btn ghost" href="/api/calendar">
              Calendar .ics
            </a>
          </div>
          <p className="muted">
            {data.runs.length} runs · easy ≤{plan.paceGuidance.hrEasyCap} bpm (Z2)
          </p>
        </section>
      ) : null}

      {tab === "recent" ? (
        <section className="panel">
          <h2>Recent</h2>
          <ul className="run-list">
            {report.recentRuns.map((run) => (
              <li key={run.id}>
                <div>
                  <strong>
                    {weekdayShort(run.startDate)} {run.startDate.slice(0, 10)}
                  </strong>
                  <span>{run.name}</span>
                </div>
                <div className="run-metrics">
                  <span>{run.distanceMi.toFixed(2)} mi</span>
                  <span>{paceToString(run.paceSecPerMi)}/mi</span>
                  <span>{formatDuration(run.movingTimeSec)}</span>
                  <span>
                    {run.averageHeartrate ? `${run.averageHeartrate} bpm` : "— bpm"}
                  </span>
                  <span>{run.elevationFt ? `${run.elevationFt} ft` : "— ft"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "backtest" ? (
        <section className="panel">
          <h2>Backtest</h2>
          <p className="muted">{report.efficacy.verdict}</p>
          <div className="pace-grid">
            <div>
              <span className="stat-label">MAE</span>
              <strong>{Math.round(report.efficacy.maeSec)}s/mi</strong>
            </div>
            <div>
              <span className="stat-label">Skill</span>
              <strong>{(report.efficacy.skillScore * 100).toFixed(0)}%</strong>
            </div>
            <div>
              <span className="stat-label">HR tagged</span>
              <strong>
                {report.efficacy.hrTaggedRuns}/{report.efficacy.usableRuns}
              </strong>
            </div>
          </div>
          <p>{report.efficacy.nextRunHint}</p>
          {report.efficacy.limitations.length ? (
            <ul className="rationale">
              {report.efficacy.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          {report.efficacy.samplePredictions.length ? (
            <ul className="run-list">
              {report.efficacy.samplePredictions.map((p) => (
                <li key={`${p.date}-${p.actualPaceSec}`}>
                  <div>
                    <strong>
                      {weekdayShort(p.date)} {p.date.slice(5)}
                    </strong>
                  </div>
                  <div className="run-metrics">
                    <span>{paceToString(p.actualPaceSec)}</span>
                    <span>pred {paceToString(p.predictedPaceSec)}</span>
                    <span>
                      {p.errorSec >= 0 ? "+" : ""}
                      {p.errorSec}s
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {pending ? <p className="muted">Updating…</p> : null}
    </div>
  );
}
