import type { SupabaseClient } from "@supabase/supabase-js";

import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

function prettyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export async function sendCheckoutRecoveryEmail(
  admin: SupabaseClient,
  reservationId: string,
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,guest_name,guest_email,unit_id,check_in,check_out,guest_count,status,hold_expires_at",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation?.guest_email) {
    throw new Error(
      `Unable to load abandoned checkout: ${error?.message ?? "Guest email missing"}`,
    );
  }

  const { data: unit } = await admin
    .from("property_units")
    .select("id,name,slug,property_id")
    .eq("id", reservation.unit_id)
    .maybeSingle();

  if (!unit?.slug) {
    throw new Error("Unable to build checkout recovery link.");
  }

  const { data: property } = await admin
    .from("properties")
    .select("name")
    .eq("id", unit.property_id)
    .maybeSingle();

  const propertyName = property?.name || unit.name || "your stay";
  const firstName =
    reservation.guest_name?.trim().split(/\s+/)[0] || "there";
  const token = createGuestCheckoutToken(reservation.id);
  const recoveryUrl = new URL("/checkout/recover", siteUrl());
  recoveryUrl.searchParams.set("reservationId", reservation.id);
  recoveryUrl.searchParams.set("checkoutToken", token);

  const dates = `${prettyDate(reservation.check_in)} – ${prettyDate(
    reservation.check_out,
  )}`;

  const subject = `Finish your Find A Place booking for ${propertyName}`;

  const text = [
    `Hi ${firstName},`,
    "",
    "It looks like you left before completing your checkout.",
    "",
    `${propertyName} · ${dates}`,
    `Reservation reference: ${reservation.confirmation_code}`,
    "",
    "Your stay is not secured until checkout and payment are complete. If your original hold is still active, we'll continue from it. If it expired, we'll try to place the same dates back on a short hold if they are still available.",
    "",
    `Return to Find A Place to finish your booking: ${recoveryUrl.toString()}`,
    "",
    "If the dates were booked by someone else before you return, we'll take you back to the stay so you can choose available dates.",
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>It looks like you left before completing your checkout.</p>
    <p>
      <strong>${escapeHtml(propertyName)}</strong><br />
      ${escapeHtml(dates)}<br />
      Reservation reference: <strong>${escapeHtml(
        reservation.confirmation_code,
      )}</strong>
    </p>
    <p>
      Your stay is not secured until checkout and payment are complete.
      If your original hold is still active, we'll continue from it. If it
      expired, we'll try to place the same dates back on a short hold if they
      are still available.
    </p>
    <p>
      <a href="${escapeHtml(recoveryUrl.toString())}">
        Return to Find A Place and finish your booking
      </a>
    </p>
    <p>
      If the dates were booked by someone else before you return, we'll take
      you back to the stay so you can choose available dates.
    </p>
  `;

  return sendNotificationOnce({
    admin,
    reservationId,
    type: "CHECKOUT_RECOVERY",
    recipient: reservation.guest_email,
    subject,
    html,
    text,
  });
}
