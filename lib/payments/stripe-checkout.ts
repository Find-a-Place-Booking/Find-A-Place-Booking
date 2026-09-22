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
  guestTaxCents: number;
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
        guest_tax_cents: String(input.guestTaxCents),
        tax_settlement: "HOST_CONNECTED_ACCOUNT",
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
  chargeId?: string | null;
  refundId: string;
  reservationId: string;
  amountCents: number;
  fullRefund: boolean;
  platformFeeRefundCents: number;
  reason?: string | null;
}): Promise<{
  refund: Stripe.Refund;
  applicationFeeRefundStatus:
    | "NOT_REQUIRED"
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED";
  applicationFeeRefundId: string | null;
  applicationFeeRefundError: string | null;
  feeReconciliationPending: boolean;
}> {
  const stripe = getStripeClient();

  if (!input.connectedAccountId) {
    throw new Error(
      "The connected Stripe account is required for a direct-charge refund.",
    );
  }

  // Find A Place's application fee is earned and non-refundable once the
  // booking is paid. Guest refunds are created only against the host-owned
  // connected-account charge. Taxes are already part of that host charge.
  if (Number(input.platformFeeRefundCents || 0) !== 0) {
    throw new Error(
      "Platform commission refunds are disabled by Find A Place policy.",
    );
  }

  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
      refund_application_fee: false,
      reason: "requested_by_customer",
      metadata: {
        refund_id: input.refundId,
        reservation_id: input.reservationId,
        refund_policy: input.fullRefund
          ? "FULL_GUEST_REFUND_HOST_FUNDED"
          : "PARTIAL_GUEST_REFUND_HOST_FUNDED",
        platform_commission_refund_cents: "0",
        platform_commission_policy: "NON_REFUNDABLE",
        charge_model: "DIRECT",
        internal_reason: (input.reason || "").slice(0, 450),
      },
    },
    {
      stripeAccount: input.connectedAccountId,
      idempotencyKey: `fap-refund-${input.refundId}`,
    },
  );

  return {
    refund,
    applicationFeeRefundStatus: "NOT_REQUIRED" as const,
    applicationFeeRefundId: null,
    applicationFeeRefundError: null,
    feeReconciliationPending: false,
  };
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

// Pending guest refunds can succeed asynchronously. The refund webhook uses
// this same idempotency key to return the tax/eligible commission to the host.
export async function reconcileApplicationFeeRefund(_input: {
  connectedAccountId: string;
  paymentIntentId: string;
  chargeId?: string | null;
  refundId: string;
  reservationId: string;
  amountCents: number;
}): Promise<{ id: string }> {
  throw new Error(
    "Find A Place platform commission is non-refundable; application-fee refunds are disabled.",
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
