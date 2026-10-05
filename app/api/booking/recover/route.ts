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

function checkoutPath(input: {
  slug: string;
  reservationId: string;
  checkoutToken: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const query = new URLSearchParams({
    stay: input.slug,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: String(input.guests),
    reservationId: input.reservationId,
    checkoutToken: input.checkoutToken,
  });

  return `/checkout?${query.toString()}`;
}

function stayPath(input: {
  slug: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const query = new URLSearchParams({
    checkin: input.checkIn,
    checkout: input.checkOut,
    guests: String(input.guests),
    recovery: "unavailable",
  });

  return `/stays/${encodeURIComponent(input.slug)}?${query.toString()}`;
}

function confirmedPath(input: {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
}) {
  const query = new URLSearchParams({
    reservationId: input.reservationId,
    checkoutToken: input.checkoutToken,
    code: input.confirmationCode,
  });

  return `/booking/confirmed?${query.toString()}`;
}

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

    const { data: reservation, error } = await admin
      .from("reservations")
      .select(
        "id,confirmation_code,status,payment_status,payment_environment,provider_account_ref,unit_id,check_in,check_out,guest_count,hold_expires_at",
      )
      .eq("id", reservationId)
      .maybeSingle();

    if (error || !reservation || reservation.payment_environment !== environment) {
      return NextResponse.json(
        { error: "This checkout could not be found." },
        { status: 404 },
      );
    }

    const { data: unit } = await admin
      .from("property_units")
      .select("slug")
      .eq("id", reservation.unit_id)
      .maybeSingle();

    if (!unit?.slug) {
      return NextResponse.json(
        { error: "This stay is no longer available." },
        { status: 404 },
      );
    }

    if (
      reservation.status === "CONFIRMED" ||
      reservation.payment_status === "SUCCEEDED"
    ) {
      return NextResponse.json({
        ok: true,
        redirectTo: confirmedPath({
          reservationId,
          checkoutToken,
          confirmationCode: reservation.confirmation_code,
        }),
      });
    }

    const checkout = checkoutPath({
      slug: unit.slug,
      reservationId,
      checkoutToken,
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
      guests: reservation.guest_count,
    });

    const activeHold =
      ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(
        reservation.status,
      ) &&
      reservation.hold_expires_at &&
      new Date(reservation.hold_expires_at).getTime() > Date.now();

    if (activeHold) {
      return NextResponse.json({
        ok: true,
        redirectTo: checkout,
        restored: false,
      });
    }

    await closeUnfinishedReservationPayments({
      admin,
      reservationId,
      connectedAccountId: reservation.provider_account_ref,
    });

    const { data: restored, error: restoreError } = await admin.rpc(
      "service_restore_guest_taxed_reservation_hold",
      {
        target_reservation_id: reservationId,
        expected_environment: environment,
      },
    );

    if (restoreError) {
      console.warn("[booking recover] dates unavailable", {
        reservationId,
        message: restoreError.message,
      });

      return NextResponse.json(
        {
          error:
            "Those dates are no longer available. Choose new dates to continue.",
          redirectTo: stayPath({
            slug: unit.slug,
            checkIn: reservation.check_in,
            checkOut: reservation.check_out,
            guests: reservation.guest_count,
          }),
        },
        { status: 409 },
      );
    }

    if (restored?.status === "CONFIRMED") {
      return NextResponse.json({
        ok: true,
        redirectTo: confirmedPath({
          reservationId,
          checkoutToken,
          confirmationCode: reservation.confirmation_code,
        }),
      });
    }

    return NextResponse.json({
      ok: true,
      redirectTo: checkout,
      restored: true,
    });
  } catch (recoveryError) {
    console.error("[booking recover]", recoveryError);

    return NextResponse.json(
      {
        error:
          recoveryError instanceof Error
            ? recoveryError.message
            : "Unable to restore this checkout.",
      },
      { status: 500 },
    );
  }
}
