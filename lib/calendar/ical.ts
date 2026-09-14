export type CanonicalIcalEvent = {
  key: string;
  uid: string;
  start: string;
  end: string;
};

export type ParsedIcalFeed = {
  events: CanonicalIcalEvent[];
  skipped: number;
  recurringSkipped: number;
  unsafeSkipped: number;
};

type RawEvent = Record<string, string>;

function validDateParts(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

function canonicalDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const dashed = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const compact = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  const match = dashed ?? compact;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validDateParts(year, month, day)) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unfoldIcal(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .map((line) => line.trimEnd());
}

function propertyFromLine(line: string) {
  const separator = line.indexOf(":");
  if (separator < 1) return null;
  const descriptor = line.slice(0, separator);
  const name = descriptor.split(";", 1)[0]?.toUpperCase();
  if (!name) return null;
  return { name, value: line.slice(separator + 1) };
}

function toRawEvents(lines: string[]) {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const property = propertyFromLine(line);
    if (!property) continue;
    if (!(property.name in current)) current[property.name] = property.value;
  }

  return events;
}

export function parseIcalAvailability(input: string): ParsedIcalFeed {
  if (!input.includes("BEGIN:VCALENDAR") || !input.includes("END:VCALENDAR")) {
    throw new Error("The URL did not return a complete iCalendar feed.");
  }
  const rawEvents = toRawEvents(unfoldIcal(input));
  if (rawEvents.length > 10000) throw new Error("The calendar feed contains too many events to import safely.");

  const events: CanonicalIcalEvent[] = [];
  const seenKeys = new Set<string>();
  let skipped = 0;
  let recurringSkipped = 0;
  let unsafeSkipped = 0;

  for (const raw of rawEvents) {
    if ((raw.STATUS ?? "").toUpperCase() === "CANCELLED") {
      skipped += 1;
      continue;
    }
    if ((raw.TRANSP ?? "").toUpperCase() === "TRANSPARENT") {
      skipped += 1;
      continue;
    }
    if (raw.RRULE && !raw["RECURRENCE-ID"]) {
      // OTA reservation feeds are normally discrete VEVENTs. Recurring calendar
      // rules need expansion with an explicit property timezone, which belongs
      // in a later richer calendar adapter rather than being guessed here.
      recurringSkipped += 1;
      unsafeSkipped += 1;
      skipped += 1;
      continue;
    }

    const uid = raw.UID?.trim();
    const start = canonicalDate(raw.DTSTART);
    if (!uid || !start) {
      unsafeSkipped += 1;
      skipped += 1;
      continue;
    }

    const parsedEnd = canonicalDate(raw.DTEND);
    const end = parsedEnd ?? addDays(start, 1);
    if (end <= start) {
      unsafeSkipped += 1;
      skipped += 1;
      continue;
    }

    const recurrenceId = canonicalDate(raw["RECURRENCE-ID"]);
    const key = (recurrenceId ? `${uid}::${recurrenceId}` : uid).slice(0, 500);
    if (seenKeys.has(key)) {
      skipped += 1;
      continue;
    }
    seenKeys.add(key);
    events.push({ key, uid: uid.slice(0, 500), start, end });
  }

  return { events, skipped, recurringSkipped, unsafeSkipped };
}
