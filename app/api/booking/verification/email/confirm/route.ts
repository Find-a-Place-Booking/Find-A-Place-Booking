import { NextRequest, NextResponse } from "next/server";

import {
  guestEmailCodeMatches,
  maskedEmail,
  normalizeGuestEmail,
} from "@/lib/bookings/guest-verification";
import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
  requireBookingCheckout,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 8;

export async function POST(request: NextRequest) {
  try {
    requireBookingCheckout();

    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const body = (await request.json()) as {
      reservationId?: string;
      checkoutToken?: string;
      code?: string;
    };

    const reservationId = body.reservationId?.trim();
    const checkoutToken = body.checkoutToken?.trim();
    const code = body.code?.trim() || "";

    if (
      !reservationId ||
      !guestCheckoutTokenMatches(reservationId, checkoutToken)
    ) {
      return NextResponse.json(
        { error: "Booking access could not be verified." },
        { status: 403 },
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Enter the six-digit verification code." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: reservation, error: reservationError } = await admin
      .from("reservations")
      .select(
        "id,status,hold_expires_at,guest_email,guest_email_verified_at",
      )
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (reservation.guest_email_verified_at) {
      return NextResponse.json({
        verified: true,
        maskedEmail: maskedEmail(reservation.guest_email),
      });
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

    const { data: verification, error: verificationError } = await admin
      .from("guest_email_verifications")
      .select(
        "reservation_id,guest_email,code_hash,expires_at,verified_at,attempt_count",
      )
      .eq("reservation_id", reservationId)
      .maybeSingle();

    if (verificationError || !verification) {
      return NextResponse.json(
        { error: "Send a verification code first." },
        { status: 409 },
      );
    }

    if (verification.verified_at) {
      await admin
        .from("reservations")
        .update({ guest_email_verified_at: verification.verified_at })
        .eq("id", reservationId);

      return NextResponse.json({
        verified: true,
        maskedEmail: maskedEmail(verification.guest_email),
      });
    }

    if (new Date(verification.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "That verification code expired. Send a new code." },
        { status: 410 },
      );
    }

    const attempts = Number(verification.attempt_count ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many incorrect codes. Send a new verification code." },
        { status: 429 },
      );
    }

    const reservationEmail = normalizeGuestEmail(reservation.guest_email);
    const verificationEmail = normalizeGuestEmail(verification.guest_email);

    if (!reservationEmail || reservationEmail !== verificationEmail) {
      return NextResponse.json(
        { error: "The booking email changed. Send a new verification code." },
        { status: 409 },
      );
    }

    const matches = guestEmailCodeMatches({
      reservationId,
      email: reservationEmail,
      code,
      expectedHash: verification.code_hash,
    });

    if (!matches) {
      await admin
        .from("guest_email_verifications")
        .update({
          attempt_count: attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("reservation_id", reservationId);

      return NextResponse.json(
        { error: "That verification code is not correct." },
        { status: 400 },
      );
    }

    const verifiedAt = new Date().toISOString();

    const { error: emailUpdateError } = await admin
      .from("guest_email_verifications")
      .update({
        verified_at: verifiedAt,
        last_error: null,
        updated_at: verifiedAt,
      })
      .eq("reservation_id", reservationId);

    if (emailUpdateError) {
      throw new Error(`Unable to confirm email verification: ${emailUpdateError.message}`);
    }

    const { error: reservationUpdateError } = await admin
      .from("reservations")
      .update({ guest_email_verified_at: verifiedAt, updated_at: verifiedAt })
      .eq("id", reservationId);

    if (reservationUpdateError) {
      throw new Error(
        `Unable to save reservation email verification: ${reservationUpdateError.message}`,
      );
    }

    return NextResponse.json({
      verified: true,
      maskedEmail: maskedEmail(reservationEmail),
    });
  } catch (error) {
    console.error("[guest email verification confirm]", error);
    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to verify the email code. Try again.",
          ),
      },
      { status: 500 },
    );
  }
}
