import assert from "node:assert/strict";
import { parseIcalAvailability } from "../lib/calendar/ical.ts";

function event(start, end, extra = "") {
  return `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:booking-1\nDTSTART${start}\n${end ? `DTEND${end}\n` : ""}${extra}END:VEVENT\nEND:VCALENDAR`;
}

const allDay = parseIcalAvailability(event(";VALUE=DATE:20260922", ";VALUE=DATE:20260925"));
assert.deepEqual(allDay.events.map(({ start, end }) => [start, end]), [["2026-09-22", "2026-09-25"]]);

// 02:00 UTC is the previous evening at the property. UTC string dates
// cannot be used directly as property calendar dates.
const utc = parseIcalAvailability(event(":20260923T020000Z", ":20260925T150000Z"), "America/Chicago");
assert.deepEqual(utc.events.map(({ start, end }) => [start, end]), [["2026-09-22", "2026-09-25"]]);

const sameDay = parseIcalAvailability(event(";TZID=America/Chicago:20260922T140000", ";TZID=America/Chicago:20260922T170000"), "America/Chicago");
assert.deepEqual(sameDay.events.map(({ start, end }) => [start, end]), [["2026-09-22", "2026-09-23"]]);

for (const feed of [
  event(":20260922T140000Z", ":20260923T140000Z"), // no property timezone
  event(";VALUE=DATE:20260922", null), // absent checkout date
  event(";TZID=America/New_York:20260922T140000", ";TZID=America/New_York:20260923T140000"),
  event(";VALUE=DATE:20260922", ";VALUE=DATE:20260925", "RRULE:FREQ=WEEKLY\n"),
]) {
  const parsed = parseIcalAvailability(feed, feed.includes("America/New_York") ? "America/Chicago" : undefined);
  assert.equal(parsed.unsafeSkipped, 1);
  assert.equal(parsed.events.length, 0);
}
console.log("iCal date and failure cases passed");
