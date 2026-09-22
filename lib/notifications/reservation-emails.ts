import type { SupabaseClient } from "@supabase/supabase-js";

import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

async function settleNotificationTasks(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length) {
    const first = failures[0].reason;
    throw first instanceof Error
      ? first
      : new Error("One or more booking notifications failed.");
  }
}

export async function sendBookingNotifications(
  admin: SupabaseClient,
  reservationId: string,
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,guest_phone,guest_email_verified_at,identity_verification_status,identity_verified_at,policy_snapshot,guest_total_cents,currency,check_in,check_out",
    )
    .eq("id", reservationId)
    .single();
  if (error || !reservation) {
    throw new Error("Unable to load booking notification data.");
  }

  const [propertyResult, organizationResult, policyAcceptanceResult] =
    await Promise.all([
      admin
        .from("properties")
        .select("name,notification_email,operations_email")
        .eq("id", reservation.property_id)
        .single(),
      admin
        .from("organizations")
        .select("name,contact_email,contact_phone")
        .eq("id", reservation.organization_id)
        .single(),
      admin
        .from("reservation_policy_acceptances")
        .select(
          "platform_terms_version,cancellation_policy_version,property_policy_document_version,accepted_at",
        )
        .eq("reservation_id", reservationId)
        .maybeSingle(),
    ]);

  const property = propertyResult.data;
  const organization = organizationResult.data;
  const propertyName = property?.name || "your stay";
  const hostName = organization?.name || propertyName;
  const guestName = reservation.guest_name || "Guest";
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: reservation.currency || "USD",
  }).format(Number(reservation.guest_total_cents) / 100);
  const token = createGuestCheckoutToken(reservation.id);
  const tripUrl = `${siteUrl()}/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(
    reservation.id,
  )}&checkoutToken=${encodeURIComponent(token)}`;

  const notificationTasks: Promise<unknown>[] = [];

  if (reservation.guest_email) {
    const hostContact = [
      organization?.contact_email
        ? `Host email: ${organization.contact_email}`
        : null,
      organization?.contact_phone
        ? `Host phone: ${organization.contact_phone}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    notificationTasks.push(
      sendNotificationOnce({
        admin,
        reservationId,
        type: "GUEST_BOOKING_CONFIRMED",
        recipient: reservation.guest_email,
        subject: `Booking confirmed: ${propertyName}`,
        text: [
          `Hi ${guestName}, your booking ${reservation.confirmation_code} at ${propertyName} is confirmed for ${reservation.check_in} through ${reservation.check_out}.`,
          `Total: ${total}`,
          `Host: ${hostName}`,
          hostContact || null,
          `Use My Trip to message the host, request a booking change, review details or send a cancellation request: ${tripUrl}`,
          `If you lose this link, go to ${siteUrl()}/trip and enter confirmation ${reservation.confirmation_code} with the booking email.`,
        ]
          .filter(Boolean)
          .join("\n"),
        html: `<p>Hi ${escapeHtml(guestName)},</p><p>Your booking at <strong>${escapeHtml(
          propertyName,
        )}</strong> is confirmed.</p><p><strong>Confirmation:</strong> ${escapeHtml(
          reservation.confirmation_code,
        )}<br><strong>Dates:</strong> ${escapeHtml(
          reservation.check_in,
        )} through ${escapeHtml(
          reservation.check_out,
        )}<br><strong>Total:</strong> ${escapeHtml(
          total,
        )}</p><p><strong>Your host:</strong> ${escapeHtml(hostName)}${
          organization?.contact_email
            ? `<br><strong>Email:</strong> ${escapeHtml(organization.contact_email)}`
            : ""
        }${
          organization?.contact_phone
            ? `<br><strong>Phone:</strong> ${escapeHtml(organization.contact_phone)}`
            : ""
        }</p><p><a href="${escapeHtml(
          tripUrl,
        )}">Open My Trip</a></p><p>If you lose this link, go to <a href="${escapeHtml(siteUrl() + "/trip")}">My Trip</a> and enter your confirmation number with the booking email.</p><p>Booking changes and cancellation requests can be sent directly to the host from your trip page.</p>`,
      }),
    );
  }

  const hostRecipient =
    property?.notification_email ||
    property?.operations_email ||
    organization?.contact_email;

  if (hostRecipient) {
    const emailVerified = reservation.guest_email_verified_at
      ? "Verified"
      : "Not verified";
    const identityVerified =
      reservation.identity_verification_status === "VERIFIED" &&
      reservation.identity_verified_at
        ? "Verified by Stripe Identity"
        : "Not verified";
    const guestEmail = reservation.guest_email || "Not provided";
    const guestPhone = reservation.guest_phone || "Not provided";
    const policyAcceptance = policyAcceptanceResult.data;
    const policyVersion = policyAcceptance?.property_policy_document_version
      ? `Property policy PDF v${policyAcceptance.property_policy_document_version}`
      : "Reservation property rules";
    const agreementSummary = policyAcceptance?.accepted_at
      ? `${policyVersion}; Find A Place terms ${policyAcceptance.platform_terms_version}; cancellation-request terms ${policyAcceptance.cancellation_policy_version}`
      : "Policy acceptance record unavailable";

    notificationTasks.push(
      sendNotificationOnce({
        admin,
        reservationId,
        type: "HOST_NEW_BOOKING",
        recipient: hostRecipient,
        subject: `New booking: ${propertyName} · ${reservation.confirmation_code}`,
        text: [
          `${guestName} booked ${propertyName} for ${reservation.check_in} through ${reservation.check_out}.`,
          `Guest total: ${total}`,
          `Confirmation: ${reservation.confirmation_code}`,
          `Guest email: ${guestEmail} (${emailVerified})`,
          `Guest phone: ${guestPhone}`,
          `Identity: ${identityVerified}`,
          `Policies accepted: ${agreementSummary}`,
          `Message the guest or manage the booking: ${siteUrl()}/host/reservations/${reservation.id}`,
        ].join("\n"),
        html: `<p><strong>New Find A Place booking</strong></p><p>${escapeHtml(
          guestName,
        )} booked ${escapeHtml(propertyName)}.</p><p><strong>Dates:</strong> ${escapeHtml(
          reservation.check_in,
        )} through ${escapeHtml(
          reservation.check_out,
        )}<br><strong>Guest total:</strong> ${escapeHtml(
          total,
        )}<br><strong>Confirmation:</strong> ${escapeHtml(
          reservation.confirmation_code,
        )}</p><p><strong>Guest email:</strong> ${escapeHtml(
          guestEmail,
        )} · ${escapeHtml(emailVerified)}<br><strong>Guest phone:</strong> ${escapeHtml(
          guestPhone,
        )}<br><strong>Identity:</strong> ${escapeHtml(
          identityVerified,
        )}<br><strong>Policies:</strong> ${escapeHtml(
          agreementSummary,
        )}</p><p>Use the reservation page to message the guest and respond to any cancellation request.</p><p><a href="${escapeHtml(
          `${siteUrl()}/host/reservations/${reservation.id}`,
        )}">Open the reservation</a></p>`,
      }),
    );
  }

  await settleNotificationTasks(notificationTasks);
}
