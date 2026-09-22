import type { SupabaseClient } from "@supabase/supabase-js";

import {
  escapeHtml,
  formatMoney,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

export async function sendDirectChargePaymentConfirmedNotification(
  admin: SupabaseClient,
  reservationId: string,
  paymentId: string,
) {
  const { data: reservation, error: reservationError } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_total_cents,currency,platform_commission_cents,platform_tax_retained_cents,payment_environment",
    )
    .eq("id", reservationId)
    .single();

  if (reservationError || !reservation) {
    throw new Error("Unable to load reservation payment notification context.");
  }

  const [{ data: payment, error: paymentError }, propertyResult, organizationResult] =
    await Promise.all([
      admin
        .from("payments")
        .select(
          "id,status,amount_cents,application_fee_cents,processor_fee_actual_cents,processor_fee_host_share_cents,host_proceeds_cents,currency,payment_environment",
        )
        .eq("id", paymentId)
        .eq("reservation_id", reservationId)
        .eq("payment_environment", reservation.payment_environment)
        .single(),
      admin
        .from("properties")
        .select("name,notification_email,operations_email")
        .eq("id", reservation.property_id)
        .single(),
      admin
        .from("organizations")
        .select("contact_email")
        .eq("id", reservation.organization_id)
        .single(),
    ]);

  if (paymentError || !payment || payment.status !== "SUCCEEDED") {
    throw new Error("Unable to load the confirmed direct-charge payment.");
  }

  const property = propertyResult.data;
  const organization = organizationResult.data;
  const recipient =
    property?.notification_email ||
    property?.operations_email ||
    organization?.contact_email ||
    null;

  if (!recipient) return;

  const currency = payment.currency || reservation.currency || "USD";
  const propertyName = property?.name || "your stay";
  const guestPaid = formatMoney(payment.amount_cents, currency);
  const commission = formatMoney(reservation.platform_commission_cents, currency);
  const taxRetained = formatMoney(
    reservation.platform_tax_retained_cents || 0,
    currency,
  );
  const stripeProcessing = formatMoney(
    payment.processor_fee_actual_cents || 0,
    currency,
  );
  const hostNet = formatMoney(payment.host_proceeds_cents || 0, currency);
  const hostReservationUrl = `${siteUrl()}/host/reservations/${reservation.id}`;

  await sendNotificationOnce({
    admin,
    reservationId,
    type: "HOST_PAYMENT_CONFIRMED_DIRECT",
    recipient,
    subject: `Payment confirmed: ${propertyName} · ${reservation.confirmation_code}`,
    text: [
      `Payment is confirmed for ${propertyName}.`,
      `Confirmation: ${reservation.confirmation_code}`,
      `Guest: ${reservation.guest_name || "Guest"}`,
      `Guest paid: ${guestPaid}`,
      `Find A Place commission: ${commission}`,
      Number(reservation.platform_tax_retained_cents || 0) > 0
        ? `Tax retained by Find A Place for remittance: ${taxRetained}`
        : null,
      `Stripe processing charged to host account: ${stripeProcessing}`,
      `Host net after Find A Place fee/tax and Stripe processing: ${hostNet}`,
      `Stripe owns the host balance and handles the host's normal bank-deposit timing.`,
      `Open reservation: ${hostReservationUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p><strong>Payment confirmed</strong></p><p>${escapeHtml(
      propertyName,
    )} · ${escapeHtml(reservation.confirmation_code)}</p><p><strong>Guest:</strong> ${escapeHtml(
      reservation.guest_name || "Guest",
    )}<br><strong>Guest paid:</strong> ${escapeHtml(
      guestPaid,
    )}<br><strong>Find A Place commission:</strong> ${escapeHtml(
      commission,
    )}${
      Number(reservation.platform_tax_retained_cents || 0) > 0
        ? `<br><strong>Tax retained for remittance:</strong> ${escapeHtml(taxRetained)}`
        : ""
    }<br><strong>Stripe processing charged to host:</strong> ${escapeHtml(
      stripeProcessing,
    )}<br><strong>Host net:</strong> ${escapeHtml(
      hostNet,
    )}</p><p>Stripe owns the host balance and handles the host's normal bank-deposit timing.</p><p><a href="${escapeHtml(
      hostReservationUrl,
    )}">Open the reservation</a></p>`,
  });
}
