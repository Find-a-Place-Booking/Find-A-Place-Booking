import Stripe from "stripe";

import { assertStripeKeyModesMatch } from "./booking-runtime";

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

export async function createDirectPaymentIntent(input: {
  amountCents: number;
  currency: string;
  connectedAccountId: string;
  applicationFeeCents: number;
  reservationId: string;
  paymentId: string;
  confirmationCode: string;
  platformCommissionCents: number;
  platformTaxRetainedCents: number;
  commissionRateBps: number;
  paymentEnvironment: "TEST" | "LIVE";
}) {
  const stripe = getStripeClient();

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      ...(input.applicationFeeCents > 0
        ? { application_fee_amount: input.applicationFeeCents }
        : {}),
      metadata: {
        reservation_id: input.reservationId,
        payment_id: input.paymentId,
        confirmation_code: input.confirmationCode,
        platform_commission_cents: String(input.platformCommissionCents),
        platform_tax_retained_cents: String(input.platformTaxRetainedCents),
        commission_rate_bps: String(input.commissionRateBps),
        charge_model: "DIRECT",
        processing_fee_policy: "CONNECTED_ACCOUNT",
        payment_environment: input.paymentEnvironment,
      },
      description: `Find A Place booking ${input.confirmationCode}`,
    },
    {
      stripeAccount: input.connectedAccountId,
      idempotencyKey: `fap-booking-${input.paymentId}`,
    },
  );

  return paymentIntent;
}

export async function createConnectedRefund(input: {
  connectedAccountId?: string;
  paymentIntentId: string;
  refundId: string;
  reservationId: string;
  amountCents: number;
  fullRefund: boolean;
  platformFeeRefundCents: number;
  reason?: string | null;
}) {
  const stripe = getStripeClient();
  if (!input.connectedAccountId) {
    throw new Error("The connected Stripe account is required for a direct-charge refund.");
  }
  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      refund_application_fee: input.fullRefund,
      reason: "requested_by_customer",
      metadata: {
        refund_id: input.refundId,
        reservation_id: input.reservationId,
        refund_policy: input.fullRefund
          ? "FULL_GUEST_100_PERCENT"
          : "PARTIAL_HOST_FUNDED",
        platform_fee_refund_cents: String(input.platformFeeRefundCents),
        charge_model: "DIRECT",
        internal_reason: (input.reason || "").slice(0, 450),
      },
    },
    {
      stripeAccount: input.connectedAccountId,
      idempotencyKey: `fap-refund-${input.refundId}`,
    },
  );

  return { refund, feeReconciliationPending: false };
}

export async function retrievePaymentIntent(
  paymentIntentId: string,
  connectedAccountId: string,
) {
  return getStripeClient().paymentIntents.retrieve(
    paymentIntentId,
    {},
    { stripeAccount: connectedAccountId },
  );
}

export async function retrieveChargeWithBalanceTransaction(
  chargeId: string,
  connectedAccountId: string,
) {
  return getStripeClient().charges.retrieve(
    chargeId,
    { expand: ["balance_transaction"] },
    { stripeAccount: connectedAccountId },
  );
}

export function chargeProcessorFee(charge: Stripe.Charge) {
  const balance = charge.balance_transaction;

  if (balance && typeof balance !== "string") {
    return Math.max(0, Number(balance.fee || 0));
  }

  return 0;
}
