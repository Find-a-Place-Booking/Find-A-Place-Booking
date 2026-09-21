import { NextRequest, NextResponse } from "next/server";

import { taxLinesFromSnapshot } from "@/lib/bookings/financial-display";
import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const reservationId =
      request.nextUrl.searchParams.get("reservationId")?.trim();
    const checkoutToken =
      request.nextUrl.searchParams.get("checkoutToken")?.trim();

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
        "id,property_id,confirmation_code,status,payment_status,hold_expires_at,check_in,check_out,guest_name,guest_count,pricing_snapshot,pre_tax_total_cents,guest_total_cents,platform_commission_cents,tax_total_cents,tax_status,tax_snapshot,currency",
      )
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) {
      console.error("[booking status] reservation lookup failed", {
        reservationId,
        code: reservationError.code,
        message: reservationError.message,
        details: reservationError.details,
        hint: reservationError.hint,
      });

      return NextResponse.json(
        { error: "Unable to load reservation status." },
        { status: 500 },
      );
    }

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    let propertyName: string | null = null;

    if (reservation.property_id) {
      const { data: property, error: propertyError } = await admin
        .from("properties")
        .select("name")
        .eq("id", reservation.property_id)
        .maybeSingle();

      if (propertyError) {
        console.error("[booking status] property lookup failed", {
          reservationId,
          propertyId: reservation.property_id,
          code: propertyError.code,
          message: propertyError.message,
          details: propertyError.details,
          hint: propertyError.hint,
        });
      } else {
        propertyName = property?.name ?? null;
      }
    }

    return NextResponse.json({
      reservationId: reservation.id,
      confirmationCode: reservation.confirmation_code,
      status: reservation.status,
      paymentStatus: reservation.payment_status,
      holdExpiresAt: reservation.hold_expires_at,
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
      guestName: reservation.guest_name,
      guestCount: reservation.guest_count,
      pricingSnapshot: reservation.pricing_snapshot ?? {},
      preTaxTotalCents: Number(reservation.pre_tax_total_cents),
      guestTotalCents: Number(reservation.guest_total_cents),
      platformCommissionCents: Number(
        reservation.platform_commission_cents,
      ),
      taxTotalCents: Number(reservation.tax_total_cents),
      taxStatus: reservation.tax_status,
      taxLines: taxLinesFromSnapshot(reservation.tax_snapshot),
      currency: reservation.currency,
      propertyName,
    });
  } catch (error) {
    console.error("[booking status] unexpected error", error);

    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to load this booking. Refresh and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
