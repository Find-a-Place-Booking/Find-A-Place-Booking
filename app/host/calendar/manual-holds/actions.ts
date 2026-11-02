"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 180) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function navigate(result: "created" | "released" | "error", message?: string): never {
  const query = new URLSearchParams({ result });
  if (message) query.set("message", message.slice(0, 200));
  redirect(`/host/calendar/manual-holds?${query.toString()}`);
}

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date.getTime();
}

function checkId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function calendarRefresh() {
  revalidatePath("/host/calendar/manual-holds");
  revalidatePath("/host/calendar");
  revalidatePath("/host");
  revalidatePath("/admin/calendars");
  revalidatePath("/admin/calendars/attention");
}

export async function createManualHold(formData: FormData) {
  const unitId = field(formData, "unitId", 40);
  const start = field(formData, "start", 10);
  const end = field(formData, "end", 10);
  const label = field(formData, "label", 180) || "Manual booking hold";
  const startMs = parseDay(start);
  const endMs = parseDay(end);

  if (!checkId(unitId) || startMs === null || endMs === null) {
    navigate("error", "Select a property and enter valid check-in and checkout dates.");
  }
  const nights = (endMs - startMs) / 86_400_000;
  if (nights < 1 || nights > 730) {
    navigate("error", "Checkout must be after check-in, and a hold cannot exceed 730 nights.");
  }

  // Reuse the canonical host RPC. It checks organization permissions, locks
  // the unit against simultaneous checkouts, rejects overlaps and writes an audit entry.
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_owner_availability_block", {
    target_unit_id: unitId,
    block_start: start,
    block_end: end,
    block_label: label,
  });
  if (error) {
    const conflict = /already unavailable|overlap|conflict/i.test(error.message);
    navigate("error", conflict
      ? "Those dates are already blocked or booked. Review the unit calendar before trying again."
      : "Couldn't place the hold. Check your calendar access and the selected dates.");
  }

  calendarRefresh();
  navigate("created");
}

export async function releaseManualHold(formData: FormData) {
  const unitId = field(formData, "unitId", 40);
  const blockId = field(formData, "blockId", 40);
  if (!checkId(unitId) || !checkId(blockId)) {
    navigate("error", "Choose a valid manual hold to release.");
  }
  if (formData.get("confirmed") !== "yes") {
    navigate("error", "Confirm the dates can be reopened before releasing this hold.");
  }

  // Only a host's own ACTIVE OWNER_BLOCK can be released. Imported calendar
  // blocks and confirmed guest bookings cannot be removed through this action.
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_owner_availability_block", {
    target_unit_id: unitId,
    target_block_id: blockId,
  });
  if (error) {
    navigate("error", "Couldn't release the hold. Refresh your calendar and try again.");
  }

  calendarRefresh();
  navigate("released");
}
