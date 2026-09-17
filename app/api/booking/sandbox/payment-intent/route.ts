import { NextRequest, NextResponse } from "next/server";

import {
  requireSandboxBooking,
  sameOrigin,
} from "@/lib/payments/sandbox-booking";
import {
  createSandboxDestinationPaymentIntent,
  retrievePaymentIntent,
  sandboxProcessorFeeEstimate,
} from "@/lib/payments/stripe-guest";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSandboxBooking();

    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const body = (await request.json()) as { reservationId?: string };
    const reservationId = body.reservationId?.trim();

    if (!reservationId) {
      return NextResponse.json(
        { error: "Missing sandbox reservation reference." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: reservation, error: reservationError } = await admin
      .from("reservations")
      .select(
        "id,status,hold_expires_at,payment_status,guest_total_cents,platform_commission_cents,currency,payment_account_id,payment_provider,provider_account_ref",
      )
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (
      !["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(
        reservation.status,
      )
    ) {
      return NextResponse.json(
        { error: `Reservation cannot be paid from status ${reservation.status}.` },
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

    const { data: account } = await admin
      .from("payment_accounts")
      .select("id,status,payouts_enabled,provider_account_id")
      .eq("id", reservation.payment_account_id)
      .single();

    if (
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

    const { data: existingPayment } = await admin
      .from("payments")
      .select(
        "id,status,provider_payment_id,amount_cents,application_fee_cents",
      )
      .eq("reservation_id", reservationId)
      .eq("provider", "STRIPE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      existingPayment?.provider_payment_id &&
      !["FAILED", "CANCELLED"].includes(existingPayment.status)
    ) {
      const intent = await retrievePaymentIntent(
        existingPayment.provider_payment_id,
      );

      if (!intent.client_secret) {
        throw new Error("Stripe payment intent is missing a client secret.");
      }

      return NextResponse.json({
        paymentId: existingPayment.id,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret,
        amountCents: Number(existingPayment.amount_cents),
        applicationFeeCents: Number(existingPayment.application_fee_cents),
      });
    }

    const amountCents = Number(reservation.guest_total_cents);
    const commissionCents = Number(reservation.platform_commission_cents);
    const processorEstimateCents = sandboxProcessorFeeEstimate(amountCents);
    const applicationFeeCents = Math.min(
      amountCents,
      commissionCents + processorEstimateCents,
    );

    const idempotencyKey = `sandbox-reservation-${reservationId}-${Date.now()}`;

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .insert({
        reservation_id: reservationId,
        payment_account_id: reservation.payment_account_id,
        provider: "STRIPE",
        status: "NOT_STARTED",
        idempotency_key: idempotencyKey,
        amount_cents: amountCents,
        application_fee_cents: applicationFeeCents,
        processor_fee_host_share_cents: processorEstimateCents,
        processor_fee_platform_share_cents: 0,
        processing_fee_credit_cents: 0,
        host_proceeds_cents: Math.max(0, amountCents - applicationFeeCents),
        currency: reservation.currency,
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      throw new Error(
        `Unable to create payment record: ${
          paymentError?.message || "Unknown database error"
        }`,
      );
    }

    const intent = await createSandboxDestinationPaymentIntent({
      amountCents,
      currency: reservation.currency,
      connectedAccountId: account.provider_account_id,
      applicationFeeCents,
      reservationId,
      paymentId: payment.id,
    });

    if (!intent.client_secret) {
      throw new Error("Stripe payment intent is missing a client secret.");
    }

    const extendedHold = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    await admin
      .from("payments")
      .update({
        status: "REQUIRES_ACTION",
        provider_payment_id: intent.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    await admin
      .from("reservations")
      .update({
        status: "PAYMENT_PENDING",
        payment_status: "REQUIRES_ACTION",
        hold_expires_at: extendedHold,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reservationId);

    await admin
      .from("availability_blocks")
      .update({
        expires_at: extendedHold,
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", reservationId)
      .eq("state", "ACTIVE")
      .eq("block_type", "INTERNAL_HOLD");

    return NextResponse.json({
      paymentId: payment.id,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amountCents,
      applicationFeeCents,
      processorEstimateCents,
      hostProceedsCents: Math.max(0, amountCents - applicationFeeCents),
    });
  } catch (error) {
    console.error("[sandbox payment-intent]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start Stripe sandbox payment.",
      },
      { status: 500 },
    );
  }
}
