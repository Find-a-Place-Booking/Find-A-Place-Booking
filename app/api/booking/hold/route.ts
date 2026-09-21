import { NextRequest, NextResponse } from "next/server";

import {
  createGuestCheckoutToken,
  guestFacingBookingError,
  requireBookingCheckout,
  requireLiveCheckoutDependencies,
  sameOrigin,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { refreshUnitCalendarsOrThrow } from "@/lib/calendar/sync-ical";
import { verifyBookingTurnstile } from "@/lib/security/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    requireBookingCheckout();

    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      unitId?: string;
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      pets?: number;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      addOnIds?: string[];
      promotionCode?: string | null;
      turnstileToken?: string | null;
    };

    const guestName = body.guestName?.trim() || "";
    const guestEmail = body.guestEmail?.trim().toLowerCase() || "";
    const guestPhone = body.guestPhone?.trim() || "";

    if (
      !body.unitId ||
      !body.checkIn ||
      !body.checkOut ||
      !guestName ||
      !guestEmail ||
      !guestPhone
    ) {
      return NextResponse.json(
        {
          error:
            "Name, email and phone number are required to start a booking.",
        },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (guestPhone.length < 7 || guestPhone.length > 60) {
      return NextResponse.json(
        { error: "Enter a valid phone number." },
        { status: 400 },
      );
    }

    const guests = Number(body.guests || 1);
    const pets = Number(body.pets || 0);
    const addOnIds = Array.isArray(body.addOnIds) ? body.addOnIds : [];
    const paymentEnvironment = stripeEnvironment();
    requireLiveCheckoutDependencies();

    if (!Number.isInteger(guests) || guests < 1) {
      return NextResponse.json(
        { error: "Invalid guest count." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(pets) || pets < 0) {
      return NextResponse.json(
        { error: "Invalid pet count." },
        { status: 400 },
      );
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const turnstile = await verifyBookingTurnstile({
      token: body.turnstileToken,
      remoteIp: forwardedFor?.split(",")[0]?.trim() || null,
    });

    if (!turnstile.success) {
      return NextResponse.json({ error: turnstile.error }, { status: 403 });
    }

    // Background polling keeps normal availability fresh. Every real booking
    // attempt also refreshes all active inbound feeds immediately and fails
    // closed before the canonical database lock is taken.
    await refreshUnitCalendarsOrThrow(body.unitId);

    const admin = createAdminClient();

    const { data, error } = await admin.rpc(
      "create_guest_taxed_reservation_hold",
      {
        target_unit_id: body.unitId,
        requested_check_in: body.checkIn,
        requested_check_out: body.checkOut,
        requested_guest_count: guests,
        requested_pet_count: pets,
        requested_add_on_ids: addOnIds,
        requested_promotion_code: body.promotionCode?.trim() || null,
        requested_guest_name: guestName,
        requested_guest_email: guestEmail,
        requested_guest_phone: guestPhone,
        requested_payment_environment: paymentEnvironment,
      },
    );

    if (error) {
      console.error("[booking hold] RPC failed", error);
      return NextResponse.json(
        {
          error: guestFacingBookingError(
            error.message,
            "Those dates or booking options could not be held. Refresh availability and try again.",
          ),
        },
        { status: 400 },
      );
    }

    const result = data as {
      reservation_id: string;
      confirmation_code: string;
      hold_expires_at: string;
      guest_total_cents: number;
      tax_total_cents: number;
      tax_status: string;
      platform_tax_retained_cents: number;
      platform_commission_cents: number;
      commission_rate_bps: number;
      quote?: unknown;
    };

    return NextResponse.json({
      reservationId: result.reservation_id,
      checkoutToken: createGuestCheckoutToken(result.reservation_id),
      confirmationCode: result.confirmation_code,
      holdExpiresAt: result.hold_expires_at,
      guestTotalCents: Number(result.guest_total_cents),
      taxTotalCents: Number(result.tax_total_cents || 0),
      taxStatus: result.tax_status || "CALCULATED",
      platformTaxRetainedCents: Number(
        result.platform_tax_retained_cents || 0,
      ),
      platformCommissionCents: Number(result.platform_commission_cents),
      commissionRateBps: Number(result.commission_rate_bps),
      quote: result.quote ?? null,
    });
  } catch (error) {
    console.error("[booking hold]", error);

    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to create the booking hold. Refresh availability and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
