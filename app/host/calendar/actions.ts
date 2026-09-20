"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertSafeCalendarUrl, normalizeIcalUrl } from "@/lib/calendar/fetch-ical";
import {
  syncIcalConnection,
  type IcalConnection,
} from "@/lib/calendar/sync-ical";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function calendarRedirect(
  unitId: string,
  month: string,
  result: string,
  detail?: string,
): never {
  const params = new URLSearchParams();
  if (unitId) params.set("unit", unitId);
  if (month) params.set("month", month);
  params.set("result", result);
  if (detail) params.set("detail", detail.slice(0, 260));
  redirect(`/host/calendar?${params.toString()}`);
}

function refreshCalendar() {
  revalidatePath("/host/calendar");
  revalidatePath("/host");
  revalidatePath("/admin");
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Calendar synchronization failed.";
}

async function syncConnectedCalendar(connectionId: string, unitId: string) {
  const supabase = await createClient();
  const { data: connection, error: connectionError } = await supabase
    .from("calendar_connections")
    .select(
      "id,unit_id,provider,feed_url,connection_kind,is_active,last_sync_attempt_at,last_success_at",
    )
    .eq("id", connectionId)
    .eq("unit_id", unitId)
    .maybeSingle();

  if (
    connectionError ||
    !connection ||
    !connection.is_active ||
    connection.connection_kind !== "ICAL" ||
    !connection.feed_url
  ) {
    return {
      ok: false as const,
      message: "That iCal connection is not available to sync.",
    };
  }

  // Authorization is proven by the RLS-protected lookup above. From here use
  // the same canonical server sync path as the background cron so manual Sync
  // now gets the same empty-feed confirmation, size limits, recurrence safety,
  // and source-scoped writes as automatic synchronization.
  const result = await syncIcalConnection(connection as IcalConnection);

  if (!result.ok) {
    return { ok: false as const, message: result.error };
  }

  const notes = [
    `${result.imported} current event${result.imported === 1 ? "" : "s"} synchronized`,
  ];
  if (result.deactivated) {
    notes.push(
      `${result.deactivated} old event${result.deactivated === 1 ? "" : "s"} cleared`,
    );
  }

  return { ok: true as const, message: notes.join(" · ") };
}

export async function createOwnerBlock(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const start = field(formData, "start", 20);
  const end = field(formData, "end", 20);
  const label = field(formData, "label", 180);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_owner_availability_block", {
    target_unit_id: unitId,
    block_start: start,
    block_end: end,
    block_label: label || null,
  });
  if (error) calendarRedirect(unitId, month, "error", error.message);
  refreshCalendar();
  calendarRedirect(
    unitId,
    month,
    "owner-block-created",
    "Dates blocked on the canonical calendar.",
  );
}

export async function cancelOwnerBlock(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const blockId = field(formData, "blockId", 100);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_owner_availability_block", {
    target_unit_id: unitId,
    target_block_id: blockId,
  });
  if (error) calendarRedirect(unitId, month, "error", error.message);
  refreshCalendar();
  calendarRedirect(
    unitId,
    month,
    "owner-block-removed",
    "Owner block removed.",
  );
}

export async function connectIcalCalendar(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const provider = field(formData, "provider", 40) || "OTHER_ICAL";
  const label = field(formData, "label", 120);
  const normalizedUrl = normalizeIcalUrl(field(formData, "feedUrl", 2000));

  try {
    await assertSafeCalendarUrl(normalizedUrl);
  } catch (error) {
    calendarRedirect(unitId, month, "error", errorMessage(error));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_ical_connection", {
    target_unit_id: unitId,
    provider_name: provider,
    connection_label: label,
    source_url: normalizedUrl,
  });
  if (error) calendarRedirect(unitId, month, "error", error.message);

  const connectionId = String(data ?? "");
  if (!connectionId) {
    calendarRedirect(
      unitId,
      month,
      "error",
      "The calendar connection was created without an ID.",
    );
  }

  const sync = await syncConnectedCalendar(connectionId, unitId);
  refreshCalendar();
  if (!sync.ok) {
    calendarRedirect(
      unitId,
      month,
      "connected-sync-error",
      `Calendar connected, but the first sync failed: ${sync.message}`,
    );
  }
  calendarRedirect(unitId, month, "calendar-connected", sync.message);
}

export async function syncIcalCalendar(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const connectionId = field(formData, "connectionId", 100);
  const sync = await syncConnectedCalendar(connectionId, unitId);
  refreshCalendar();
  if (!sync.ok) calendarRedirect(unitId, month, "error", sync.message);
  calendarRedirect(unitId, month, "calendar-synced", sync.message);
}

export async function disconnectCalendar(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const connectionId = field(formData, "connectionId", 100);
  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_calendar_connection", {
    target_unit_id: unitId,
    target_connection_id: connectionId,
  });
  if (error) calendarRedirect(unitId, month, "error", error.message);
  refreshCalendar();
  calendarRedirect(
    unitId,
    month,
    "calendar-disconnected",
    "Calendar disconnected and its imported blocks removed from active availability.",
  );
}

export async function ensureGeneralExport(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_calendar_export_token", {
    target_unit_id: unitId,
    target_exclude_connection_id: null,
  });
  if (error) calendarRedirect(unitId, month, "error", error.message);
  refreshCalendar();
  calendarRedirect(
    unitId,
    month,
    "export-created",
    "General Find A Place iCal export created.",
  );
}

export async function rotateExportToken(formData: FormData) {
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const exportTokenId = field(formData, "exportTokenId", 100);
  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_calendar_export_token", {
    target_unit_id: unitId,
    target_export_token_id: exportTokenId,
  });
  if (error) calendarRedirect(unitId, month, "error", error.message);
  refreshCalendar();
  calendarRedirect(
    unitId,
    month,
    "export-rotated",
    "Calendar export URL rotated. Update any external channel still using the old URL.",
  );
}
