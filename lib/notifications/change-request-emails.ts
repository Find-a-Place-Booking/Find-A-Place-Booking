import type { SupabaseClient } from "@supabase/supabase-js";

import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

async function loadChangeContext(
  admin: SupabaseClient,
  reservationId: string,
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,guest_phone,check_in,check_out",
    )
    .eq("id", reservationId)
    .single();

  if (error || !reservation) {
    throw new Error("Unable to load change-request context.");
  }

  const [{ data: property }, { data: organization }] = await Promise.all([
    admin
      .from("properties")
      .select("name,notification_email,operations_email")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name,public_host_name,contact_email,contact_phone")
      .eq("id", reservation.organization_id)
      .maybeSingle(),
  ]);

  const propertyName = property?.name || "your Find A Place stay";
  const hostName =
    organization?.public_host_name?.trim() || organization?.name || propertyName;
  const hostRecipient =
    property?.notification_email ||
    property?.operations_email ||
    organization?.contact_email ||
    null;
  const token = createGuestCheckoutToken(reservation.id);
  const tripUrl = `${siteUrl()}/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(
    reservation.id,
  )}&checkoutToken=${encodeURIComponent(token)}`;

  return {
    reservation,
    propertyName,
    hostName,
    hostRecipient,
    hostEmail: organization?.contact_email || null,
    hostPhone: organization?.contact_phone || null,
    tripUrl,
    hostReservationUrl: `${siteUrl()}/host/reservations/${reservation.id}`,
  };
}

export async function sendChangeRequestNotification(
  admin: SupabaseClient,
  input: {
    requestId: string;
    reservationId: string;
    requestText: string;
  },
) {
  const context = await loadChangeContext(admin, input.reservationId);
  if (!context.hostRecipient) return;

  const cleanRequestId = input.requestId.replace(/[^a-zA-Z0-9]/g, "");
  const requestText = input.requestText.trim();

  await sendNotificationOnce({
    admin,
    reservationId: input.reservationId,
    type: `HOST_CHANGE_REQUEST_${cleanRequestId}`,
    recipient: context.hostRecipient,
    subject: `Booking change request: ${context.propertyName} · ${context.reservation.confirmation_code}`,
    text: [
      `${context.reservation.guest_name || "Your guest"} sent a booking change request for ${context.propertyName}.`,
      `Confirmation: ${context.reservation.confirmation_code}`,
      `Current dates: ${context.reservation.check_in} through ${context.reservation.check_out}`,
      `Guest email: ${context.reservation.guest_email || "Not provided"}`,
      `Guest phone: ${context.reservation.guest_phone || "Not provided"}`,
      `Request: ${requestText}`,
      `Review and respond from the reservation page: ${context.hostReservationUrl}`,
    ].join("\n"),
    html: `<p><strong>Guest booking change request</strong></p><p>${escapeHtml(
      context.reservation.guest_name || "Your guest",
    )} sent a change request for <strong>${escapeHtml(
      context.propertyName,
    )}</strong>.</p><p><strong>Confirmation:</strong> ${escapeHtml(
      context.reservation.confirmation_code,
    )}<br><strong>Current dates:</strong> ${escapeHtml(
      context.reservation.check_in,
    )} through ${escapeHtml(
      context.reservation.check_out,
    )}<br><strong>Guest email:</strong> ${escapeHtml(
      context.reservation.guest_email || "Not provided",
    )}<br><strong>Guest phone:</strong> ${escapeHtml(
      context.reservation.guest_phone || "Not provided",
    )}</p><p><strong>Requested change:</strong><br>${escapeHtml(
      requestText,
    )}</p><p><a href="${escapeHtml(
      context.hostReservationUrl,
    )}">Review change request</a></p>`,
  });
}

export async function sendChangeDecisionNotification(
  admin: SupabaseClient,
  input: {
    requestId: string;
    reservationId: string;
    decision: "APPROVED" | "DECLINED";
    hostResponse?: string | null;
  },
) {
  const context = await loadChangeContext(admin, input.reservationId);
  if (!context.reservation.guest_email) return;

  const approved = input.decision === "APPROVED";
  const response = input.hostResponse?.trim() || null;
  const cleanRequestId = input.requestId.replace(/[^a-zA-Z0-9]/g, "");

  await sendNotificationOnce({
    admin,
    reservationId: input.reservationId,
    type: `GUEST_CHANGE_${input.decision}_${cleanRequestId}`,
    recipient: context.reservation.guest_email,
    subject: `${approved ? "Change request approved" : "Change request declined"}: ${context.propertyName}`,
    text: [
      `${context.hostName} ${approved ? "approved" : "declined"} your booking change request for ${context.propertyName}.`,
      `Confirmation: ${context.reservation.confirmation_code}`,
      response ? `Host response: ${response}` : null,
      approved
        ? "This records the host's approval. If the request changes dates, guest count, pricing or payment, rely on the updated reservation details once the host confirms those changes have been applied."
        : "The existing reservation remains unchanged unless you and the host agree to another arrangement.",
      `Open your trip: ${context.tripUrl}`,
      context.hostEmail ? `Host email: ${context.hostEmail}` : null,
      context.hostPhone ? `Host phone: ${context.hostPhone}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p><strong>${approved ? "Change request approved" : "Change request declined"}</strong></p><p>${escapeHtml(
      context.hostName,
    )} ${approved ? "approved" : "declined"} your request for ${escapeHtml(
      context.propertyName,
    )}.</p><p><strong>Confirmation:</strong> ${escapeHtml(
      context.reservation.confirmation_code,
    )}</p>${
      response
        ? `<p><strong>Host response:</strong><br>${escapeHtml(response)}</p>`
        : ""
    }<p>${escapeHtml(
      approved
        ? "This records the host's approval. If the request changes dates, guest count, pricing or payment, rely on the updated reservation details once the host confirms those changes have been applied."
        : "The existing reservation remains unchanged unless you and the host agree to another arrangement.",
    )}</p><p><a href="${escapeHtml(context.tripUrl)}">Open your trip</a></p>`,
  });
}
