import type { SupabaseClient } from "@supabase/supabase-js";

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
    guest_total_cents: number | string;
    currency: string;
    check_in: string;
    check_out: string;
    status: string;
    payment_status: string;
    payment_environment: "TEST" | "LIVE";
    platform_commission_cents: number | string;
    platform_tax_retained_cents: number | string;
  };
  propertyName: string;
  propertyTimeZone: string;
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
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,guest_total_cents,currency,check_in,check_out,status,payment_status,payment_environment,platform_commission_cents,platform_tax_retained_cents",
    )
    .eq("id", reservationId)
    .single();

  if (error || !reservation) {
    throw new Error("Unable to load reservation notification context.");
  }

  const [propertyResult, organizationResult] = await Promise.all([
    admin
      .from("properties")
      .select("name,notification_email,operations_email,time_zone")
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
    propertyTimeZone: property?.time_zone || "America/Chicago",
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

function formatDateTime(value: string | null | undefined, timeZone: string) {
  if (!value) return "Not scheduled yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
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

export async function sendPaymentConfirmedNotification(
  admin: SupabaseClient,
  reservationId: string,
  paymentId?: string | null,
) {
  const context = await loadContext(admin, reservationId);
  if (!context.hostRecipient) return;

  let paymentQuery = admin
    .from("payments")
    .select(
      "id,status,amount_cents,application_fee_cents,platform_tax_retained_cents,processor_fee_host_share_cents,host_proceeds_cents,currency,payment_environment",
    )
    .eq("reservation_id", reservationId)
    .eq("payment_environment", context.reservation.payment_environment);

  if (paymentId) paymentQuery = paymentQuery.eq("id", paymentId);

  const { data: payment, error } = await paymentQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !payment) {
    throw new Error("Unable to load confirmed payment for notification.");
  }

  if (!["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "DISPUTED"].includes(payment.status)) {
    return;
  }

  const { data: payout } = await admin
    .from("reservation_payouts")
    .select("amount_cents,payout_eligible_at,status")
    .eq("reservation_id", reservationId)
    .eq("payment_environment", context.reservation.payment_environment)
    .maybeSingle();

  const guestPaid = formatMoney(payment.amount_cents, payment.currency);
  const platformTax = formatMoney(
    payment.platform_tax_retained_cents,
    payment.currency,
  );
  const commission = formatMoney(
    context.reservation.platform_commission_cents,
    payment.currency,
  );
  const processing = formatMoney(
    payment.processor_fee_host_share_cents,
    payment.currency,
  );
  const hostProceeds = formatMoney(payment.host_proceeds_cents, payment.currency);
  const scheduledPayout = formatMoney(
    payout?.amount_cents ?? payment.host_proceeds_cents,
    payment.currency,
  );
  const payoutEligible = formatDateTime(
    payout?.payout_eligible_at,
    context.propertyTimeZone,
  );

  await sendNotificationOnce({
    admin,
    reservationId,
    type: "HOST_PAYMENT_CONFIRMED",
    recipient: context.hostRecipient,
    subject: `Payment confirmed: ${context.propertyName} · ${context.reservation.confirmation_code}`,
    text: [
      `Payment is confirmed for ${context.propertyName}.`,
      `Confirmation: ${context.reservation.confirmation_code}`,
      `Guest paid: ${guestPaid}`,
      `Find A Place tax held for remittance: ${platformTax}`,
      `Find A Place commission: ${commission}`,
      `Host processing: ${processing}`,
      `Host proceeds: ${hostProceeds}`,
      `Scheduled payout amount: ${scheduledPayout}`,
      `Payout eligible: ${payoutEligible}`,
      `Payout status: ${payout?.status || "SCHEDULED"}`,
      `Open reservation: ${context.hostReservationUrl}`,
    ].join("\n"),
    html: `<p><strong>Payment confirmed</strong></p><p>${escapeHtml(
      context.propertyName,
    )} · ${escapeHtml(context.reservation.confirmation_code)}</p><p><strong>Guest paid:</strong> ${escapeHtml(
      guestPaid,
    )}<br><strong>Find A Place tax held for remittance:</strong> ${escapeHtml(
      platformTax,
    )}<br><strong>Find A Place commission:</strong> ${escapeHtml(
      commission,
    )}<br><strong>Host processing:</strong> ${escapeHtml(
      processing,
    )}<br><strong>Host proceeds:</strong> ${escapeHtml(
      hostProceeds,
    )}</p><p><strong>Scheduled payout:</strong> ${escapeHtml(
      scheduledPayout,
    )}<br><strong>Payout eligible:</strong> ${escapeHtml(
      payoutEligible,
    )}<br><strong>Status:</strong> ${escapeHtml(
      payout?.status || "SCHEDULED",
    )}</p><p><a href="${escapeHtml(
      context.hostReservationUrl,
    )}">Open the reservation</a></p>`,
  });
}

export async function sendRefundNotifications(
  admin: SupabaseClient,
  refundId: string,
) {
  const { data: refund, error } = await admin
    .from("refunds")
    .select(
      "id,reservation_id,payment_id,status,amount_cents,currency,reason,provider_refund_id,payment_environment",
    )
    .eq("id", refundId)
    .single();

  if (error || !refund) {
    throw new Error("Unable to load refund notification data.");
  }

  const context = await loadContext(admin, refund.reservation_id);

  const refundAmount = formatMoney(refund.amount_cents, refund.currency);
  // record_refund_result runs before notification delivery. Use the canonical
  // reservation/payment state so multiple successful partial refunds that
  // cumulatively become a full refund are described correctly.
  const fullRefund =
    context.reservation.status === "CANCELLED" &&
    context.reservation.payment_status === "REFUNDED";
  const status = String(refund.status || "PENDING").toUpperCase();
  const suffix = refund.id.replace(/-/g, "");

  const labels: Record<string, { subject: string; lead: string }> = {
    PENDING: {
      subject: `Refund processing: ${context.propertyName}`,
      lead: "Your refund request is being processed.",
    },
    SUCCEEDED: {
      subject: `${fullRefund ? "Cancellation refund" : "Refund"} completed: ${context.propertyName}`,
      lead: fullRefund
        ? "Your reservation has been cancelled and the refund was completed."
        : "Your refund was completed.",
    },
    FAILED: {
      subject: `Refund needs attention: ${context.propertyName}`,
      lead: "The refund could not be completed automatically and needs Find A Place review.",
    },
    CANCELLED: {
      subject: `Refund update: ${context.propertyName}`,
      lead: "The refund was cancelled before completion and needs Find A Place review.",
    },
  };

  const copy = labels[status] || labels.PENDING;
  const guestType = `GUEST_REFUND_${status}_${suffix}`;
  const hostType = `HOST_REFUND_${status}_${suffix}`;
  const notificationTasks: Promise<unknown>[] = [];

  if (context.reservation.guest_email) {
    notificationTasks.push(sendNotificationOnce({
      admin,
      reservationId: refund.reservation_id,
      type: guestType,
      recipient: context.reservation.guest_email,
      subject: copy.subject,
      text: `${copy.lead}\nRefund: ${refundAmount}\nConfirmation: ${context.reservation.confirmation_code}\n${
        status === "FAILED" || status === "CANCELLED"
          ? "Do not submit the refund again. Find A Place support can review the existing refund record.\n"
          : ""
      }Open your trip: ${context.tripUrl}`,
      html: `<p>${escapeHtml(copy.lead)}</p><p><strong>Refund:</strong> ${escapeHtml(
        refundAmount,
      )}<br><strong>Confirmation:</strong> ${escapeHtml(
        context.reservation.confirmation_code,
      )}</p>${
        status === "FAILED" || status === "CANCELLED"
          ? "<p>Do not submit the refund again. Find A Place support can review the existing refund record.</p>"
          : ""
      }<p><a href="${escapeHtml(context.tripUrl)}">Open your trip</a></p>`,
    }));
  }

  if (context.hostRecipient) {
    notificationTasks.push(sendNotificationOnce({
      admin,
      reservationId: refund.reservation_id,
      type: hostType,
      recipient: context.hostRecipient,
      subject: `${status === "SUCCEEDED" ? "Refund completed" : status === "PENDING" ? "Refund processing" : "Refund needs attention"}: ${context.propertyName} · ${context.reservation.confirmation_code}`,
      text: `${copy.lead}\nRefund: ${refundAmount}\nGuest: ${context.reservation.guest_name || "Guest"}\nConfirmation: ${context.reservation.confirmation_code}\n${fullRefund ? "This is a full reservation refund.\n" : "This is a partial refund.\n"}Open reservation: ${context.hostReservationUrl}`,
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
      )}<br><strong>Refund type:</strong> ${fullRefund ? "Full" : "Partial"}</p><p><a href="${escapeHtml(
        context.hostReservationUrl,
      )}">Open the reservation</a></p>`,
    }));
  }

  if (status === "FAILED" || status === "CANCELLED") {
    const reason = refund.reason || "No failure detail was supplied by Stripe.";
    notificationTasks.push(sendInternalAlerts({
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
    }));
  }

  await settleNotificationTasks(notificationTasks);
}

