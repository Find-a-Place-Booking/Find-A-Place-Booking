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
      },
      description: `Find A Place booking ${input.confirmationCode}`,
    },
    {
      idempotencyKey: `fap-booking-${input.paymentId}`,
    },
  );
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
