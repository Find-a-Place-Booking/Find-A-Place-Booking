import Stripe from "stripe";

import { assertStripeKeyModesMatch, stripeIsTestMode } from "./booking-runtime";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  assertStripeKeyModesMatch();

  stripeClient = new Stripe(key, {
    apiVersion: "2026-07-29.dahlia",
  });

  return stripeClient;
}

export function estimatedHostProcessingRecoveryCents(amountCents: number) {
  assertStripeKeyModesMatch();

  const rateValue = process.env.STRIPE_PROCESSING_RATE_BPS;
  const fixedValue = process.env.STRIPE_PROCESSING_FIXED_CENTS;

  const rateBps =
    rateValue === undefined && stripeIsTestMode() ? 290 : Number(rateValue);
  const fixedCents =
    fixedValue === undefined && stripeIsTestMode() ? 30 : Number(fixedValue);

  if (
    !Number.isFinite(rateBps) ||
    !Number.isFinite(fixedCents) ||
    rateBps < 0 ||
    fixedCents < 0
  ) {
    throw new Error(
      "STRIPE_PROCESSING_RATE_BPS and STRIPE_PROCESSING_FIXED_CENTS must be configured before live checkout.",
    );
  }

  return Math.max(
    0,
    Math.round((amountCents * rateBps) / 10000) + Math.round(fixedCents),
  );
}

export async function createDestinationPaymentIntent(input: {
  amountCents: number;
  currency: string;
  connectedAccountId: string;
  applicationFeeCents: number;
  reservationId: string;
  paymentId: string;
  confirmationCode: string;
  platformCommissionCents: number;
  processorFeeRecoveryCents: number;
  commissionRateBps: number;
  paymentEnvironment: "TEST" | "LIVE";
}) {
  const stripe = getStripeClient();

  return stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      application_fee_amount: input.applicationFeeCents,
      transfer_data: {
        destination: input.connectedAccountId,
      },
      metadata: {
        reservation_id: input.reservationId,
        payment_id: input.paymentId,
        confirmation_code: input.confirmationCode,
        platform_commission_cents: String(input.platformCommissionCents),
        processor_fee_recovery_cents: String(input.processorFeeRecoveryCents),
        commission_rate_bps: String(input.commissionRateBps),
        processing_fee_policy: "HOST_FULL",
        payment_environment: input.paymentEnvironment,
      },
      description: `Find A Place booking ${input.confirmationCode}`,
    },
    {
      idempotencyKey: `fap-booking-${input.paymentId}`,
    },
  );
}

export async function createConnectedRefund(input: {
  paymentIntentId: string;
  refundId: string;
  reservationId: string;
  amountCents: number;
  fullRefund: boolean;
  platformFeeRefundCents: number;
  reason?: string | null;
}) {
  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      reverse_transfer: true,
      refund_application_fee: input.fullRefund,
      reason: "requested_by_customer",
      metadata: {
        refund_id: input.refundId,
        reservation_id: input.reservationId,
        refund_policy: input.fullRefund
          ? "FULL_GUEST_100_PERCENT"
          : "PARTIAL_HOST_FUNDED",
        internal_reason: (input.reason || "").slice(0, 450),
      },
    },
    { idempotencyKey: `fap-refund-${input.refundId}` },
  );

  let feeReconciliationPending = false;
  if (input.fullRefund && input.platformFeeRefundCents > 0) {
    try {
      await ensureFullRefundApplicationFee({
        paymentIntentId: input.paymentIntentId,
        refundId: input.refundId,
        reservationId: input.reservationId,
        platformFeeRefundCents: input.platformFeeRefundCents,
      });
    } catch (error) {
      feeReconciliationPending = true;
      console.error("[Stripe full refund] application-fee reconciliation pending", error);
    }
  }

  return { refund, feeReconciliationPending };
}

export async function ensureFullRefundApplicationFee(input: {
  paymentIntentId: string;
  refundId: string;
  reservationId: string;
  platformFeeRefundCents: number;
}) {
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId, {
    expand: ["latest_charge.application_fee"],
  });
  const charge = typeof intent.latest_charge === "string"
    ? await stripe.charges.retrieve(intent.latest_charge, {
        expand: ["application_fee"],
      })
    : intent.latest_charge;
  const applicationFeeRef = charge?.application_fee ?? null;
  const applicationFee = typeof applicationFeeRef === "string"
    ? await stripe.applicationFees.retrieve(applicationFeeRef)
    : applicationFeeRef;

  if (!applicationFee) {
    throw new Error("The Stripe application fee could not be found for the full refund.");
  }

  const remainingFeeCents = Math.max(
    0,
    applicationFee.amount - applicationFee.amount_refunded,
  );
  const feeRefundCents = Math.min(
    input.platformFeeRefundCents,
    remainingFeeCents,
  );

  if (feeRefundCents > 0) {
    await stripe.applicationFees.createRefund(
      applicationFee.id,
      {
        amount: feeRefundCents,
        metadata: {
          refund_id: input.refundId,
          reservation_id: input.reservationId,
          refund_policy: "FULL_GUEST_100_PERCENT",
        },
      },
      { idempotencyKey: `fap-application-fee-refund-${input.refundId}` },
    );
  }
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return getStripeClient().paymentIntents.retrieve(paymentIntentId);
}

export async function retrieveChargeWithBalanceTransaction(chargeId: string) {
  return getStripeClient().charges.retrieve(chargeId, {
    expand: ["balance_transaction"],
  });
}

export function chargeProcessorFee(charge: Stripe.Charge) {
  const balance = charge.balance_transaction;

  if (balance && typeof balance !== "string") {
    return Math.max(0, Number(balance.fee || 0));
  }

  return 0;
}
