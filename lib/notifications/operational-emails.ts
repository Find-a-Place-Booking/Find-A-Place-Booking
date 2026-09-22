import type { SupabaseClient } from "@supabase/supabase-js";

import { sendDirectChargePaymentConfirmedNotification } from "@/lib/notifications/direct-charge-emails";
import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  formatMoney,
  internalAlertRecipients,
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
      : new Error("One or more operational notifications failed.");
  }
}

type BaseContext = {
  reservation: {
    id: string;
    confirmation_code: string;
    property_id: string;
    organization_id: string;
    guest_name: string | null;
    guest_email: string | null;
    currency: string;
    status: string;
    payment_status: string;
    payment_environment: "TEST" | "LIVE";
  };
  propertyName: string;
  hostRecipient: string | null;
  hostReservationUrl: string;
  adminReservationUrl: string;
  tripUrl: string;
};

async function loadContext(
  admin: SupabaseClient,
  reservationId: string,
): Promise<BaseContext> {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,currency,status,payment_status,payment_environment",
    )
    .eq("id", reservationId)
    .single();

  if (error || !reservation) {
    throw new Error("Unable to load reservation notification context.");
  }

  const [propertyResult, organizationResult] = await Promise.all([
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

  const property = propertyResult.data;
  const organization = organizationResult.data;
  const token = createGuestCheckoutToken(reservation.id);
  const base = siteUrl();

  return {
    reservation: reservation as BaseContext["reservation"],
    propertyName: property?.name || "your stay",
    hostRecipient:
      property?.notification_email ||
      property?.operations_email ||
      organization?.contact_email ||
      null,
    hostReservationUrl: `${base}/host/reservations/${reservation.id}`,
    adminReservationUrl: `${base}/admin/reservations/${reservation.id}`,
    tripUrl: `${base}/trip/${encodeURIComponent(
      reservation.confirmation_code,
    )}?reservationId=${encodeURIComponent(
      reservation.id,
    )}&checkoutToken=${encodeURIComponent(token)}`,
  };
}

async function sendInternalAlerts(input: {
  admin: SupabaseClient;
  reservationId: string;
  type: string;
  subject: string;
  text: string;
  html: string;
}) {
  const tasks = internalAlertRecipients().map((recipient) =>
    sendNotificationOnce({
      admin: input.admin,
      reservationId: input.reservationId,
      type: input.type,
      recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  );
  await settleNotificationTasks(tasks);
}

/**
 * Compatibility export for code written before direct charges were introduced.
 * Payment confirmation now uses the host-owned direct-charge email and contains
 * no Find A Place payout scheduling language.
 */
export async function sendPaymentConfirmedNotification(
  admin: SupabaseClient,
  reservationId: string,
  paymentId?: string | null,
) {
  let resolvedPaymentId = paymentId || null;

  if (!resolvedPaymentId) {
    const { data: payment } = await admin
      .from("payments")
      .select("id")
      .eq("reservation_id", reservationId)
      .eq("status", "SUCCEEDED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resolvedPaymentId = payment?.id || null;
  }

  if (!resolvedPaymentId) return;
  await sendDirectChargePaymentConfirmedNotification(
    admin,
    reservationId,
    resolvedPaymentId,
  );
}

export async function sendRefundNotifications(
  admin: SupabaseClient,
  refundId: string,
) {
  const { data: refund, error } = await admin
    .from("refunds")
    .select(
      "id,reservation_id,status,amount_cents,currency,reason,provider_refund_id,payment_environment",
    )
    .eq("id", refundId)
    .single();

  if (error || !refund) {
    throw new Error("Unable to load refund notification data.");
  }

  const context = await loadContext(admin, refund.reservation_id);
  const refundAmount = formatMoney(refund.amount_cents, refund.currency);
  const fullRefund =
    context.reservation.status === "CANCELLED" &&
    context.reservation.payment_status === "REFUNDED";
  const status = String(refund.status || "PENDING").toUpperCase();
  const suffix = refund.id.replace(/-/g, "");

  const labels: Record<string, { subject: string; lead: string }> = {
    PENDING: {
      subject: `Refund processing: ${context.propertyName}`,
      lead: "The host-approved refund is being processed by the payment provider.",
    },
    SUCCEEDED: {
      subject: `${fullRefund ? "Cancellation refund" : "Refund"} completed: ${context.propertyName}`,
      lead: fullRefund
        ? "The reservation was cancelled and the host-approved refund was completed."
        : "The host-approved refund was completed.",
    },
    FAILED: {
      subject: `Refund needs attention: ${context.propertyName}`,
      lead: "The payment provider did not complete the refund automatically. Find A Place support can review the existing payment record.",
    },
    CANCELLED: {
      subject: `Refund update: ${context.propertyName}`,
      lead: "The payment provider cancelled the refund before completion. Find A Place support can review the existing payment record.",
    },
  };

  const copy = labels[status] || labels.PENDING;
  const notificationTasks: Promise<unknown>[] = [];

  if (context.reservation.guest_email) {
    notificationTasks.push(
      sendNotificationOnce({
        admin,
        reservationId: refund.reservation_id,
        type: `GUEST_REFUND_${status}_${suffix}`,
        recipient: context.reservation.guest_email,
        subject: copy.subject,
        text: `${copy.lead}\nRefund: ${refundAmount}\nConfirmation: ${context.reservation.confirmation_code}\nOpen your trip: ${context.tripUrl}`,
        html: `<p>${escapeHtml(copy.lead)}</p><p><strong>Refund:</strong> ${escapeHtml(
          refundAmount,
        )}<br><strong>Confirmation:</strong> ${escapeHtml(
          context.reservation.confirmation_code,
        )}</p><p><a href="${escapeHtml(context.tripUrl)}">Open your trip</a></p>`,
      }),
    );
  }

  if (context.hostRecipient) {
    notificationTasks.push(
      sendNotificationOnce({
        admin,
        reservationId: refund.reservation_id,
        type: `HOST_REFUND_${status}_${suffix}`,
        recipient: context.hostRecipient,
        subject: `${status === "SUCCEEDED" ? "Refund completed" : status === "PENDING" ? "Refund processing" : "Refund needs attention"}: ${context.propertyName} · ${context.reservation.confirmation_code}`,
        text: `${copy.lead}\nRefund: ${refundAmount}\nGuest: ${context.reservation.guest_name || "Guest"}\nConfirmation: ${context.reservation.confirmation_code}\nOpen reservation: ${context.hostReservationUrl}`,
        html: `<p><strong>${escapeHtml(
          status === "SUCCEEDED"
            ? "Refund completed"
            : status === "PENDING"
              ? "Refund processing"
              : "Refund needs attention",
        )}</strong></p><p>${escapeHtml(copy.lead)}</p><p><strong>Refund:</strong> ${escapeHtml(
          refundAmount,
        )}<br><strong>Guest:</strong> ${escapeHtml(
          context.reservation.guest_name || "Guest",
        )}<br><strong>Confirmation:</strong> ${escapeHtml(
          context.reservation.confirmation_code,
        )}</p><p><a href="${escapeHtml(
          context.hostReservationUrl,
        )}">Open the reservation</a></p>`,
      }),
    );
  }

  if (status === "FAILED" || status === "CANCELLED") {
    const reason = refund.reason || "No payment-provider detail was supplied.";
    notificationTasks.push(
      sendInternalAlerts({
        admin,
        reservationId: refund.reservation_id,
        type: `INTERNAL_REFUND_${status}_${suffix}`,
        subject: `[Action required] Refund ${status.toLowerCase()} · ${context.reservation.confirmation_code}`,
        text: `Refund ${refund.id} for ${context.reservation.confirmation_code} is ${status}. Amount: ${refundAmount}. Reason: ${reason}. Open admin reservation: ${context.adminReservationUrl}`,
        html: `<p><strong>Refund ${escapeHtml(status.toLowerCase())}</strong></p><p><strong>Confirmation:</strong> ${escapeHtml(
          context.reservation.confirmation_code,
        )}<br><strong>Refund:</strong> ${escapeHtml(
          refundAmount,
        )}<br><strong>Refund ID:</strong> ${escapeHtml(
          refund.id,
        )}</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p><a href="${escapeHtml(
          context.adminReservationUrl,
        )}">Open admin reservation</a></p>`,
      }),
    );
  }

  await settleNotificationTasks(notificationTasks);
}

/**
 * Kept as a compatibility export only. Find A Place no longer creates host bank
 * payouts, so there is no platform payout email to send.
 */
export async function sendPayoutNotifications(
  _admin: SupabaseClient,
  _payoutId: string,
) {
  return;
}

export async function sendDisputeNotifications(
  admin: SupabaseClient,
  input: {
    paymentEnvironment: "TEST" | "LIVE";
    paymentIntentId?: string | null;
    chargeId?: string | null;
    disputeId: string;
    amountCents: number;
    currency: string;
    status: string;
    closed?: boolean;
  },
) {
  let payment: { reservation_id: string } | null = null;

  if (input.paymentIntentId) {
    const result = await admin
      .from("payments")
      .select("reservation_id")
      .eq("provider", "STRIPE")
      .eq("provider_payment_id", input.paymentIntentId)
      .eq("payment_environment", input.paymentEnvironment)
      .maybeSingle();
    payment = result.data;
  }

  if (!payment && input.chargeId) {
    const result = await admin
      .from("payments")
      .select("reservation_id")
      .eq("provider", "STRIPE")
      .eq("provider_charge_id", input.chargeId)
      .eq("payment_environment", input.paymentEnvironment)
      .maybeSingle();
    payment = result.data;
  }

  if (!payment) return;

  const context = await loadContext(admin, payment.reservation_id);
  const status = input.status.toLowerCase();
  const closed = Boolean(input.closed) || status === "won" || status === "lost";
  const amount = formatMoney(input.amountCents, input.currency);
  const cleanId = input.disputeId.replace(/[^a-zA-Z0-9]/g, "");
  const phase = closed ? "CLOSED" : "OPENED";
  const outcome = status === "won" ? "won" : status === "lost" ? "lost" : status;
  const notificationTasks: Promise<unknown>[] = [];

  if (context.hostRecipient) {
    notificationTasks.push(
      sendNotificationOnce({
        admin,
        reservationId: payment.reservation_id,
        type: `HOST_DISPUTE_${phase}_${cleanId}`,
        recipient: context.hostRecipient,
        subject: `${closed ? "Payment dispute closed" : "Payment dispute opened"}: ${context.propertyName}`,
        text: `${closed ? `The payment dispute was closed with status: ${outcome}.` : "A payment dispute was opened on the host payment account and Find A Place recorded the reservation link."}\nAmount: ${amount}\nConfirmation: ${context.reservation.confirmation_code}\nOpen reservation: ${context.hostReservationUrl}`,
        html: `<p><strong>${closed ? "Payment dispute closed" : "Payment dispute opened"}</strong></p><p>${escapeHtml(
          closed
            ? `The dispute was closed with status: ${outcome}.`
            : "A payment dispute was opened on the host payment account and Find A Place recorded the reservation link.",
        )}</p><p><strong>Amount:</strong> ${escapeHtml(
          amount,
        )}<br><strong>Confirmation:</strong> ${escapeHtml(
          context.reservation.confirmation_code,
        )}</p><p><a href="${escapeHtml(
          context.hostReservationUrl,
        )}">Open the reservation</a></p>`,
      }),
    );
  }

  notificationTasks.push(
    sendInternalAlerts({
      admin,
      reservationId: payment.reservation_id,
      type: `INTERNAL_DISPUTE_${phase}_${cleanId}`,
      subject: `[${closed ? "Dispute closed" : "Action required"}] ${context.reservation.confirmation_code} · ${input.disputeId}`,
      text: `Stripe dispute ${input.disputeId} ${closed ? `closed with status ${outcome}` : `is ${status}`}. Amount: ${amount}. Confirmation: ${context.reservation.confirmation_code}. Open admin reservation: ${context.adminReservationUrl}`,
      html: `<p><strong>Stripe dispute ${closed ? "closed" : "opened"}</strong></p><p><strong>Dispute:</strong> ${escapeHtml(
        input.disputeId,
      )}<br><strong>Status:</strong> ${escapeHtml(
        outcome,
      )}<br><strong>Amount:</strong> ${escapeHtml(
        amount,
      )}<br><strong>Confirmation:</strong> ${escapeHtml(
        context.reservation.confirmation_code,
      )}</p><p><a href="${escapeHtml(
        context.adminReservationUrl,
      )}">Open admin reservation</a></p>`,
    }),
  );

  await settleNotificationTasks(notificationTasks);
}
