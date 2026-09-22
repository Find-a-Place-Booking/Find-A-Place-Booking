import type { SupabaseClient } from "@supabase/supabase-js";

import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

async function loadCancellationContext(
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
    throw new Error("Unable to load cancellation request context.");
  }

  const [{ data: property }, { data: organization }] = await Promise.all([
    admin
      .from("properties")
      .select("name,notification_email,operations_email")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name,contact_email,contact_phone")
      .eq("id", reservation.organization_id)
      .maybeSingle(),
  ]);

  const propertyName = property?.name || "your Find A Place stay";
  const hostName = organization?.name || propertyName;
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

export async function sendCancellationRequestNotification(
  admin: SupabaseClient,
  input: {
    requestId: string;
    reservationId: string;
    reason?: string | null;
  },
) {
  const context = await loadCancellationContext(admin, input.reservationId);
  if (!context.hostRecipient) return;

  const reason = input.reason?.trim() || "No additional reason was provided.";
  const cleanRequestId = input.requestId.replace(/[^a-zA-Z0-9]/g, "");

  await sendNotificationOnce({
    admin,
    reservationId: input.reservationId,
    type: `HOST_CANCELLATION_REQUEST_${cleanRequestId}`,
    recipient: context.hostRecipient,
    subject: `Cancellation request: ${context.propertyName} · ${context.reservation.confirmation_code}`,
    text: [
      `${context.reservation.guest_name || "Your guest"} requested cancellation of ${context.propertyName}.`,
      `Confirmation: ${context.reservation.confirmation_code}`,
      `Dates: ${context.reservation.check_in} through ${context.reservation.check_out}`,
      `Guest email: ${context.reservation.guest_email || "Not provided"}`,
      `Guest phone: ${context.reservation.guest_phone || "Not provided"}`,
      `Reason: ${reason}`,
      `The request does not cancel the reservation by itself. Review it and respond from the reservation page: ${context.hostReservationUrl}`,
    ].join("\n"),
    html: `<p><strong>Guest cancellation request</strong></p><p>${escapeHtml(
      context.reservation.guest_name || "Your guest",
    )} requested cancellation of <strong>${escapeHtml(
      context.propertyName,
    )}</strong>.</p><p><strong>Confirmation:</strong> ${escapeHtml(
      context.reservation.confirmation_code,
    )}<br><strong>Dates:</strong> ${escapeHtml(
      context.reservation.check_in,
    )} through ${escapeHtml(
      context.reservation.check_out,
    )}<br><strong>Guest email:</strong> ${escapeHtml(
      context.reservation.guest_email || "Not provided",
    )}<br><strong>Guest phone:</strong> ${escapeHtml(
      context.reservation.guest_phone || "Not provided",
    )}</p><p><strong>Reason:</strong><br>${escapeHtml(
      reason,
    )}</p><p>This request does not cancel the reservation by itself. Review the accepted policy and respond directly to the guest.</p><p><a href="${escapeHtml(
      context.hostReservationUrl,
    )}">Review cancellation request</a></p>`,
  });
}

export async function sendCancellationDecisionNotification(
  admin: SupabaseClient,
  input: {
    requestId: string;
    reservationId: string;
    decision: "APPROVED" | "APPROVED_NO_REFUND" | "DECLINED";
    hostResponse?: string | null;
    refundStatus?: string | null;
  },
) {
  const context = await loadCancellationContext(admin, input.reservationId);
  if (!context.reservation.guest_email) return;

  const approved = input.decision === "APPROVED";
  const approvedNoRefund = input.decision === "APPROVED_NO_REFUND";
  const response = input.hostResponse?.trim() || null;
  const cleanRequestId = input.requestId.replace(/[^a-zA-Z0-9]/g, "");
  const processorLine = approved
    ? input.refundStatus === "SUCCEEDED"
      ? "The host-approved refund was submitted successfully through the payment processor. Your bank or card issuer controls when the credit appears."
      : "The host approved the request. Any approved refund is being processed through the payment processor."
    : approvedNoRefund
      ? "The host cancelled the reservation without a refund under the property terms applied to the booking. No refund was submitted through Find A Place."
      : "The reservation remains confirmed unless you and the host agree to a different resolution.";

  await sendNotificationOnce({
    admin,
    reservationId: input.reservationId,
    type: `GUEST_CANCELLATION_${input.decision}_${cleanRequestId}`,
    recipient: context.reservation.guest_email,
    subject: `${approved ? "Cancellation approved" : approvedNoRefund ? "Reservation cancelled" : "Cancellation request declined"}: ${context.propertyName}`,
    text: [
      `${context.hostName} ${approved ? "approved" : approvedNoRefund ? "approved cancellation without a refund for" : "declined"} your cancellation request for ${context.propertyName}.`,
      `Confirmation: ${context.reservation.confirmation_code}`,
      response ? `Host response: ${response}` : null,
      processorLine,
      `Message your host or review the booking: ${context.tripUrl}`,
      context.hostEmail ? `Host email: ${context.hostEmail}` : null,
      context.hostPhone ? `Host phone: ${context.hostPhone}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p><strong>${approved ? "Cancellation approved" : approvedNoRefund ? "Reservation cancelled without refund" : "Cancellation request declined"}</strong></p><p>${escapeHtml(
      context.hostName,
    )} ${approved ? "approved" : approvedNoRefund ? "approved cancellation without a refund for" : "declined"} your request for ${escapeHtml(
      context.propertyName,
    )}.</p><p><strong>Confirmation:</strong> ${escapeHtml(
      context.reservation.confirmation_code,
    )}</p>${
      response
        ? `<p><strong>Host response:</strong><br>${escapeHtml(response)}</p>`
        : ""
    }<p>${escapeHtml(processorLine)}</p><p><a href="${escapeHtml(
      context.tripUrl,
    )}">Open your trip and message the host</a></p>`,
  });
}
