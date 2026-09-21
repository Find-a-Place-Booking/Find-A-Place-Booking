import { NextRequest, NextResponse } from "next/server";

import {
  createGuestEmailCode,
  guestEmailCodeHash,
  maskedEmail,
  normalizeGuestEmail,
} from "@/lib/bookings/guest-verification";
import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
  requireBookingCheckout,
  sameOrigin,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { sendGuestVerificationCodeEmail } from "@/lib/notifications/guest-verification-email";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const SEND_WINDOW_MS = 30 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;

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
        "id,confirmation_code,status,hold_expires_at,guest_email,guest_email_verified_at",
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
      !["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(
        reservation.status,
      )
    ) {
      return NextResponse.json(
        { error: "This reservation cannot be verified from its current status." },
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

    const email = normalizeGuestEmail(reservation.guest_email);
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid booking email is required." },
        { status: 400 },
      );
    }

    const { data: existing } = await admin
      .from("guest_email_verifications")
      .select(
        "reservation_id,last_sent_at,send_count,window_started_at,verified_at,last_error",
      )
      .eq("reservation_id", reservationId)
      .maybeSingle();

    if (existing?.verified_at) {
      const verifiedAt = existing.verified_at;
      await admin
        .from("reservations")
        .update({ guest_email_verified_at: verifiedAt })
        .eq("id", reservationId)
        .is("guest_email_verified_at", null);

      return NextResponse.json({
        verified: true,
        maskedEmail: maskedEmail(email),
      });
    }

    const now = Date.now();
    const lastSentAt = existing?.last_sent_at
      ? new Date(existing.last_sent_at).getTime()
      : 0;

    if (
      lastSentAt &&
      now - lastSentAt < RESEND_DELAY_MS &&
      !existing?.last_error
    ) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((RESEND_DELAY_MS - (now - lastSentAt)) / 1000),
      );
      return NextResponse.json(
        {
          error: `Wait ${retryAfterSeconds} seconds before sending another code.`,
          retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    let windowStartedAt = existing?.window_started_at
      ? new Date(existing.window_started_at).getTime()
      : now;
    let sendCount = Number(existing?.send_count ?? 0);

    if (!windowStartedAt || now - windowStartedAt >= SEND_WINDOW_MS) {
      windowStartedAt = now;
      sendCount = 0;
    }

    if (sendCount >= MAX_SENDS_PER_WINDOW) {
      return NextResponse.json(
        {
          error:
            "Too many verification codes were requested. Wait a while and try again.",
        },
        { status: 429 },
      );
    }

    const code = createGuestEmailCode();
    const codeHash = guestEmailCodeHash({ reservationId, email, code });
    const sentAtIso = new Date(now).toISOString();
    const expiresAtIso = new Date(now + CODE_TTL_MS).toISOString();

    const { error: upsertError } = await admin
      .from("guest_email_verifications")
      .upsert(
        {
          reservation_id: reservationId,
          guest_email: email,
          code_hash: codeHash,
          expires_at: expiresAtIso,
          last_sent_at: sentAtIso,
          verified_at: null,
          attempt_count: 0,
          send_count: sendCount + 1,
          window_started_at: new Date(windowStartedAt).toISOString(),
          last_error: null,
          updated_at: sentAtIso,
        },
        { onConflict: "reservation_id" },
      );

    if (upsertError) {
      throw new Error(`Unable to save email verification: ${upsertError.message}`);
    }

    let testCode: string | undefined;

    try {
      if (process.env.RESEND_API_KEY?.trim()) {
        await sendGuestVerificationCodeEmail({
          reservationId,
          confirmationCode: reservation.confirmation_code,
          recipient: email,
          code,
        });
      } else if (stripeEnvironment() === "TEST") {
        testCode = code;
        console.warn(
          `[guest email verification] TEST code for ${reservation.confirmation_code}: ${code}`,
        );
      } else {
        throw new Error("RESEND_API_KEY is not configured.");
      }
    } catch (emailError) {
      const message =
        emailError instanceof Error
          ? emailError.message
          : "Verification email could not be sent.";

      await admin
        .from("guest_email_verifications")
        .update({ last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq("reservation_id", reservationId);

      throw emailError;
    }

    return NextResponse.json({
      sent: true,
      verified: false,
      maskedEmail: maskedEmail(email),
      expiresInSeconds: Math.round(CODE_TTL_MS / 1000),
      ...(testCode ? { testCode } : {}),
    });
  } catch (error) {
    console.error("[guest email verification send]", error);
    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to send the verification code. Try again in a moment.",
          ),
      },
      { status: 500 },
    );
  }
}