export async function sendPayoutNotifications(
  admin: SupabaseClient,
  payoutId: string,
) {
  const { data: payout, error } = await admin
    .from("reservation_payouts")
    .select(
      "id,reservation_id,status,amount_cents,currency,payout_eligible_at,initiated_at,estimated_arrival_at,paid_at,failed_at,last_error,provider_payout_id,payment_environment",
    )
    .eq("id", payoutId)
    .single();

  if (error || !payout) {
    throw new Error("Unable to load payout notification data.");
  }

  const context = await loadContext(admin, payout.reservation_id);
  const status = String(payout.status || "").toUpperCase();
  const amount = formatMoney(payout.amount_cents, payout.currency);
  const arrival = formatDateTime(
    payout.estimated_arrival_at,
    context.propertyTimeZone,
  );
  const notificationTasks: Promise<unknown>[] = [];

  if (["PENDING", "IN_TRANSIT"].includes(status) && context.hostRecipient) {
    notificationTasks.push(sendNotificationOnce({
      admin,
      reservationId: payout.reservation_id,
      type: "HOST_PAYOUT_SENT",
      recipient: context.hostRecipient,
      subject: `Payout sent: ${amount} · ${context.propertyName}`,
      text: `Find A Place sent a ${amount} payout for ${context.propertyName} (${context.reservation.confirmation_code}) to the connected Stripe payout account. Estimated arrival: ${arrival}. Open payouts: ${siteUrl()}/host/payouts`,
      html: `<p><strong>Payout sent</strong></p><p><strong>Amount:</strong> ${escapeHtml(
        amount,
      )}<br><strong>Property:</strong> ${escapeHtml(
        context.propertyName,
      )}<br><strong>Confirmation:</strong> ${escapeHtml(
        context.reservation.confirmation_code,
      )}<br><strong>Estimated arrival:</strong> ${escapeHtml(
        arrival,
      )}</p><p><a href="${escapeHtml(siteUrl() + "/host/payouts")}">Open payouts</a></p>`,
    }));
  }

  if (status === "PAID" && context.hostRecipient) {
    notificationTasks.push(sendNotificationOnce({
      admin,
      reservationId: payout.reservation_id,
      type: "HOST_PAYOUT_PAID",
      recipient: context.hostRecipient,
      subject: `Payout completed: ${amount} · ${context.propertyName}`,
      text: `Stripe marked the ${amount} payout for ${context.propertyName} (${context.reservation.confirmation_code}) as paid. Open payouts: ${siteUrl()}/host/payouts`,
      html: `<p><strong>Payout completed</strong></p><p>Stripe marked the <strong>${escapeHtml(
        amount,
      )}</strong> payout for ${escapeHtml(
        context.propertyName,
      )} as paid.</p><p><strong>Confirmation:</strong> ${escapeHtml(
        context.reservation.confirmation_code,
      )}</p><p><a href="${escapeHtml(siteUrl() + "/host/payouts")}">Open payouts</a></p>`,
    }));
  }

  if (status === "FAILED" || status === "CANCELLED") {
    const reason =
      payout.last_error ||
      (status === "CANCELLED"
        ? "Stripe reported that the bank payout was cancelled before completion."
        : "Stripe reported that the bank payout failed.");
    const issueLabel = status === "CANCELLED" ? "cancelled" : "failed";

    if (context.hostRecipient) {
      notificationTasks.push(sendNotificationOnce({
        admin,
        reservationId: payout.reservation_id,
        type: `HOST_PAYOUT_${status}`,
        recipient: context.hostRecipient,
        subject: `Payout needs attention: ${context.propertyName}`,
        text: `The ${amount} payout for ${context.propertyName} (${context.reservation.confirmation_code}) was ${issueLabel}. Find A Place will keep the payout record and review the Stripe payout status. Reason: ${reason}. Open payouts: ${siteUrl()}/host/payouts`,
        html: `<p><strong>Payout needs attention</strong></p><p>The ${escapeHtml(
          amount,
        )} payout for ${escapeHtml(
          context.propertyName,
        )} was ${escapeHtml(issueLabel)}.</p><p><strong>Reason:</strong> ${escapeHtml(
          reason,
        )}</p><p>Find A Place keeps the payout record for review; do not create a duplicate payout.</p><p><a href="${escapeHtml(
          siteUrl() + "/host/payouts",
        )}">Open payouts</a></p>`,
      }));
    }

    notificationTasks.push(sendInternalAlerts({
      admin,
      reservationId: payout.reservation_id,
      type: `INTERNAL_PAYOUT_${status}`,
      subject: `[Action required] Host payout ${issueLabel} · ${context.reservation.confirmation_code}`,
      text: `Payout ${payout.id} was ${issueLabel} for ${context.reservation.confirmation_code}. Amount: ${amount}. Stripe payout: ${payout.provider_payout_id || "not recorded"}. Reason: ${reason}. Open admin reservation: ${context.adminReservationUrl}`,
      html: `<p><strong>Host payout ${escapeHtml(issueLabel)}</strong></p><p><strong>Confirmation:</strong> ${escapeHtml(
        context.reservation.confirmation_code,
      )}<br><strong>Amount:</strong> ${escapeHtml(
        amount,
      )}<br><strong>Payout ID:</strong> ${escapeHtml(
        payout.provider_payout_id || "not recorded",
      )}</p><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p><a href="${escapeHtml(
        context.adminReservationUrl,
      )}">Open admin reservation</a></p>`,
    }));
  }

  await settleNotificationTasks(notificationTasks);
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
    notificationTasks.push(sendNotificationOnce({
      admin,
      reservationId: payment.reservation_id,
      type: `HOST_DISPUTE_${phase}_${cleanId}`,
      recipient: context.hostRecipient,
      subject: `${closed ? "Payment dispute closed" : "Payment dispute opened"}: ${context.propertyName}`,
      text: `${closed ? `The payment dispute was closed with status: ${outcome}.` : "A payment dispute was opened and Find A Place is tracking it."}\nAmount: ${amount}\nConfirmation: ${context.reservation.confirmation_code}\nOpen reservation: ${context.hostReservationUrl}`,
      html: `<p><strong>${closed ? "Payment dispute closed" : "Payment dispute opened"}</strong></p><p>${escapeHtml(
        closed
          ? `The dispute was closed with status: ${outcome}.`
          : "Find A Place is tracking the dispute and its Stripe status.",
      )}</p><p><strong>Amount:</strong> ${escapeHtml(
        amount,
      )}<br><strong>Confirmation:</strong> ${escapeHtml(
        context.reservation.confirmation_code,
      )}</p><p><a href="${escapeHtml(
        context.hostReservationUrl,
      )}">Open the reservation</a></p>`,
    }));
  }

  notificationTasks.push(sendInternalAlerts({
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
  }));

  await settleNotificationTasks(notificationTasks);
}
