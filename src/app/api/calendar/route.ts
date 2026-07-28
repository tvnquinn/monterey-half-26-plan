import { NextResponse } from "next/server";
import { loadPlan } from "@/lib/storage";

function formatIcsDate(date: string, hour = 7, minute = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
}

export async function GET() {
  const plan = await loadPlan();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sub2 Coach//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Half Marathon Plan",
  ];

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const typeLabel = session.type.replaceAll("_", " ");
      const title =
        session.type === "strength"
          ? `${typeLabel} · 15 min`
          : session.type === "race"
            ? `Race · ${session.targetMi} mi`
            : `${typeLabel} · ${session.targetMi} mi`;
      const desc = [
        week.focus,
        session.notes || "",
        `Phase: ${week.phase}`,
        session.type !== "race"
          ? `Week training target: ${week.targetMi} mi`
          : "Race day — not counted in weekly training bar",
      ]
        .filter(Boolean)
        .join("\\n");

      const startHour = session.type === "strength" ? 18 : 7;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${session.id}@sub2-coach`,
        `DTSTART:${formatIcsDate(session.date, startHour, 0)}`,
        `DTEND:${formatIcsDate(session.date, startHour + 1, 0)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${desc}`,
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="half-marathon-plan.ics"',
    },
  });
}
