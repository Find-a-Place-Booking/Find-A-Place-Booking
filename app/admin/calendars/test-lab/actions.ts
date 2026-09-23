"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAdminContext,
  hasAnyAdminRole,
} from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";

const providers = new Set([
  "AIRBNB",
  "VRBO",
  "BOOKING_COM",
  "RESNEXUS",
  "OWNEREZ",
  "LODGIFY",
  "GOOGLE",
  "OTHER_ICAL",
]);

const modes = new Set([
  "NORMAL",
  "EMPTY",
  "INVALID",
  "RECURRING_UNSAFE",
]);

const eventStyles = new Set(["ALL_DAY", "TIMED_LOCAL"]);
const eventStatuses = new Set(["CONFIRMED", "CANCELLED"]);

function field(formData: FormData, key: string, max = 500) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validTimeZone(value: string) {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function requireLabAdmin() {
  const context = await getAdminContext();
  if (
    !hasAnyAdminRole(context, [
      "SUPER_ADMIN",
      "OPERATIONS_ADMIN",
    ])
  ) {
    throw new Error("iCal Test Lab access requires operations admin access.");
  }
  return context;
}

function refresh() {
  revalidatePath("/admin/calendars");
  revalidatePath("/admin/calendars/test-lab");
}

function labRedirect(result: string, detail?: string): never {
  const params = new URLSearchParams({ result });
  if (detail) params.set("detail", detail.slice(0, 300));
  redirect(`/admin/calendars/test-lab?${params.toString()}`);
}

function addUtcDays(value: Date, amount: number) {
  const copy = new Date(value.getTime());
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy.toISOString().slice(0, 10);
}

export async function createTestFeed(formData: FormData) {
  const context = await requireLabAdmin();
  const providerRaw = field(formData, "provider", 40).toUpperCase();
  const provider = providers.has(providerRaw) ? providerRaw : "OTHER_ICAL";
  const label = field(formData, "label", 120) || `${provider} simulator`;
  const timeZoneRaw = field(formData, "timeZone", 100) || "America/Chicago";
  const timeZone = validTimeZone(timeZoneRaw)
    ? timeZoneRaw
    : "America/Chicago";

  const admin = createAdminClient();
  const { data: feed, error } = await admin
    .from("ical_test_feeds")
    .insert({
      provider,
      label,
      mode: "NORMAL",
      time_zone: timeZone,
      is_enabled: true,
      created_by: context.profileId,
    })
    .select("id")
    .single();

  if (error || !feed) {
    labRedirect("error", error?.message || "Unable to create test feed.");
  }

  const today = new Date();
  const start = addUtcDays(today, 30);
  const end = addUtcDays(today, 33);

  const { error: eventError } = await admin
    .from("ical_test_events")
    .insert({
      feed_id: feed.id,
      uid: `sim-${randomUUID()}`,
      summary: "Test reservation",
      start_date: start,
      end_date: end,
      event_style: "ALL_DAY",
      status: "CONFIRMED",
    });

  if (eventError) {
    await admin.from("ical_test_feeds").delete().eq("id", feed.id);
    labRedirect("error", eventError.message);
  }

  refresh();
  labRedirect(
    "feed-created",
    "Simulator created with one test reservation about 30 days out.",
  );
}

export async function updateTestFeed(formData: FormData) {
  await requireLabAdmin();

  const feedId = field(formData, "feedId", 100);
  const providerRaw = field(formData, "provider", 40).toUpperCase();
  const modeRaw = field(formData, "mode", 40).toUpperCase();
  const provider = providers.has(providerRaw) ? providerRaw : "OTHER_ICAL";
  const mode = modes.has(modeRaw) ? modeRaw : "NORMAL";
  const label = field(formData, "label", 120) || `${provider} simulator`;
  const timeZoneRaw = field(formData, "timeZone", 100) || "America/Chicago";

  if (!validTimeZone(timeZoneRaw)) {
    labRedirect("error", "Enter a valid IANA timezone, such as America/Chicago.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ical_test_feeds")
    .update({
      provider,
      label,
      mode,
      time_zone: timeZoneRaw,
      is_enabled: checked(formData, "enabled"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", feedId);

  if (error) labRedirect("error", error.message);

  refresh();
  labRedirect("feed-updated", "Feed behavior updated.");
}

export async function deleteTestFeed(formData: FormData) {
  await requireLabAdmin();
  const feedId = field(formData, "feedId", 100);

  const admin = createAdminClient();
  const { error } = await admin
    .from("ical_test_feeds")
    .delete()
    .eq("id", feedId);

  if (error) labRedirect("error", error.message);

  refresh();
  labRedirect("feed-deleted", "Test feed deleted.");
}

export async function createTestEvent(formData: FormData) {
  await requireLabAdmin();

  const feedId = field(formData, "feedId", 100);
  const start = field(formData, "start", 20);
  const end = field(formData, "end", 20);
  const summary = field(formData, "summary", 180) || "Test reservation";
  const styleRaw = field(formData, "eventStyle", 30).toUpperCase();
  const statusRaw = field(formData, "status", 30).toUpperCase();
  const eventStyle = eventStyles.has(styleRaw) ? styleRaw : "ALL_DAY";
  const status = eventStatuses.has(statusRaw) ? statusRaw : "CONFIRMED";

  if (!validDate(start) || !validDate(end) || end <= start) {
    labRedirect("error", "Event checkout/end date must be after the start date.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ical_test_events")
    .insert({
      feed_id: feedId,
      uid: `sim-${randomUUID()}`,
      summary,
      start_date: start,
      end_date: end,
      event_style: eventStyle,
      status,
    });

  if (error) labRedirect("error", error.message);

  refresh();
  labRedirect("event-created", "Test reservation added to the feed.");
}

export async function updateTestEvent(formData: FormData) {
  await requireLabAdmin();

  const eventId = field(formData, "eventId", 100);
  const start = field(formData, "start", 20);
  const end = field(formData, "end", 20);
  const summary = field(formData, "summary", 180) || "Test reservation";
  const styleRaw = field(formData, "eventStyle", 30).toUpperCase();
  const statusRaw = field(formData, "status", 30).toUpperCase();
  const eventStyle = eventStyles.has(styleRaw) ? styleRaw : "ALL_DAY";
  const status = eventStatuses.has(statusRaw) ? statusRaw : "CONFIRMED";

  if (!validDate(start) || !validDate(end) || end <= start) {
    labRedirect("error", "Event checkout/end date must be after the start date.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ical_test_events")
    .update({
      summary,
      start_date: start,
      end_date: end,
      event_style: eventStyle,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) labRedirect("error", error.message);

  refresh();
  labRedirect(
    "event-updated",
    "Test event changed. Sync the connected calendar to verify the imported block moves.",
  );
}

export async function deleteTestEvent(formData: FormData) {
  await requireLabAdmin();
  const eventId = field(formData, "eventId", 100);

  const admin = createAdminClient();
  const { error } = await admin
    .from("ical_test_events")
    .delete()
    .eq("id", eventId);

  if (error) labRedirect("error", error.message);

  refresh();
  labRedirect(
    "event-deleted",
    "Event removed from the feed. The next successful sync should release its imported block.",
  );
}
