import { NextRequest, NextResponse } from "next/server";

import { closeUnfinishedReservationPayments } from "@/lib/bookings/checkout-recovery";
import {
  guestCheckoutTokenMatches,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectToStay(
  request: NextRequest,
  slug: string,
  reservation: {
    check_in: string;
    check_out: string;
    guest_count: number;
  },
) {
  const target = new URL(`/stays/${encodeURIComponent(slug)}`, request.url);
  target.searchParams.set("checkin", reservation.check_in);
  target.searchParams.set("checkout", reservation.check_out);
  target.searchParams.set("guests", String(reservation.guest_count));
  target.searchParams.set("recovery", "unavailable");
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const reservationId = request.nextUrl.searchParams.get("reservationId") || "";
  const checkoutToken = request.nextUrl.searchParams.get("checkoutToken") || "";

  if (
    !UUID_RE.test(reservationId) ||
    !guestCheckoutTokenMatches(reservationId, checkoutToken)
  ) {
    return NextResponse.redirect(new URL("/stays", request.url));
  }

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
    return NextResponse.redirect(new URL("/stays", request.url));
  }

  const { data: unit } = await admin
    .from("property_units")
    .select("slug")
    .eq("id", reservation.unit_id)
    .maybeSingle();

  if (!unit?.slug) {
    return NextResponse.redirect(new URL("/stays", request.url));
  }

  const confirmed = new URL("/booking/confirmed", request.url);
  confirmed.searchParams.set("reservationId", reservationId);
  confirmed.searchParams.set("checkoutToken", checkoutToken);
  confirmed.searchParams.set("confirmationCode", reservation.confirmation_code);

  if (
    reservation.status === "CONFIRMED" ||
    reservation.payment_status === "SUCCEEDED"
  ) {
    return NextResponse.redirect(confirmed);
  }

  const checkout = new URL("/checkout", request.url);
  checkout.searchParams.set("stay", unit.slug);
  checkout.searchParams.set("checkIn", reservation.check_in);
  checkout.searchParams.set("checkOut", reservation.check_out);
  checkout.searchParams.set("guests", String(reservation.guest_count));
  checkout.searchParams.set("reservationId", reservationId);
  checkout.searchParams.set("checkoutToken", checkoutToken);

  const holdStillActive =
    ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(reservation.status) &&
    reservation.hold_expires_at &&
    new Date(reservation.hold_expires_at).getTime() > Date.now();

  if (holdStillActive) {
    return NextResponse.redirect(checkout);
  }

  try {
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
      console.warn("[checkout recovery] restore unavailable", {
        reservationId,
        message: restoreError.message,
      });
      return redirectToStay(request, unit.slug, reservation);
    }

    if (restored?.status === "CONFIRMED") {
      return NextResponse.redirect(confirmed);
    }

    return NextResponse.redirect(checkout);
  } catch (recoveryError) {
    console.error("[checkout recovery]", recoveryError);
    return redirectToStay(request, unit.slug, reservation);
  }
}
