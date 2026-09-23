import { foldIcsLine } from "@/lib/calendar/ics-export";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestFeed = {
  id: string;
  provider: string;
  label: string;
  mode: "NORMAL" | "EMPTY" | "INVALID" | "RECURRING_UNSAFE";
  time_zone: string;
  is_enabled: boolean;
};

type TestEvent = {
  id: string;
  uid: string;
  summary: string;
  start_date: string;
  end_date: string;
  event_style: "ALL_DAY" | "TIMED_LOCAL";
  status: "CONFIRMED" | "CANCELLED";
  updated_at: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const providerInfo: Record<
  string,
  { prodId: string; uidDomain: string; defaultSummary: string }
> = {
  AIRBNB: {
    prodId: "-//Airbnb//Calendar Simulator//EN",
    uidDomain: "calendar.airbnb.test",
    defaultSummary: "Airbnb (Not available)",
  },
  VRBO: {
    prodId: "-//Vrbo//Calendar Simulator//EN",
    uidDomain: "calendar.vrbo.test",
    defaultSummary: "Reserved",
  },
  BOOKING_COM: {
    prodId: "-//Booking.com//Calendar Simulator//EN",
    uidDomain: "calendar.booking.test",
    defaultSummary: "CLOSED - Booking.com",
  },
  RESNEXUS: {
    prodId: "-//ResNexus//Calendar Simulator//EN",
    uidDomain: "calendar.resnexus.test",
    defaultSummary: "ResNexus Reservation",
  },
  OWNEREZ: {
    prodId: "-//OwnerRez//Calendar Simulator//EN",
    uidDomain: "calendar.ownerrez.test",
    defaultSummary: "OwnerRez Reservation",
  },
  LODGIFY: {
    prodId: "-//Lodgify//Calendar Simulator//EN",
    uidDomain: "calendar.lodgify.test",
    defaultSummary: "Lodgify Reservation",
  },
  GOOGLE: {
    prodId: "-//Google Calendar//Calendar Simulator//EN",
    uidDomain: "calendar.google.test",
    defaultSummary: "Busy",
  },
  OTHER_ICAL: {
    prodId: "-//Find A Place//Generic iCal Simulator//EN",
    uidDomain: "calendar.findaplacebooking.test",
    defaultSummary: "Unavailable",
  },
};

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

function stamp(value: string) {
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

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function serialize(feed: TestFeed, events: TestEvent[]) {
  const info = providerInfo[feed.provider] ?? providerInfo.OTHER_ICAL;

  if (feed.mode === "INVALID") {
    return "THIS IS AN INTENTIONALLY INVALID ICALENDAR TEST FEED\r\n";
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${info.prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(feed.label)}`,
  ];

  if (feed.mode === "RECURRING_UNSAFE") {
    lines.push(
      "BEGIN:VEVENT",
      `UID:unsafe-recurring@${info.uidDomain}`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      "DTSTART;VALUE=DATE:20261001",
      "DTEND;VALUE=DATE:20261002",
      "RRULE:FREQ=DAILY;COUNT=3",
      "SUMMARY:Recurring simulator event",
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  } else if (feed.mode === "NORMAL") {
    for (const event of events) {
      const summary = event.summary.trim() || info.defaultSummary;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeText(event.uid)}@${info.uidDomain}`,
        `DTSTAMP:${stamp(event.updated_at)}`,
      );

      if (event.event_style === "TIMED_LOCAL") {
        lines.push(
          `DTSTART;TZID=${feed.time_zone}:${compactDate(event.start_date)}T150000`,
          `DTEND;TZID=${feed.time_zone}:${compactDate(event.end_date)}T110000`,
        );
      } else {
        lines.push(
          `DTSTART;VALUE=DATE:${compactDate(event.start_date)}`,
          `DTEND;VALUE=DATE:${compactDate(event.end_date)}`,
        );
      }

      lines.push(
        `SUMMARY:${escapeText(summary)}`,
        `STATUS:${event.status}`,
        "TRANSP:OPAQUE",
        "END:VEVENT",
      );
    }
  }

  lines.push("END:VCALENDAR", "");
  return lines.flatMap(foldIcsLine).join("\r\n");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = rawToken.toLowerCase().endsWith(".ics")
    ? rawToken.slice(0, -4)
    : rawToken;

  if (!UUID_RE.test(token)) {
    return new Response("Test calendar not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: feedData, error: feedError } = await admin
    .from("ical_test_feeds")
    .select("id,provider,label,mode,time_zone,is_enabled")
    .eq("token", token)
    .eq("is_enabled", true)
    .maybeSingle();

  if (feedError || !feedData) {
    return new Response("Test calendar not found.", { status: 404 });
  }

  const feed = feedData as TestFeed;
  const { data: eventData, error: eventError } = await admin
    .from("ical_test_events")
    .select(
      "id,uid,summary,start_date,end_date,event_style,status,updated_at",
    )
    .eq("feed_id", feed.id)
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (eventError) {
    return new Response("Unable to render test calendar.", { status: 500 });
  }

  return new Response(serialize(feed, (eventData ?? []) as TestEvent[]), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${feed.provider.toLowerCase()}-simulator.ics"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Find-A-Place-Test-Feed": feed.provider,
    },
  });
}
