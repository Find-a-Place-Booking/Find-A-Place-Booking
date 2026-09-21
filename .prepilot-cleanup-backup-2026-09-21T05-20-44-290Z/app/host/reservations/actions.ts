"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 500) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function toInteger(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function go(result: string, detail?: string): never {
  const params = new URLSearchParams({ result });
  if (detail) params.set("detail", detail.slice(0, 260));
  redirect(`/host/reservations?${params.toString()}`);
}

function requireLocalDevelopmentTool() {
  if (process.env.NODE_ENV === "production") {
    go("error", "Local reservation test tools are disabled in production.");
  }
}

export async function createTestHold(formData: FormData) {
  requireLocalDevelopmentTool();

  const unitId = field(formData, "unitId", 100);
  const checkIn = field(formData, "checkIn", 20);
  const checkOut = field(formData, "checkOut", 20);
  const guestCount = toInteger(field(formData, "guestCount", 4), 1);
  const petCount = toInteger(field(formData, "petCount", 4), 0);
  const promotionCode = field(formData, "promotionCode", 40);
  const guestName = field(formData, "guestName", 180) || "Local test guest";
  const guestEmail = field(formData, "guestEmail", 320);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_test_reservation_hold", {
    target_unit_id: unitId,
    requested_check_in: checkIn,
    requested_check_out: checkOut,
    requested_guest_count: guestCount,
    requested_pet_count: petCount,
    requested_add_on_ids: [],
    requested_promotion_code: promotionCode || null,
    requested_guest_name: guestName,
    requested_guest_email: guestEmail || null,
  });

  if (error) go("error", error.message);
  const result = (data ?? {}) as { confirmation_code?: string; hold_expires_at?: string; payment_ready?: boolean };
  revalidatePath("/host/reservations");
  revalidatePath("/host/calendar");
  go(
    "hold-created",
    `${result.confirmation_code ?? "Test hold"} created for 10 minutes. Payment routing ready: ${result.payment_ready ? "yes" : "no"}.`,
  );
}

export async function cancelTestHold(formData: FormData) {
  requireLocalDevelopmentTool();

  const reservationId = field(formData, "reservationId", 100);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_test_reservation_hold", { target_reservation_id: reservationId });
  if (error) go("error", error.message);
  revalidatePath("/host/reservations");
  revalidatePath("/host/calendar");
  go("hold-cancelled", "Test hold released and its canonical availability block was cancelled.");
}
