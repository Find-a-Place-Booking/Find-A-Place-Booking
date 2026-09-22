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
  chargeId?: string | null;
  refundId: string;
  reservationId: string;
  amountCents: number;
  fullRefund: boolean;
  platformFeeRefundCents: number;
  reason?: string | null;
}) {
  const stripe = getStripeClient();

  if (!input.connectedAccountId) {
    throw new Error(
      "The connected Stripe account is required for a direct-charge refund.",
    );
  }

  // For direct charges the guest refund belongs to the connected account.
  // Do NOT use refund_application_fee here because that would refund the entire
  // application fee. Find A Place sometimes needs to return only the tax
  // portion while keeping the platform commission inside the 14-day window.
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
          ? "FULL_GUEST_REFUND"
          : "PARTIAL_HOST_FUNDED",
        intended_application_fee_refund_cents: String(
          input.platformFeeRefundCents,
        ),
        charge_model: "DIRECT",
        internal_reason: (input.reason || "").slice(0, 450),
      },
    },
    {
      stripeAccount: input.connectedAccountId,
      idempotencyKey: `fap-refund-${input.refundId}`,
    },
  );

  let applicationFeeRefundStatus:
    | "NOT_REQUIRED"
    | "PENDING"
    | "SUCCEEDED"
    | "FAILED" =
    input.platformFeeRefundCents > 0 ? "PENDING" : "NOT_REQUIRED";
  let applicationFeeRefundId: string | null = null;
  let applicationFeeRefundError: string | null = null;

  // A partial Application Fee Refund lets us return exactly the amount that
  // should go back to the host: tax only inside 14 days, or tax + commission
  // when the cancellation is 14+ calendar days before check-in.
  if (input.platformFeeRefundCents > 0 && refund.status === "succeeded") {
    try {
      let chargeId = input.chargeId || null;

      if (!chargeId) {
        const intent = await stripe.paymentIntents.retrieve(
          input.paymentIntentId,
          { expand: ["latest_charge"] },
          { stripeAccount: input.connectedAccountId },
        );

        chargeId =
          typeof intent.latest_charge === "string"
            ? intent.latest_charge
            : intent.latest_charge?.id || null;
      }

      if (!chargeId) {
        throw new Error(
          "Stripe charge reference is missing for application-fee refund.",
        );
      }

      const charge = await stripe.charges.retrieve(
        chargeId,
        { expand: ["application_fee"] },
        { stripeAccount: input.connectedAccountId },
      );

      const applicationFeeId =
        typeof charge.application_fee === "string"
          ? charge.application_fee
          : charge.application_fee?.id || null;

      if (!applicationFeeId) {
        throw new Error(
          "Stripe application fee could not be resolved for this charge.",
        );
      }

      const feeRefund = await stripe.applicationFees.createRefund(
        applicationFeeId,
        {
          amount: input.platformFeeRefundCents,
          metadata: {
            refund_id: input.refundId,
            reservation_id: input.reservationId,
            policy: "FAP_14_DAY_COMMISSION_POLICY",
          },
        },
        {
          idempotencyKey: `fap-application-fee-refund-${input.refundId}`,
        },
      );

      applicationFeeRefundStatus = "SUCCEEDED";
      applicationFeeRefundId = feeRefund.id;
    } catch (error) {
      applicationFeeRefundStatus = "FAILED";
      applicationFeeRefundError =
        error instanceof Error
          ? error.message
          : "Application-fee refund needs manual reconciliation.";

      console.error(
        "[createConnectedRefund] guest refund succeeded but application-fee refund needs reconciliation",
        input.refundId,
        error,
      );
    }
  } else if (input.platformFeeRefundCents > 0) {
    applicationFeeRefundError =
      "Guest refund has not succeeded yet; application-fee refund was not submitted.";
  }

  return {
    refund,
    applicationFeeRefundStatus,
    applicationFeeRefundId,
    applicationFeeRefundError,
    // Backward-compatible field for the existing admin refund route.
    // The new host cancellation flow reads the detailed status fields above.
    feeReconciliationPending:
      applicationFeeRefundStatus === "PENDING" ||
      applicationFeeRefundStatus === "FAILED",
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
