import { NextRequest, NextResponse } from "next/server";

import {
  requireSandboxBooking,
  sameOrigin,
} from "@/lib/payments/sandbox-booking";
import {
  chargeProcessorFee,
  retrieveChargeWithBalanceTransaction,
  retrievePaymentIntent,
} from "@/lib/payments/stripe-guest";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSandboxBooking();

    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
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
      .select("id,status,payment_status,confirmation_code")
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json(
        { error: "Sandbox reservation not found." },
        { status: 404 },
      );
    }

    if (
      reservation.status === "CONFIRMED" &&
      reservation.payment_status === "SUCCEEDED"
    ) {
      return NextResponse.json({
        status: "CONFIRMED",
        reservationId,
        confirmationCode: reservation.confirmation_code,
        alreadyConfirmed: true,
      });
    }

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id,provider_payment_id,status")
      .eq("reservation_id", reservationId)
      .eq("provider", "STRIPE")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (paymentError || !payment?.provider_payment_id) {
      return NextResponse.json(
        { error: "Stripe payment record not found." },
        { status: 404 },
      );
    }

    const intent = await retrievePaymentIntent(payment.provider_payment_id);

    if (
      intent.metadata?.reservation_id !== reservationId ||
      intent.metadata?.payment_id !== payment.id
    ) {
      return NextResponse.json(
        { error: "Stripe payment does not match this reservation." },
        { status: 409 },
      );
    }

    if (intent.status !== "succeeded") {
      return NextResponse.json(
        {
          error: `Stripe payment is ${intent.status}, not succeeded.`,
          stripeStatus: intent.status,
        },
        { status: 409 },
      );
    }

    const chargeId =
      typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : intent.latest_charge?.id;

    let processorFeeActualCents = 0;

    if (chargeId) {
      const charge = await retrieveChargeWithBalanceTransaction(chargeId);
      processorFeeActualCents = chargeProcessorFee(charge);
    }

    const { data, error } = await admin.rpc(
      "confirm_sandbox_reservation_payment",
      {
        target_reservation_id: reservationId,
        target_payment_id: payment.id,
        target_provider_payment_id: intent.id,
        target_provider_charge_id: chargeId || null,
        target_processor_fee_actual_cents: processorFeeActualCents,
      },
    );

    if (error) {
      throw new Error(`Unable to confirm reservation: ${error.message}`);
    }

    return NextResponse.json({
      ...data,
      confirmationCode: reservation.confirmation_code,
    });
  } catch (error) {
    console.error("[sandbox finalize]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to finalize sandbox booking.",
      },
      { status: 500 },
    );
  }
}
