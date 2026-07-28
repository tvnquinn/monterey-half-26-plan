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
      const title = `${session.type.replace("_", " ")} · ${session.targetMi} mi`;
      const desc = [
        week.focus,
        session.notes || "",
        `Phase: ${week.phase}`,
        `Week target: ${week.targetMi} mi`,
      ]
        .filter(Boolean)
        .join("\\n");

      lines.push(
        "BEGIN:VEVENT",
        `UID:${session.id}@sub2-coach`,
        `DTSTART:${formatIcsDate(session.date, 7, 0)}`,
        `DTEND:${formatIcsDate(session.date, 8, 0)}`,
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
