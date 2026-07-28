"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CoachReport, SessionStatus, TrainingPlan, WeekStatus } from "@/lib/types";
import { formatDuration, formatHalfShort, formatShortDate, paceToString, weekdayShort } from "@/lib/format";
import { LogRunForm } from "@/components/LogRunForm";
import { HealthUpload } from "@/components/HealthUpload";
import { ScreenshotRunUpload } from "@/components/ScreenshotRunUpload";

type Tab = "plan" | "summary" | "log" | "recent" | "backtest";

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

function formatDeltaMin(delta: number | null): string {
  if (delta == null) return "—";
  if (delta === 0) return "±0 min";
  return `${delta > 0 ? "+" : ""}${delta} min`;
}

function sessionTypeLabel(type: string) {
  switch (type) {
    case "easy_strides":
      return "strides";
    case "quality":
      return "RP";
    default:
      return type.replaceAll("_", " ");
  }
}

/** Drop note text that only restates type / Z2 / distance already on the row. */
function usefulNote(type: string, notes?: string): string | null {
  if (!notes) return null;
  const t = notes
    .replace(/\b(easy|long|short|Z2|Z3|Z4)\b/gi, " ")
    .replace(/[·•|,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  // Strides / RP / race notes are the prescription — keep original when still useful
  if (type === "quality" || type === "race" || type === "easy_strides") return notes;
  // If stripping left almost nothing meaningful vs original, keep trimmed original without Z2 boilerplate
  const cleaned = notes
    .replace(/\s*[·•]\s*easy\s*Z2\b/gi, "")
    .replace(/\bEasy\s*Z2\s*[·•]?\s*/gi, "")
    .replace(/\bLong\s*[·•]\s*/gi, "")
    .replace(/\bShort\s+easy\s*[·•]?\s*/gi, "")
    .replace(/\s*[·•]\s*Z2\b/gi, "")
    .replace(/\s*Z2\s*$/i, "")
    .replace(/\s*[·•]\s*easy\b/gi, "")
    .replace(/^Race\s*[·•]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function SessionRow({ s }: { s: SessionStatus }) {
  const pace = s.paceRec;
  const type = s.session.type;
  const typeLabel = sessionTypeLabel(type);
  const showPace = type === "easy" || type === "easy_strides" || type === "long";
  const showHr = type === "quality" || type === "race";
  const note = usefulNote(type, s.session.notes);
  const line = [
    `${weekdayShort(s.session.date)} ${formatShortDate(s.session.date)}`,
    typeLabel,
    `${s.session.targetMi}mi`,
    showPace && pace ? `${paceToString(pace.minSecPerMi)}–${paceToString(pace.maxSecPerMi)}` : null,
    showHr && pace?.hrZoneRange ? `${pace.hrZoneLabel} ${pace.hrZoneRange}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const showStatus = s.status !== "upcoming";

  return (
    <li className={`session ${s.status}`}>
      <div className="session-row">
        <div className="session-main">
          <strong>{line}</strong>
          {note ? <span className="session-note">{note}</span> : null}
        </div>
        {showStatus ? <em>{statusLabel(s.status)}</em> : null}
      </div>
    </li>
  );
}

function WeekCard({
  w,
  current,
  cardRef,
}: {
  w: WeekStatus;
  current?: boolean;
  cardRef?: (el: HTMLElement | null) => void;
}) {
  const over = w.overTarget;
  const fill = Math.min(w.progressPct, 100);
  return (
    <article
      ref={cardRef}
      className={`panel week-card ${current ? "week-card-current" : ""} ${over ? "week-over" : ""}`}
    >
      <h3>
        Week {w.week.id}
        {current ? " · this week" : ""}
        {w.targetMi === 0 ? " · rest" : ""}
      </h3>
      <p className="meter-label">
        {formatShortDate(w.week.start)}–{formatShortDate(w.week.end)} · {w.loggedMi.toFixed(1)} /{" "}
        {w.targetMi} mi
        {over ? " · over" : ""}
      </p>
      <div className={`meter ${over ? "meter-over" : ""}`}>
        <div className="meter-fill" style={{ width: `${fill}%` }} />
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
  const currentWeekEl = useRef<HTMLElement | null>(null);
  const didScrollToWeek = useRef(false);

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

  useEffect(() => {
    if (!data || tab !== "plan" || didScrollToWeek.current) return;
    const el = currentWeekEl.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "instant", inline: "start", block: "nearest" });
    didScrollToWeek.current = true;
  }, [data, tab]);

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
  const pred = report.predictions;
  const week = report.currentWeek;
  const weeks = report.upcomingWeeks.length
    ? report.upcomingWeeks
    : week
      ? [week]
      : [];
  const estDelta =
    pred.deltaMinVsPrevEst != null ? pred.deltaMinVsPrevEst : pred.deltaMinVsPrior;

  return (
    <div className="shell">
      <header className="hero hero-compact">
        <div className="hero-copy">
          <h1 className="brand brand-title">Monterey Bay Half 11/8</h1>
          <p className="plan-label">Training plan · Quinn TV</p>
        </div>
        <div className="hero-goals">
          <h2 className="goals-heading">Goals</h2>
          {pred.goals.map((g) => (
            <div key={g.label} className="goal-row">
              <span className="goal-name">
                {g.label} · {g.timeLabel}
              </span>
              <strong>{g.pct}%</strong>
            </div>
          ))}
          <div className="goal-row goal-est">
            <span className="goal-name">
              Est ·{" "}
              {pred.estimatedHalfSec ? formatHalfShort(pred.estimatedHalfSec) : "—"}
            </span>
            <strong className={estDelta != null && estDelta < 0 ? "delta-good" : ""}>
              {formatDeltaMin(estDelta)}
            </strong>
          </div>
          <p className="muted small goal-footnote">
            {report.daysToRace}d · prior {pred.priorHalfLabel}
            {pred.deltaMinVsPrevEst != null
              ? " · Δ vs last log"
              : pred.deltaMinVsPrior != null
                ? " · Δ vs prior half"
                : ""}
          </p>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["plan", "This week"],
            ["summary", "Summary"],
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
              {weeks.map((w) => {
                const isCurrent = w.week.id === week?.week.id;
                return (
                  <WeekCard
                    key={w.week.id}
                    w={w}
                    current={isCurrent}
                    cardRef={
                      isCurrent
                        ? (el) => {
                            currentWeekEl.current = el;
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {tab === "summary" ? (
        <section className="panel">
          <h2>Summary</h2>
          <p className={`narrative narrative-${report.mileageNarrative.status}`}>
            <strong>{report.mileageNarrative.headline}</strong>
            <span className="muted">{report.mileageNarrative.detail}</span>
          </p>
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
                      W{w.weekId} · {formatShortDate(w.start)}
                      {w.longMi > 0 ? ` · long ${w.longMi}` : w.targetMi === 0 ? " · rest" : ""}
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
      ) : null}

      {tab === "log" ? (
        <section className="panel" id="log-run">
          <h2>Log a run</h2>
          <ol className="howto">
            <li>Finish the run (Watch / Strava / Fitness).</li>
            <li>Add it here via screenshot, Health file, or manual entry.</li>
            <li>A/B/C odds and Est update from what’s logged.</li>
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
            {report.recentRuns.map((run) => {
              const bits = [
                `${run.distanceMi.toFixed(2)} mi`,
                `${paceToString(run.paceSecPerMi)}/mi`,
                formatDuration(run.movingTimeSec),
                run.averageHeartrate ? `${run.averageHeartrate} bpm` : null,
                run.elevationFt ? `${run.elevationFt} ft` : null,
              ].filter(Boolean);
              return (
                <li key={run.id}>
                  <div>
                    <strong>
                      {weekdayShort(run.startDate)} {formatShortDate(run.startDate)}
                    </strong>
                    <span>
                      {run.name} · {bits.join(" · ")}
                    </span>
                  </div>
                </li>
              );
            })}
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
                      {weekdayShort(p.date)} {formatShortDate(p.date)}
                    </strong>
                    <span>
                      {[
                        paceToString(p.actualPaceSec),
                        `pred ${paceToString(p.predictedPaceSec)}`,
                        `${p.errorSec >= 0 ? "+" : ""}${p.errorSec}s`,
                      ].join(" · ")}
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
