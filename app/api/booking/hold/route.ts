import { NextRequest, NextResponse } from "next/server";

import {
  createGuestCheckoutToken,
  requireBookingCheckout,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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
    };

    if (
      !body.unitId ||
      !body.checkIn ||
      !body.checkOut ||
      !body.guestName ||
      !body.guestEmail
    ) {
      return NextResponse.json(
        { error: "Missing required booking information." },
        { status: 400 },
      );
    }

    const guests = Number(body.guests || 1);
    const pets = Number(body.pets || 0);
    const addOnIds = Array.isArray(body.addOnIds) ? body.addOnIds : [];

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

    const admin = createAdminClient();

    const { data, error } = await admin.rpc("create_guest_reservation_hold", {
      target_unit_id: body.unitId,
      requested_check_in: body.checkIn,
      requested_check_out: body.checkOut,
      requested_guest_count: guests,
      requested_pet_count: pets,
      requested_add_on_ids: addOnIds,
      requested_promotion_code: body.promotionCode?.trim() || null,
      requested_guest_name: body.guestName,
      requested_guest_email: body.guestEmail,
      requested_guest_phone: body.guestPhone || null,
    });

    if (error) {
      console.error("[booking hold] RPC failed", error);
      return NextResponse.json(
        { error: error.message || "Unable to hold those dates." },
        { status: 400 },
      );
    }

    const result = data as {
      reservation_id: string;
      confirmation_code: string;
      hold_expires_at: string;
      guest_total_cents: number;
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
      platformCommissionCents: Number(result.platform_commission_cents),
      commissionRateBps: Number(result.commission_rate_bps),
      quote: result.quote ?? null,
    });
  } catch (error) {
    console.error("[booking hold]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create booking hold.",
      },
      { status: 500 },
    );
  }
}
