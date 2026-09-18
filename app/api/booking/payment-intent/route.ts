import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  guestCheckoutTokenMatches,
  requireBookingCheckout,
  sameOrigin,
  stripeIsTestMode,
} from "@/lib/payments/booking-runtime";
import {
  createDestinationPaymentIntent,
  estimatedHostProcessingRecoveryCents,
  retrievePaymentIntent,
} from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireBookingCheckout();

    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      reservationId?: string;
      checkoutToken?: string;
    };

    const reservationId = body.reservationId?.trim();
    const checkoutToken = body.checkoutToken?.trim();

    if (
      !reservationId ||
      !guestCheckoutTokenMatches(reservationId, checkoutToken)
    ) {
      return NextResponse.json(
        { error: "Booking access could not be verified." },
        { status: 403 },
      );
    }

    const admin = createAdminClient();

    const { data: reservation, error: reservationError } = await admin
      .from("reservations")
      .select(
        "id,confirmation_code,status,hold_expires_at,payment_status,guest_total_cents,platform_commission_cents,commission_rate_bps,currency,tax_status,payment_account_id,payment_provider,provider_account_ref",
      )
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    if (reservation.status === "CONFIRMED") {
      return NextResponse.json({
        reservationId,
        confirmationCode: reservation.confirmation_code,
        reservationStatus: "CONFIRMED",
        paymentStatus: reservation.payment_status,
      });
    }

    if (
      !["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(
        reservation.status,
      )
    ) {
      return NextResponse.json(
        {
          error: `Reservation cannot be paid from status ${reservation.status}.`,
        },
        { status: 409 },
      );
    }

    if (
      reservation.hold_expires_at &&
      new Date(reservation.hold_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "This booking hold expired. Choose the dates again." },
        { status: 409 },
      );
    }

    // We intentionally allow tax=0 while using Stripe TEST keys so the same
    // production path can be tested end-to-end. Live money is blocked until a
    // tax calculation has been snapshotted onto the reservation.
    if (!stripeIsTestMode() && reservation.tax_status !== "CALCULATED") {
      return NextResponse.json(
        {
          error:
            "Live checkout is blocked until lodging-tax calculation is configured.",
        },
        { status: 409 },
      );
    }

    if (
      reservation.payment_provider !== "STRIPE" ||
      !reservation.payment_account_id ||
      !reservation.provider_account_ref
    ) {
      return NextResponse.json(
        { error: "This stay does not have a ready Stripe payout route." },
        { status: 409 },
      );
    }

    const { data: account, error: accountError } = await admin
      .from("payment_accounts")
      .select("id,status,payouts_enabled,provider_account_id")
      .eq("id", reservation.payment_account_id)
      .single();

    if (
      accountError ||
      !account ||
      account.status !== "READY" ||
      !account.payouts_enabled ||
      !account.provider_account_id
    ) {
      return NextResponse.json(
        { error: "The host payout account is not ready." },
        { status: 409 },
      );
    }

    let { data: payment } = await admin
      .from("payments")
      .select(
        "id,status,provider_payment_id,amount_cents,application_fee_cents,processor_fee_host_share_cents",
      )
      .eq("reservation_id", reservationId)
      .eq("provider", "STRIPE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (payment?.provider_payment_id) {
      const intent = await retrievePaymentIntent(payment.provider_payment_id);

      if (intent.status !== "canceled") {
        return NextResponse.json({
          reservationId,
          confirmationCode: reservation.confirmation_code,
          paymentId: payment.id,
          paymentIntentId: intent.id,
          paymentIntentStatus: intent.status,
          clientSecret: intent.client_secret,
          amountCents: Number(payment.amount_cents),
          applicationFeeCents: Number(payment.application_fee_cents),
          processorFeeRecoveryCents: Number(
            payment.processor_fee_host_share_cents || 0,
          ),
        });
      }

      payment = null;
    }

    const amountCents = Number(reservation.guest_total_cents);
    const commissionCents = Number(reservation.platform_commission_cents);
    const processorFeeRecoveryCents =
      estimatedHostProcessingRecoveryCents(amountCents);

    const applicationFeeCents = Math.min(
      amountCents,
      commissionCents + processorFeeRecoveryCents,
    );

    if (!payment) {
      const { data: createdPayment, error: paymentError } = await admin
        .from("payments")
        .insert({
          reservation_id: reservationId,
          payment_account_id: reservation.payment_account_id,
          provider: "STRIPE",
          status: "NOT_STARTED",
          idempotency_key: `booking-${reservationId}-${randomUUID()}`,
          amount_cents: amountCents,
          application_fee_cents: applicationFeeCents,
          processor_fee_host_share_cents: processorFeeRecoveryCents,
          processor_fee_platform_share_cents: 0,
          processing_fee_credit_cents: 0,
          host_proceeds_cents: Math.max(0, amountCents - applicationFeeCents),
          currency: reservation.currency,
        })
        .select("id,status,provider_payment_id,amount_cents,application_fee_cents,processor_fee_host_share_cents")
        .single();

      if (paymentError || !createdPayment) {
        throw new Error(
          `Unable to create payment record: ${
            paymentError?.message || "Unknown database error"
          }`,
        );
      }

      payment = createdPayment;
    }

    const intent = await createDestinationPaymentIntent({
      amountCents,
      currency: reservation.currency,
      connectedAccountId: account.provider_account_id,
      applicationFeeCents,
      reservationId,
      paymentId: payment.id,
      confirmationCode: reservation.confirmation_code,
      platformCommissionCents: commissionCents,
      processorFeeRecoveryCents,
      commissionRateBps: Number(reservation.commission_rate_bps),
    });

    if (!intent.client_secret) {
      throw new Error("Stripe payment intent is missing a client secret.");
    }

    const extendedHold = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const now = new Date().toISOString();

    await admin
      .from("payments")
      .update({
        status:
          intent.status === "processing" ? "PROCESSING" : "REQUIRES_ACTION",
        provider_payment_id: intent.id,
        updated_at: now,
      })
      .eq("id", payment.id);

    await admin
      .from("reservations")
      .update({
        status: "PAYMENT_PENDING",
        payment_status:
          intent.status === "processing" ? "PROCESSING" : "REQUIRES_ACTION",
        hold_expires_at: extendedHold,
        updated_at: now,
      })
      .eq("id", reservationId);

    await admin
      .from("availability_blocks")
      .update({
        expires_at: extendedHold,
        updated_at: now,
      })
      .eq("reservation_id", reservationId)
      .eq("state", "ACTIVE")
      .eq("block_type", "INTERNAL_HOLD");

    return NextResponse.json({
      reservationId,
      confirmationCode: reservation.confirmation_code,
      paymentId: payment.id,
      paymentIntentId: intent.id,
      paymentIntentStatus: intent.status,
      clientSecret: intent.client_secret,
      amountCents,
      applicationFeeCents,
      platformCommissionCents: commissionCents,
      processorFeeRecoveryCents,
      hostProceedsCents: Math.max(0, amountCents - applicationFeeCents),
    });
  } catch (error) {
    console.error("[booking payment-intent]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start Stripe payment.",
      },
      { status: 500 },
    );
  }
}
