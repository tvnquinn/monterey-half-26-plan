"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CoachReport, SessionStatus, TrainingPlan, WeekStatus } from "@/lib/types";
import { formatDuration, formatHalfShort, formatShortDate, paceToString, weekdayShort } from "@/lib/format";
import {
  SESSION_DEFINITIONS,
  isNonRunSession,
  sessionShortLabel,
} from "@/lib/session-glossary";
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

const sessionTypeLabel = sessionShortLabel;

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
  const nonRun = isNonRunSession(type);
  // One estimated pace, not a band — the glossary explains what the effort means.
  const showPace = !nonRun && Boolean(pace && pace.targetSecPerMi > 0);
  const note = usefulNote(type, s.session.notes);
  const line = [
    `${weekdayShort(s.session.date)} ${formatShortDate(s.session.date)}`,
    typeLabel,
    nonRun ? null : `${s.session.targetMi}mi`,
    showPace ? `${paceToString(pace!.targetSecPerMi)}/mi` : null,
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
    <li
      className={`session ${s.status} ${isRace ? "session-race" : ""} ${
        nonRun ? "session-nonrun" : ""
      } ${s.isNext ? "session-next" : ""}`}
    >
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
  const nonRun = isNonRunSession(type);
  const showPace = !nonRun && Boolean(pace && pace.targetSecPerMi > 0);
  return (
    <section
      className={`next-hero panel ${nonRun ? "next-hero-nonrun" : ""}`}
      aria-label="Next session"
    >
      <p className="next-hero-eyebrow">
        {s.status === "today" ? "Today" : "Next"} · {weekdayShort(s.session.date)}{" "}
        {formatShortDate(s.session.date)}
      </p>
      <h2 className="next-hero-title">
        {sessionTypeLabel(type)}
        {nonRun ? "" : ` · ${s.session.targetMi} mi`}
      </h2>
      {showPace ? (
        <p className="next-hero-pace">
          {paceToString(pace!.targetSecPerMi)}/mi
          {pace?.hrZoneLabel && pace.hrZoneLabel !== "—"
            ? ` · ${pace.hrZoneLabel} ${pace.hrZoneRange}`
            : ""}
        </p>
      ) : null}
      {s.session.notes ? <p className="next-hero-note muted">{s.session.notes}</p> : null}
    </section>
  );
}

/** Fixed definitions so session rows can stay terse. */
function SessionGuide() {
  return (
    <details className="panel guide">
      <summary>What the session types mean</summary>
      <dl className="guide-list">
        {SESSION_DEFINITIONS.map((d) => (
          <div key={d.type} className={d.nonRun ? "guide-item guide-nonrun" : "guide-item"}>
            <dt>{d.short}</dt>
            <dd>
              <span className="guide-what">{d.what}</span>
              <span className="muted">{d.feel}</span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function GoalsCard({
  goals,
  estLabel,
  projLabel,
  trendMin,
  daysToRace,
  sigmaMin,
  confidence,
}: {
  goals: CoachReport["predictions"]["goals"];
  estLabel: string;
  projLabel: string;
  trendMin: number | null;
  daysToRace: number;
  sigmaMin: number;
  confidence: string;
}) {
  return (
    <section className="panel goals-card" aria-label="Goal odds">
      <div className="goals-head">
        <h2 className="goals-heading">Goals</h2>
        <span className="muted small">
          {trendMin != null && trendMin !== 0 ? (
            <span className={trendMin < 0 ? "delta-good" : "delta-bad"}>
              {trendMin > 0 ? "+" : ""}
              {trendMin} min / 4wk
            </span>
          ) : null}
        </span>
      </div>
      {/* The odds below are race-day, so show the number they come from. */}
      <p className="proj-line">
        <span>
          <span className="proj-label">if you raced today</span>
          <strong>{estLabel}</strong>
        </span>
        <span aria-hidden="true" className="proj-arrow">
          →
        </span>
        <span>
          <span className="proj-label">race day, on plan</span>
          <strong className="proj-race">{projLabel}</strong>
        </span>
      </p>
      <ul className="goal-rows">
        {goals.map((g) => (
          <li key={g.label} className="goal-row">
            <span className="goal-name">
              {g.label} · {g.timeLabel}
            </span>
            <span className="goal-bar" aria-hidden="true">
              <span className="goal-bar-fill" style={{ width: `${g.pct}%` }} />
            </span>
            <strong className="goal-pct">{g.pct}%</strong>
          </li>
        ))}
      </ul>
      <p className="muted small goal-footnote">
        {daysToRace}d out · odds are race-day · ±{sigmaMin} min · {confidence} confidence
      </p>
    </section>
  );
}

export function Dashboard() {
  const [data, setData] = useState<CoachPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [pending, startTransition] = useTransition();
  const currentWeekEl = useRef<HTMLElement | null>(null);

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

  // Re-centre the current week every time the plan tab is shown, not just once.
  useEffect(() => {
    if (!data || tab !== "plan") return;
    const el = currentWeekEl.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "instant", inline: "start", block: "nearest" });
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
      <div className="shell" aria-busy="true" aria-label="Loading training plan">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
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
  const estLabel = pred.estimatedHalfSec ? formatHalfShort(pred.estimatedHalfSec) : "—";
  const z2 = plan.paceGuidance.hrZones?.z2;
  const z2Label = z2 ? `Z2 ${z2.min}–${z2.max}` : null;

  return (
    <div className="shell">
      <header className="hero hero-compact">
        <div className="hero-copy">
          <h1 className="brand brand-title">Monterey Bay Half 11/8</h1>
          <p className="plan-label">Training plan · Quinn TV</p>
        </div>
      </header>

      {report.nextSession ? <NextSessionHero s={report.nextSession} /> : null}

      <GoalsCard
        goals={pred.goals}
        estLabel={estLabel}
        projLabel={formatHalfShort(pred.projectedSec)}
        trendMin={pred.trendMin}
        daysToRace={report.daysToRace}
        sigmaMin={pred.sigmaMin}
        confidence={pred.confidence}
      />

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

      {tab === "plan" ? <SessionGuide /> : null}

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
