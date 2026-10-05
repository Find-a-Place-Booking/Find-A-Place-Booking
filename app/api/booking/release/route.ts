import { NextRequest, NextResponse } from "next/server";

import { closeUnfinishedReservationPayments } from "@/lib/bookings/checkout-recovery";
import {
  guestCheckoutTokenMatches,
  sameOrigin,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    reservationId?: string;
    checkoutToken?: string;
  } | null;

  const reservationId = body?.reservationId?.trim() || "";
  const checkoutToken = body?.checkoutToken?.trim() || "";

  if (
    !UUID_RE.test(reservationId) ||
    !guestCheckoutTokenMatches(reservationId, checkoutToken)
  ) {
    return NextResponse.json({ error: "Invalid checkout." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const environment = stripeEnvironment();

    const { data: reservation, error: reservationError } = await admin
      .from("reservations")
      .select(
        "id,status,payment_status,payment_environment,provider_account_ref",
      )
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (reservation.payment_environment !== environment) {
      return NextResponse.json({ error: "Reservation is unavailable." }, { status: 409 });
    }

    if (
      reservation.status === "CONFIRMED" ||
      reservation.payment_status === "SUCCEEDED" ||
      reservation.payment_status === "PROCESSING"
    ) {
      return NextResponse.json(
        { error: "This reservation is already paid or processing." },
        { status: 409 },
      );
    }

    await closeUnfinishedReservationPayments({
      admin,
      reservationId,
      connectedAccountId: reservation.provider_account_ref,
    });

    const { data, error } = await admin.rpc(
      "service_release_guest_reservation_hold",
      {
        target_reservation_id: reservationId,
        expected_environment: environment,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      { ok: true, reservation: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[booking release]", error);
    const message =
      error instanceof Error ? error.message : "Unable to release checkout.";

    return NextResponse.json(
      { error: message },
      {
        status: /processing|paid/i.test(message) ? 409 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
