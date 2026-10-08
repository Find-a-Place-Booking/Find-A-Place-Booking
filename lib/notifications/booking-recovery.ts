import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ensureRecoverySuppression,
  prettyRecoveryDate,
} from "@/lib/bookings/recovery";
import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  formatMoney,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

function suppressionUrl(token: string) {
  const url = new URL("/booking/recovery-unsubscribe", siteUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendDayOneRecoveryEmail(
  admin: SupabaseClient,
  reservationId: string,
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,guest_name,guest_email,unit_id,check_in,check_out",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation?.guest_email) {
    throw new Error(
      `Unable to load day-one recovery reservation: ${error?.message ?? "Guest email missing"}`,
    );
  }

  const { data: unit } = await admin
    .from("property_units")
    .select("name,property_id")
    .eq("id", reservation.unit_id)
    .maybeSingle();

  const { data: property } = unit?.property_id
    ? await admin
        .from("properties")
        .select("name")
        .eq("id", unit.property_id)
        .maybeSingle()
    : { data: null };

  const preference = await ensureRecoverySuppression(
    admin,
    reservation.guest_email,
  );
  if (!preference || preference.opted_out_at) {
    return { sent: false, skipped: true, suppressed: true } as const;
  }

  const firstName =
    reservation.guest_name?.trim().split(/\s+/)[0] || "there";
  const propertyName = property?.name || unit?.name || "your stay";
  const dates = `${prettyRecoveryDate(reservation.check_in)} – ${prettyRecoveryDate(
    reservation.check_out,
  )}`;

  const recovery = new URL("/checkout/recover", siteUrl());
  recovery.searchParams.set("reservationId", reservation.id);
  recovery.searchParams.set(
    "checkoutToken",
    createGuestCheckoutToken(reservation.id),
  );

  const unsubscribe = suppressionUrl(preference.access_token);
  const subject = `Your dates at ${propertyName} are still available`;
  const text = [
    `Hi ${firstName},`,
    "",
    `The dates you were looking at for ${propertyName} are still available as of right now.`,
    dates,
    "",
    "If you're still planning the trip, you can pick up where you left off. Your dates are not held until you continue checkout.",
    "",
    `Continue booking: ${recovery.toString()}`,
    "",
    `Don't want missed-booking reminders from Find A Place? ${unsubscribe}`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>The dates you were looking at for <strong>${escapeHtml(
      propertyName,
    )}</strong> are still available as of right now.</p>
    <p><strong>${escapeHtml(dates)}</strong></p>
    <p>If you're still planning the trip, you can pick up where you left off. Your dates are not held until you continue checkout.</p>
    <p><a href="${escapeHtml(recovery.toString())}">Book these dates</a></p>
    <hr>
    <p><small>Don't want missed-booking reminders? <a href="${escapeHtml(
      unsubscribe,
    )}">Turn off booking-recovery emails</a>.</small></p>
  `;

  return sendNotificationOnce({
    admin,
    reservationId,
    type: "BOOKING_RECOVERY_DAY1",
    recipient: reservation.guest_email,
    subject,
    html,
    text,
  });
}

export async function sendRecoveryDiscountOfferEmail(input: {
  admin: SupabaseClient;
  reservationId: string;
  opportunityId: string;
  recipient: string;
  guestName: string | null;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  discountBps: number;
  discountCents: number;
  offerUrl: string;
}) {
  const preference = await ensureRecoverySuppression(
    input.admin,
    input.recipient,
  );
  if (!preference || preference.opted_out_at) {
    return { sent: false, skipped: true, suppressed: true } as const;
  }

  const firstName = input.guestName?.trim().split(/\s+/)[0] || "there";
  const percent = Math.round(input.discountBps / 100);
  const dates = `${prettyRecoveryDate(input.checkIn)} – ${prettyRecoveryDate(
    input.checkOut,
  )}`;
  const unsubscribe = suppressionUrl(preference.access_token);
  const subject = `Save ${percent}% on the ${input.propertyName} dates you viewed`;

  const text = [
    `Hi ${firstName},`,
    "",
    `Those dates at ${input.propertyName} are still open, and the host is offering you ${percent}% off the lodging price you were looking at.`,
    dates,
    `Your offer is worth ${formatMoney(input.discountCents)} off lodging.`,
    "",
    `View your offer and booking code: ${input.offerUrl}`,
    "",
    "Availability can change until a booking is confirmed.",
    "",
    `Don't want missed-booking offers from Find A Place? ${unsubscribe}`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(firstName)},</p>
    <p>Those dates at <strong>${escapeHtml(
      input.propertyName,
    )}</strong> are still open, and the host is offering you <strong>${percent}% off</strong> the lodging price you were looking at.</p>
    <p><strong>${escapeHtml(dates)}</strong><br>${escapeHtml(
      formatMoney(input.discountCents),
    )} off lodging</p>
    <p><a href="${escapeHtml(input.offerUrl)}">View my ${percent}% offer</a></p>
    <p><small>Availability can change until a booking is confirmed.</small></p>
    <hr>
    <p><small>Don't want missed-booking offers? <a href="${escapeHtml(
      unsubscribe,
    )}">Turn off booking-recovery emails</a>.</small></p>
  `;

  return sendNotificationOnce({
    admin: input.admin,
    reservationId: input.reservationId,
    type: `BOOKING_RECOVERY_OFFER:${input.opportunityId}`,
    recipient: input.recipient,
    subject,
    html,
    text,
  });
}
