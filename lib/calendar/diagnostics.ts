import { fetchIcalFeed } from "@/lib/calendar/fetch-ical";
import {
  parseIcalAvailability,
  type ParsedIcalFeed,
} from "@/lib/calendar/ical";

export type IcalFeedDiagnostic = {
  compatible: boolean;
  empty: boolean;
  provider: string;
  finalHost: string | null;
  totalEvents: number;
  importableEvents: number;
  skippedEvents: number;
  unsafeEvents: number;
  recurringRules: number;
  recurrenceInstances: number;
  timedStarts: number;
  timedEnds: number;
  cancelledEvents: number;
  transparentEvents: number;
  message: string;
};

function normalizedLines(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .map((line) => line.trimEnd());
}

function lineValue(line: string) {
  const separator = line.indexOf(":");
  return separator >= 0 ? line.slice(separator + 1).trim() : "";
}

function calendarStats(input: string) {
  const lines = normalizedLines(input);
  let totalEvents = 0;
  let recurringRules = 0;
  let recurrenceInstances = 0;
  let timedStarts = 0;
  let timedEnds = 0;
  let cancelledEvents = 0;
  let transparentEvents = 0;
  let insideEvent = false;

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper === "BEGIN:VEVENT") {
      totalEvents += 1;
      insideEvent = true;
      continue;
    }

    if (upper === "END:VEVENT") {
      insideEvent = false;
      continue;
    }

    if (!insideEvent) continue;

    if (upper.startsWith("RRULE:") || upper.startsWith("RRULE;")) {
      recurringRules += 1;
      continue;
    }

    if (
      upper.startsWith("RECURRENCE-ID:") ||
      upper.startsWith("RECURRENCE-ID;")
    ) {
      recurrenceInstances += 1;
      continue;
    }

    if (upper.startsWith("DTSTART:") || upper.startsWith("DTSTART;")) {
      if (lineValue(line).includes("T")) timedStarts += 1;
      continue;
    }

    if (upper.startsWith("DTEND:") || upper.startsWith("DTEND;")) {
      if (lineValue(line).includes("T")) timedEnds += 1;
      continue;
    }

    if (upper === "STATUS:CANCELLED") {
      cancelledEvents += 1;
      continue;
    }

    if (upper === "TRANSP:TRANSPARENT") {
      transparentEvents += 1;
    }
  }

  return {
    totalEvents,
    recurringRules,
    recurrenceInstances,
    timedStarts,
    timedEnds,
    cancelledEvents,
    transparentEvents,
  };
}

function providerName(provider: string) {
  const labels: Record<string, string> = {
    AIRBNB: "Airbnb",
    VRBO: "Vrbo",
    BOOKING_COM: "Booking.com",
    LODGIFY: "Lodgify",
    OWNEREZ: "OwnerRez",
    RESNEXUS: "ResNexus",
    GOOGLE: "Google Calendar",
    OTHER_ICAL: "iCal",
  };
  return labels[provider] ?? provider.replaceAll("_", " ");
}

function compatibilityMessage(
  provider: string,
  parsed: ParsedIcalFeed,
  stats: ReturnType<typeof calendarStats>,
) {
  const label = providerName(provider);

  if (parsed.unsafeSkipped > 0) {
    const reasons: string[] = [];

    if (parsed.recurringSkipped > 0 || stats.recurringRules > 0) {
      reasons.push(
        `${Math.max(parsed.recurringSkipped, stats.recurringRules)} recurring rule${
          Math.max(parsed.recurringSkipped, stats.recurringRules) === 1 ? "" : "s"
        }`,
      );
    }

    if (stats.timedStarts > 0 || stats.timedEnds > 0) {
      reasons.push(
        `${Math.max(stats.timedStarts, stats.timedEnds)} timed event${
          Math.max(stats.timedStarts, stats.timedEnds) === 1 ? "" : "s"
        }`,
      );
    }

    const reasonText = reasons.length
      ? ` It contains ${reasons.join(" and ")} that cannot be normalized without guessing.`
      : "";

    const providerHint =
      provider === "RESNEXUS"
        ? " The ResNexus feed is reachable, but Find A Place will not guess at recurring or time-based reservation boundaries."
        : "";

    return `${label} feed is reachable, but ${parsed.unsafeSkipped} event${
      parsed.unsafeSkipped === 1 ? "" : "s"
    } cannot be imported safely.${reasonText}${providerHint} No availability was changed.`;
  }

  if (!parsed.events.length) {
    return `${label} feed is reachable and valid. It currently contains no active unavailable date spans. Rates and fees are not read from iCal.`;
  }

  const skipped =
    parsed.skipped > 0
      ? ` ${parsed.skipped} cancelled, transparent, duplicate or non-blocking event${
          parsed.skipped === 1 ? " was" : "s were"
        } ignored.`
      : "";

  return `${label} feed passed the compatibility test. ${parsed.events.length} unavailable date span${
    parsed.events.length === 1 ? "" : "s"
  } can be imported safely.${skipped} Rates and fees are not read from iCal.`;
}

export async function inspectIcalFeed(
  rawUrl: string,
  provider: string,
): Promise<IcalFeedDiagnostic> {
  const fetched = await fetchIcalFeed(rawUrl);
  const parsed = parseIcalAvailability(fetched.body);
  const stats = calendarStats(fetched.body);

  return {
    compatible: parsed.unsafeSkipped === 0,
    empty: parsed.events.length === 0,
    provider,
    finalHost: fetched.url.hostname || null,
    totalEvents: stats.totalEvents,
    importableEvents: parsed.events.length,
    skippedEvents: parsed.skipped,
    unsafeEvents: parsed.unsafeSkipped,
    recurringRules: stats.recurringRules,
    recurrenceInstances: stats.recurrenceInstances,
    timedStarts: stats.timedStarts,
    timedEnds: stats.timedEnds,
    cancelledEvents: stats.cancelledEvents,
    transparentEvents: stats.transparentEvents,
    message: compatibilityMessage(provider, parsed, stats),
  };
}
