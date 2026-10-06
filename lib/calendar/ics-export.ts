export type IcsExportEvent = {
  uid: string;
  start_date: string;
  end_date: string;
  summary: string;
  description?: string | null;
  event_type?: string | null;
  created_at?: string | null;
  updated_at: string;
  sequence?: number | null;
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
  if (Number.isNaN(date.getTime())) {
    return new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  }

  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function icsSequence(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;

  return Math.min(
    2_147_483_647,
    Math.max(0, Math.trunc(Number(value))),
  );
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
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
      maxBytes = 74;
    } else {
      chunk += character;
      chunkBytes += bytes;
    }
  }

  if (chunk) output.push(output.length ? ` ${chunk}` : chunk);
  return output;
}

export function safeIcsFilename(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "find-a-place-availability"}.ics`;
}

export function serializeIcsCalendar(payload: IcsExportPayload) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Find A Place//Booking Availability Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(payload.name)} - Find A Place`,
  ];

  for (const event of payload.events ?? []) {
    const modified = icsTimestamp(event.updated_at);
    const created = event.created_at
      ? icsTimestamp(event.created_at)
      : modified;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${modified}`,
      `CREATED:${created}`,
      `LAST-MODIFIED:${modified}`,
      `SEQUENCE:${icsSequence(event.sequence)}`,
      `DTSTART;VALUE=DATE:${icsDate(event.start_date)}`,
      `DTEND;VALUE=DATE:${icsDate(event.end_date)}`,
      `SUMMARY:${escapeText(
        event.summary || "Find A Place Reservation Block",
      )}`,
    );

    if (event.description) {
      lines.push(
        `DESCRIPTION:${escapeText(event.description)}`,
      );
    }

    if (event.event_type) {
      lines.push(
        `X-FAP-EVENT-TYPE:${escapeText(event.event_type)}`,
      );
    }

    lines.push(
      "CLASS:PRIVATE",
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR", "");

  return lines.flatMap(foldIcsLine).join("\r\n");
}
