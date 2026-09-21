import { NextRequest, NextResponse } from "next/server";

import {
  maskedEmail,
  reservationVerificationReadiness,
} from "@/lib/bookings/guest-verification";
import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
  requireBookingCheckout,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireBookingCheckout();

    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
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
        "id,status,hold_expires_at,guest_email,guest_phone,guest_email_verified_at,stripe_identity_verification_session_id,identity_verification_status,identity_verified_at",
      )
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (
      reservation.status !== "CONFIRMED" &&
      reservation.hold_expires_at &&
      new Date(reservation.hold_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: "This booking hold expired. Choose the dates again." },
        { status: 409 },
      );
    }

    const { data: emailVerification } = await admin
      .from("guest_email_verifications")
      .select("last_sent_at,expires_at,verified_at")
      .eq("reservation_id", reservationId)
      .maybeSingle();

    const readiness = await reservationVerificationReadiness(admin, reservation);
    const codeStillActive = Boolean(
      emailVerification?.last_sent_at &&
        emailVerification?.expires_at &&
        new Date(emailVerification.expires_at).getTime() > Date.now() &&
        !emailVerification.verified_at,
    );

    return NextResponse.json({
      ready: readiness.ready,
      phonePresent: readiness.phonePresent,
      emailVerified: readiness.emailVerified,
      emailVerificationSent: codeStillActive,
      maskedEmail: maskedEmail(reservation.guest_email),
      identityVerified: readiness.identityVerified,
      identityStatus: readiness.identityStatus,
      message: readiness.error,
    });
  } catch (error) {
    console.error("[guest verification status]", error);
    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to load guest verification status. Refresh and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
