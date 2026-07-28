"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CoachReport, SessionStatus, TrainingPlan, WeekStatus } from "@/lib/types";
import { formatDuration, formatHalfShort, formatShortDate, paceToString, weekdayShort } from "@/lib/format";
import { LogRunForm } from "@/components/LogRunForm";
import { HealthUpload } from "@/components/HealthUpload";
import { ScreenshotRunUpload } from "@/components/ScreenshotRunUpload";

type Tab = "plan" | "summary" | "log" | "recent";

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
    case "today":
      return "Today";
    case "upcoming":
      return "Up next";
    case "optional_skipped":
      return "Skip OK";
    default:
      return status;
  }
}

function sessionTypeLabel(type: string) {
  switch (type) {
    case "easy_strides":
      return "strides";
    case "quality":
      return "B-pace";
    case "threshold":
      return "threshold";
    case "strength":
      return "strength";
    default:
      return type.replaceAll("_", " ");
  }
}

function usefulNote(type: string, notes?: string): string | null {
  if (!notes) return null;
  if (type === "quality" || type === "threshold" || type === "race" || type === "easy_strides" || type === "strength") {
    return notes;
  }
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
  const isRace = type === "race";
  const isStrength = type === "strength";
  const showPace =
    !isStrength &&
    (type === "easy" || type === "easy_strides" || type === "long" || type === "quality" || type === "threshold");
  const note = usefulNote(type, s.session.notes);
  const line = [
    `${weekdayShort(s.session.date)} ${formatShortDate(s.session.date)}`,
    typeLabel,
    isStrength ? null : `${s.session.targetMi}mi`,
    showPace && pace && pace.minSecPerMi > 0
      ? `${paceToString(pace.minSecPerMi)}–${paceToString(pace.maxSecPerMi)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let badge: string | null = null;
  if (s.status === "today") badge = "Today";
  else if (s.isNext) badge = "Up next";
  else if (
    s.status === "done" ||
    s.status === "partial" ||
    s.status === "missed" ||
    s.status === "optional_skipped"
  ) {
    badge = statusLabel(s.status);
  }

  return (
    <li className={`session ${s.status} ${isRace ? "session-race" : ""} ${s.isNext ? "session-next" : ""}`}>
      <div className="session-row">
        <div className="session-main">
          <strong>{line}</strong>
          {note ? <span className="session-note">{note}</span> : null}
        </div>
        {badge ? <span className="session-badge">{badge}</span> : null}
      </div>
    </li>
  );
}

function WeekCard({
  w,
  current,
  cardRef,
  z2Label,
}: {
  w: WeekStatus;
  current?: boolean;
  cardRef?: (el: HTMLElement | null) => void;
  z2Label: string | null;
}) {
  const over = w.overTarget;
  const fill = Math.min(w.progressPct, 100);
  const expected = Math.min(w.expectedPct, 100);
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
      {w.week.focus ? <p className="week-focus muted">{w.week.focus}</p> : null}
      <p className="meter-label">
        {formatShortDate(w.week.start)}–{formatShortDate(w.week.end)} · {w.loggedMi.toFixed(1)} /{" "}
        {w.targetMi} mi
        {over ? " · over" : ""}
        {z2Label ? ` · ${z2Label}` : ""}
      </p>
      <div
        className={`meter ${over ? "meter-over" : ""}`}
        role="progressbar"
        aria-valuenow={Math.round(fill)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Week ${w.week.id} mileage ${w.loggedMi.toFixed(1)} of ${w.targetMi}`}
      >
        <div className="meter-fill" style={{ width: `${fill}%` }} />
        {w.targetMi > 0 && expected > 0 && expected < 100 ? (
          <span
            className="meter-expected"
            style={{ left: `${expected}%` }}
            title={`Expected by today · ${expected}%`}
          />
        ) : null}
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

function NextSessionHero({ s }: { s: SessionStatus }) {
  const pace = s.paceRec;
  const type = s.session.type;
  const showPace =
    type !== "strength" &&
    pace &&
    pace.minSecPerMi > 0 &&
    (type === "easy" ||
      type === "easy_strides" ||
      type === "long" ||
      type === "quality" ||
      type === "threshold");
  return (
    <section className="next-hero panel" aria-label="Next session">
      <p className="next-hero-eyebrow">
        {s.status === "today" ? "Today" : "Next"} · {weekdayShort(s.session.date)}{" "}
        {formatShortDate(s.session.date)}
      </p>
      <h2 className="next-hero-title">
        {sessionTypeLabel(type)}
        {type !== "strength" ? ` · ${s.session.targetMi} mi` : ""}
      </h2>
      {showPace ? (
        <p className="next-hero-pace">
          {paceToString(pace!.minSecPerMi)}–{paceToString(pace!.maxSecPerMi)}
          {pace?.hrZoneLabel && pace.hrZoneLabel !== "—"
            ? ` · ${pace.hrZoneLabel} ${pace.hrZoneRange}`
            : ""}
        </p>
      ) : null}
      {s.session.notes ? <p className="next-hero-note muted">{s.session.notes}</p> : null}
    </section>
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
        <button type="button" className="btn" onClick={load}>
          Retry
        </button>
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
  const bGoal = pred.goals.find((g) => g.label === "B");
  const estLabel = pred.estimatedHalfSec ? formatHalfShort(pred.estimatedHalfSec) : "—";
  const showEstDelta =
    pred.deltaMinVsPrevEst != null && pred.deltaMinVsPrevEst !== 0
      ? pred.deltaMinVsPrevEst
      : null;
  const z2 = plan.paceGuidance.hrZones?.z2;
  const z2Label = z2 ? `Z2 ${z2.min}–${z2.max}` : null;

  return (
    <div className="shell">
      <header className="hero hero-compact">
        <div className="hero-copy">
          <h1 className="brand brand-title">Monterey Bay Half 11/8</h1>
          <p className="plan-label">Training plan · Quinn TV</p>
        </div>
        <p className="goals-strip" aria-label="Goal snapshot">
          <span>Est {estLabel}</span>
          {showEstDelta != null ? (
            <span className={showEstDelta < 0 ? "delta-good" : ""}>
              {showEstDelta > 0 ? "+" : ""}
              {showEstDelta} min
            </span>
          ) : null}
          <span>B {bGoal?.pct ?? "—"}%</span>
          <span>{report.daysToRace}d</span>
        </p>
      </header>

      {report.nextSession ? <NextSessionHero s={report.nextSession} /> : null}

      <nav className="tabs-wrap" aria-label="Sections">
        <div className="tabs" role="tablist">
          {(
            [
              ["plan", "This week"],
              ["summary", "Summary"],
              ["log", "Log"],
              ["recent", "Recent"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tab ${tab === id ? "tab-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {tab === "plan" ? (
        <section className="weeks-scroll-wrap">
          <div className="weeks-scroll">
            {weeks.map((w) => {
              const isCurrent = w.week.id === week?.week.id;
              return (
                <WeekCard
                  key={w.week.id}
                  w={w}
                  current={isCurrent}
                  z2Label={z2Label}
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
                  <div
                    className={`meter thin ${over ? "meter-over" : ""}`}
                    role="progressbar"
                    aria-valuenow={Math.round(Math.min(pct, 100))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="meter-fill"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <h2 className="subhead">Backtest</h2>
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
        </section>
      ) : null}

      {tab === "log" ? (
        <section className="panel" id="log-run">
          <h2>Log a run</h2>
          <ol className="howto">
            <li>Finish the run (Watch / Strava / Fitness).</li>
            <li>Add it here via screenshot, Health file, or manual entry.</li>
            <li>Odds and Est update from what’s logged.</li>
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
            {data.runs.length} runs · easy ≤{plan.paceGuidance.hrEasyCap} bpm (Z2) · design B-pace ~
            {paceToString(plan.athlete.designPaceSecPerMi ?? 595)}
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
                `${paceToString(run.paceSecPerMi, 10)}/mi`,
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

      {pending ? <p className="muted">Updating…</p> : null}
    </div>
  );
}
