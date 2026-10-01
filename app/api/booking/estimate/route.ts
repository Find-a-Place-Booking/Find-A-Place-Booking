import { NextRequest, NextResponse } from "next/server";

import {
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
      addOnIds?: string[];
      promotionCode?: string | null;
    };

    const guests = Number(body.guests || 1);
    const pets = Number(body.pets || 0);
    const addOnIds = Array.isArray(body.addOnIds) ? body.addOnIds : [];

    if (!body.unitId || !body.checkIn || !body.checkOut) {
      return NextResponse.json(
        { error: "Choose check-in and checkout dates first." },
        { status: 400 },
      );
    }

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
    const { data, error } = await admin.rpc(
      "quote_guest_checkout_estimate",
      {
        target_unit_id: body.unitId,
        check_in_date: body.checkIn,
        check_out_date: body.checkOut,
        guest_count: guests,
        pet_count: pets,
        selected_add_on_ids: addOnIds,
        promotion_code: body.promotionCode?.trim() || null,
      },
    );

    if (error) {
      return NextResponse.json(
        {
          error: guestFacingBookingError(
            error.message,
            "Unable to update the price estimate right now.",
          ),
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const result = data as {
      quote?: unknown;
      tax_total_cents?: number;
      guest_total_cents?: number;
      collection_mode?: string;
      tax_lines?: unknown;
    };

    return NextResponse.json(
      {
        quote: result.quote ?? null,
        taxTotalCents: Number(result.tax_total_cents || 0),
        guestTotalCents: Number(result.guest_total_cents || 0),
        collectionMode: result.collection_mode || "HOST_SELF_REMIT",
        taxLines: result.tax_lines ?? [],
        estimateOnly: true,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: guestFacingBookingError(
          error,
          "Unable to update the price estimate right now.",
        ),
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
