export type IcsExportEvent = {
  uid: string;
  start_date: string;
  end_date: string;
  summary: string;
  updated_at: string;
};

export type IcsExportPayload = {
  name: string;
  unit_id: string;
  events: IcsExportEvent[];
};

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

function utf8Length(value: string) {
  return new TextEncoder().encode(value).length;
}

export function foldIcsLine(line: string) {
  if (utf8Length(line) <= 75) return [line];

  const output: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  let maxBytes = 75;

  for (const character of line) {
    const bytes = utf8Length(character);
    if (chunk && chunkBytes + bytes > maxBytes) {
      output.push(output.length ? ` ${chunk}` : chunk);
      chunk = character;
      chunkBytes = bytes;
      maxBytes = 74; // continuation-space consumes one octet of the 75-octet line limit
    } else {
      chunk += character;
      chunkBytes += bytes;
    }
  }

  if (chunk) output.push(output.length ? ` ${chunk}` : chunk);
  return output;
}

export function safeIcsFilename(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${normalized || "find-a-place-availability"}.ics`;
}

export function serializeIcsCalendar(payload: IcsExportPayload) {
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

  return lines.flatMap(foldIcsLine).join("\r\n");
}
