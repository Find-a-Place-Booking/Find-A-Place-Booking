import { NextRequest, NextResponse } from "next/server";

import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
  sameOrigin,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { createConnectedRefund } from "@/lib/payments/stripe-checkout";
import { sendRefundNotifications } from "@/lib/notifications/operational-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function loadReservation(
  reservationId: string,
  checkoutToken: string | null | undefined,
) {
  if (!guestCheckoutTokenMatches(reservationId, checkoutToken)) return null;

  const admin = createAdminClient();
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,status,payment_status,check_in,check_out,guest_total_cents,currency,payment_environment",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation) return null;
  return { admin, reservation };
}

function cutoffStillOpen(value: string | null | undefined) {
  if (!value) return false;
  const cutoff = new Date(value).getTime();
  return Number.isFinite(cutoff) && Date.now() < cutoff;
}

export async function GET(request: NextRequest) {
  const reservationId =
    request.nextUrl.searchParams.get("reservationId")?.trim() || "";
  const checkoutToken =
    request.nextUrl.searchParams.get("checkoutToken")?.trim() || "";

  if (!reservationId) {
    return NextResponse.json({ error: "Reservation is required." }, { status: 400 });
  }

  const loaded = await loadReservation(reservationId, checkoutToken);
  if (!loaded) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  const { admin, reservation } = loaded;
  const [{ data: payout }, { data: refundActivity }] = await Promise.all([
    admin
      .from("reservation_payouts")
      .select(
        "status,payout_eligible_date,payout_eligible_at,cancellation_cutoff_date,cancellation_cutoff_at,payment_environment",
      )
      .eq("reservation_id", reservationId)
      .eq("payment_environment", reservation.payment_environment)
      .maybeSingle(),
    admin
      .from("refunds")
      .select("id,status,amount_cents")
      .eq("reservation_id", reservationId)
      .eq("payment_environment", reservation.payment_environment)
      .in("status", ["PENDING", "SUCCEEDED"])
      .limit(1),
  ]);

  const hasRefundActivity = (refundActivity ?? []).length > 0;
  const scheduleAvailable = Boolean(
    payout?.cancellation_cutoff_date && payout?.cancellation_cutoff_at,
  );
  const canCancel =
    scheduleAvailable &&
    reservation.status === "CONFIRMED" &&
    cutoffStillOpen(payout?.cancellation_cutoff_at) &&
    !hasRefundActivity &&
    !["CREATING", "PENDING", "IN_TRANSIT", "PAID"].includes(
      payout?.status || "",
    );

  const cutoffDate = payout?.cancellation_cutoff_date ?? null;

  return NextResponse.json({
    reservationId,
    confirmationCode: reservation.confirmation_code,
    reservationStatus: reservation.status,
    paymentStatus: reservation.payment_status,
    checkIn: reservation.check_in,
    cancellationCutoffDate: cutoffDate,
    cancellationCutoffAt: payout?.cancellation_cutoff_at ?? null,
    payoutEligibleDate: payout?.payout_eligible_date ?? null,
    payoutEligibleAt: payout?.payout_eligible_at ?? null,
    payoutStatus: payout?.status ?? null,
    canCancel,
    refundAmountCents: canCancel ? Number(reservation.guest_total_cents) : 0,
    currency: reservation.currency,
    policy: !scheduleAvailable
      ? "The cancellation schedule is temporarily unavailable. Contact Find A Place support before making a cancellation change."
      : canCancel
        ? `Cancel before ${cutoffDate} for a full refund. Beginning ${cutoffDate}, the normal booking is non-refundable.`
        : reservation.status === "CANCELLED"
          ? "This reservation has been cancelled."
          : hasRefundActivity
            ? "This reservation already has refund activity. Contact Find A Place support for any further cancellation changes."
            : `The normal cancellation window closed on ${cutoffDate}.`,
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const body = (await request.json()) as {
      reservationId?: string;
      checkoutToken?: string;
    };
    const reservationId = body.reservationId?.trim() || "";
    const checkoutToken = body.checkoutToken?.trim() || "";

    if (!reservationId) {
      return NextResponse.json({ error: "Reservation is required." }, { status: 400 });
    }

    const loaded = await loadReservation(reservationId, checkoutToken);
    if (!loaded) {
      return NextResponse.json(
        { error: "Booking access could not be verified." },
        { status: 403 },
      );
    }

    const { admin, reservation } = loaded;

    if (reservation.status === "CANCELLED") {
      return NextResponse.json({
        ok: true,
        alreadyCancelled: true,
        confirmationCode: reservation.confirmation_code,
      });
    }

    if (reservation.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Only confirmed reservations can be cancelled here." },
        { status: 409 },
      );
    }

    const { data: payout } = await admin
      .from("reservation_payouts")
      .select(
        "id,status,cancellation_cutoff_date,cancellation_cutoff_at,payment_environment",
      )
      .eq("reservation_id", reservationId)
      .eq("payment_environment", reservation.payment_environment)
      .maybeSingle();

    if (!payout?.cancellation_cutoff_at || !payout.cancellation_cutoff_date) {
      return NextResponse.json(
        {
          error:
            "The cancellation schedule is unavailable. Contact Find A Place support before making a cancellation change.",
        },
        { status: 409 },
      );
    }

    if (!cutoffStillOpen(payout.cancellation_cutoff_at)) {
      return NextResponse.json(
        {
          error: `The normal cancellation window closed on ${payout.cancellation_cutoff_date}. Contact Find A Place support if an exceptional review is needed.`,
        },
        { status: 409 },
      );
    }

    if (["CREATING", "PENDING", "IN_TRANSIT", "PAID"].includes(payout.status)) {
      return NextResponse.json(
        {
          error:
            "This reservation already has a bank payout in progress. Contact Find A Place support before cancelling.",
        },
        { status: 409 },
      );
    }

    const { data: existingRefund } = await admin
      .from("refunds")
      .select("id,status,provider_refund_id,amount_cents")
      .eq("reservation_id", reservationId)
      .eq("payment_environment", reservation.payment_environment)
      .in("status", ["PENDING", "SUCCEEDED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRefund) {
      return NextResponse.json(
        {
          error:
            "This reservation already has refund activity. Contact Find A Place support before making another cancellation or refund change.",
        },
        { status: 409 },
      );
    }

    const { data, error } = await admin.rpc("create_refund_request", {
      target_reservation_id: reservationId,
      requested_amount_cents: 0,
      requested_full_refund: true,
      requested_reason: "Guest self-service cancellation before the 14-day cutoff.",
    });

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "The cancellation refund could not be prepared." },
        { status: 409 },
      );
    }

    const refundRequest = data as {
      refund_id: string;
      payment_id: string;
      provider_payment_id: string | null;
      amount_cents: number;
      platform_fee_refund_cents: number;
      is_full_refund: boolean;
      payment_environment: "TEST" | "LIVE";
    };

    if (refundRequest.payment_environment !== stripeEnvironment()) {
      await admin.rpc("record_refund_result", {
        target_refund_id: refundRequest.refund_id,
        target_provider_refund_id: null,
        target_status: "FAILED",
        target_failure_message: "Refund environment did not match the active Stripe keys.",
      });
      return NextResponse.json(
        { error: "The refund belongs to a different Stripe environment." },
        { status: 409 },
      );
    }

    if (!refundRequest.provider_payment_id) {
      await admin.rpc("record_refund_result", {
        target_refund_id: refundRequest.refund_id,
        target_provider_refund_id: null,
        target_status: "FAILED",
        target_failure_message: "The Stripe payment reference is missing.",
      });
      return NextResponse.json(
        { error: "The Stripe payment reference is missing." },
        { status: 409 },
      );
    }

    try {
      const { refund, feeReconciliationPending } = await createConnectedRefund({
        paymentIntentId: refundRequest.provider_payment_id,
        refundId: refundRequest.refund_id,
        reservationId,
        amountCents: Number(refundRequest.amount_cents),
        fullRefund: true,
        platformFeeRefundCents: Number(refundRequest.platform_fee_refund_cents),
        reason: "Guest cancellation before platform cutoff",
      });

      const recordedStatus = feeReconciliationPending
        ? "PENDING"
        : refund.status === "succeeded"
          ? "SUCCEEDED"
          : refund.status === "failed"
            ? "FAILED"
            : refund.status === "canceled"
              ? "CANCELLED"
              : "PENDING";

      const { error: recordError } = await admin.rpc("record_refund_result", {
        target_refund_id: refundRequest.refund_id,
        target_provider_refund_id: refund.id,
        target_status: recordedStatus,
        target_failure_message: refund.failure_reason || null,
      });
      if (recordError) throw new Error(recordError.message);

      await admin.from("reservation_events").insert({
        reservation_id: reservationId,
        event_type: "GUEST_CANCELLATION_REQUESTED",
        metadata: {
          source: "guest_trip",
          cancellation_cutoff_date: payout.cancellation_cutoff_date,
          cancellation_cutoff_at: payout.cancellation_cutoff_at,
          refund_id: refundRequest.refund_id,
          refund_status: recordedStatus,
        },
      });

      try {
        await sendRefundNotifications(admin, refundRequest.refund_id);
      } catch (notificationError) {
        console.error(
          "[guest cancellation] refund recorded but notification delivery failed",
          refundRequest.refund_id,
          notificationError,
        );
      }

      return NextResponse.json({
        ok: recordedStatus === "SUCCEEDED",
        pending: recordedStatus === "PENDING",
        confirmationCode: reservation.confirmation_code,
        refundStatus: recordedStatus,
        refundAmountCents: Number(refundRequest.amount_cents),
        currency: reservation.currency,
      });
    } catch (refundError) {
      await admin.rpc("record_refund_result", {
        target_refund_id: refundRequest.refund_id,
        target_provider_refund_id: null,
        target_status: "PENDING",
        target_failure_message:
          refundError instanceof Error
            ? refundError.message
            : "Stripe refund result is pending reconciliation.",
      });

      try {
        await sendRefundNotifications(admin, refundRequest.refund_id);
      } catch (notificationError) {
        console.error(
          "[guest cancellation] pending refund notification failed",
          refundRequest.refund_id,
          notificationError,
        );
      }

      return NextResponse.json(
        {
          error:
            "The cancellation refund is pending reconciliation. Do not submit it again; refresh shortly or contact support.",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("[guest cancellation]", error);
    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Cancellation could not be completed. Refresh the trip and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
