import { NextRequest, NextResponse } from "next/server";

import {
  canonicalIdentityStatus,
  syncIdentityVerification,
} from "@/lib/bookings/guest-verification";
import {
  guestCheckoutTokenMatches,
  requireBookingCheckout,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { getStripeClient } from "@/lib/payments/stripe-checkout";
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
        "id,confirmation_code,status,hold_expires_at,guest_email,guest_phone,guest_email_verified_at,stripe_identity_verification_session_id,identity_verification_status,identity_verified_at,identity_verification_attempt_count",
      )
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (!reservation.guest_phone?.trim()) {
      return NextResponse.json(
        { error: "A phone number is required before identity verification." },
        { status: 409 },
      );
    }

    const guestEmail = reservation.guest_email?.trim() || "";
    if (!guestEmail || !reservation.guest_email_verified_at) {
      return NextResponse.json(
        { error: "Verify the booking email before identity verification." },
        { status: 409 },
      );
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

    if (reservation.stripe_identity_verification_session_id) {
      const synced = await syncIdentityVerification(admin, reservation);

      if (synced.status === "VERIFIED") {
        return NextResponse.json({
          verified: true,
          status: synced.status,
        });
      }

      if (synced.status === "PROCESSING") {
        return NextResponse.json({
          verified: false,
          status: synced.status,
          processing: true,
        });
      }

      if (synced.status === "REQUIRES_INPUT" && synced.session?.client_secret) {
        return NextResponse.json({
          verified: false,
          status: synced.status,
          clientSecret: synced.session.client_secret,
        });
      }

      if (synced.status !== "CANCELED") {
        return NextResponse.json(
          { error: synced.error || "Identity verification is unavailable." },
          { status: 409 },
        );
      }
    }

    const stripe = getStripeClient();
    const nextAttempt = Math.max(1, Number(reservation.identity_verification_attempt_count || 0) + 1);
    const session = await stripe.identity.verificationSessions.create(
      {
        type: "document",
        client_reference_id: reservationId,
        provided_details: {
          email: guestEmail,
        },
        options: {
          document: {
            require_matching_selfie: true,
          },
        },
        metadata: {
          reservation_id: reservationId,
          confirmation_code: reservation.confirmation_code,
          purpose: "find_a_place_guest_booking",
        },
      },
      {
        idempotencyKey: `fap-identity-${reservationId}-${nextAttempt}`,
      },
    );

    const status = canonicalIdentityStatus(session.status);
    const now = new Date().toISOString();

    const { error: updateError } = await admin
      .from("reservations")
      .update({
        stripe_identity_verification_session_id: session.id,
        identity_verification_status: status,
        identity_verification_attempt_count: nextAttempt,
        updated_at: now,
      })
      .eq("id", reservationId);

    if (updateError) {
      throw new Error(`Unable to save identity session: ${updateError.message}`);
    }

    if (!session.client_secret) {
      throw new Error("Stripe Identity did not return a client secret.");
    }

    return NextResponse.json({
      verified: status === "VERIFIED",
      status,
      clientSecret: session.client_secret,
    });
  } catch (error) {
    console.error("[guest identity session]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start identity verification.",
      },
      { status: 500 },
    );
  }
}
