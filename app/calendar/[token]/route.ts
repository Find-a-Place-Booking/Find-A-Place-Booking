import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function icsDate(value: string) {
  return value.replaceAll("-", "");
}

function icsTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function safeFilename(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${normalized || "find-a-place-availability"}.ics`;
}

type ExportEvent = {
  uid: string;
  start_date: string;
  end_date: string;
  summary: string;
  updated_at: string;
};

type ExportPayload = {
  name: string;
  unit_id: string;
  events: ExportEvent[];
};

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.toLowerCase().endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return new Response("Calendar not found.", { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_export_payload", { requested_token: token });
  if (error || !data) return new Response("Calendar not found.", { status: 404 });

  const payload = data as ExportPayload;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Find A Place//Availability Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(payload.name)} - Find A Place`,
  ];

  for (const event of payload.events ?? []) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${icsTimestamp(event.updated_at)}`,
      `DTSTART;VALUE=DATE:${icsDate(event.start_date)}`,
      `DTEND;VALUE=DATE:${icsDate(event.end_date)}`,
      `SUMMARY:${escapeText(event.summary || "Unavailable")}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR", "");

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeFilename(payload.name)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
