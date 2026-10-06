import assert from "node:assert/strict";

import {
  serializeIcsCalendar,
} from "../lib/calendar/ics-export.ts";
import { parseIcalAvailability } from "../lib/calendar/ical.ts";

function event(start, end, extra = "") {
  return `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:booking-1\nDTSTART${start}\n${end ? `DTEND${end}\n` : ""}${extra}END:VEVENT\nEND:VCALENDAR`;
}

const allDay = parseIcalAvailability(
  event(";VALUE=DATE:20260922", ";VALUE=DATE:20260925"),
);
assert.deepEqual(
  allDay.events.map(({ start, end }) => [start, end]),
  [["2026-09-22", "2026-09-25"]],
);

// 02:00 UTC is the previous evening at the property. UTC string dates
// cannot be used directly as property calendar dates.
const utc = parseIcalAvailability(
  event(":20260923T020000Z", ":20260925T150000Z"),
  "America/Chicago",
);
assert.deepEqual(
  utc.events.map(({ start, end }) => [start, end]),
  [["2026-09-22", "2026-09-25"]],
);

const sameDay = parseIcalAvailability(
  event(
    ";TZID=America/Chicago:20260922T140000",
    ";TZID=America/Chicago:20260922T170000",
  ),
  "America/Chicago",
);
assert.deepEqual(
  sameDay.events.map(({ start, end }) => [start, end]),
  [["2026-09-22", "2026-09-23"]],
);

for (const feed of [
  event(":20260922T140000Z", ":20260923T140000Z"),
  event(";VALUE=DATE:20260922", null),
  event(
    ";TZID=America/New_York:20260922T140000",
    ";TZID=America/New_York:20260923T140000",
  ),
  event(
    ";VALUE=DATE:20260922",
    ";VALUE=DATE:20260925",
    "RRULE:FREQ=WEEKLY\n",
  ),
]) {
  const parsed = parseIcalAvailability(
    feed,
    feed.includes("America/New_York")
      ? "America/Chicago"
      : undefined,
  );

  assert.equal(parsed.unsafeSkipped, 1);
  assert.equal(parsed.events.length, 0);
}

const outbound = serializeIcsCalendar({
  name: "Compatibility Test",
  unit_id: "test-unit",
  events: [
    {
      uid: "fap-owner-block@test",
      start_date: "2026-10-27",
      end_date: "2026-10-28",
      event_type: "OWNER_BLOCK",
      summary: "Find A Place Owner Stay",
      description:
        "Dates blocked through Find A Place Booking.",
      created_at: "2026-10-06T20:00:00Z",
      updated_at: "2026-10-06T20:15:00Z",
      sequence: 1791317700,
    },
  ],
});

assert.match(outbound, /SUMMARY:Find A Place Owner Stay/);
assert.match(
  outbound,
  /DESCRIPTION:Dates blocked through Find A Place Booking\./,
);
assert.match(outbound, /STATUS:CONFIRMED/);
assert.match(outbound, /TRANSP:OPAQUE/);
assert.match(outbound, /CLASS:PRIVATE/);
assert.match(outbound, /LAST-MODIFIED:20261006T201500Z/);
assert.match(outbound, /SEQUENCE:1791317700/);
assert.match(outbound, /X-FAP-EVENT-TYPE:OWNER_BLOCK/);

const roundTrip = parseIcalAvailability(outbound);
assert.deepEqual(
  roundTrip.events.map(({ start, end }) => [start, end]),
  [["2026-10-27", "2026-10-28"]],
);

console.log("iCal import and outbound compatibility cases passed");
