import { NextRequest, NextResponse } from "next/server";

import { requireSandboxBooking } from "@/lib/payments/sandbox-booking";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    requireSandboxBooking();

    const reservationId = request.nextUrl.searchParams.get("reservationId")?.trim();

    if (!reservationId) {
      return NextResponse.json(
        { error: "Missing sandbox reservation reference." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: reservation, error } = await admin
      .from("reservations")
      .select(
        "id,confirmation_code,status,payment_status,hold_expires_at,check_in,check_out,guest_name,guest_email,guest_count,guest_total_cents,platform_commission_cents,currency,properties(name)",
      )
      .eq("id", reservationId)
      .single();

    if (error || !reservation) {
      return NextResponse.json(
        { error: "Sandbox reservation not found." },
        { status: 404 },
      );
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
      guestEmail: reservation.guest_email,
      guestCount: reservation.guest_count,
      guestTotalCents: Number(reservation.guest_total_cents),
      platformCommissionCents: Number(reservation.platform_commission_cents),
      currency: reservation.currency,
      propertyName:
        Array.isArray(reservation.properties)
          ? reservation.properties[0]?.name
          : (reservation.properties as { name?: string } | null)?.name ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load sandbox booking.",
      },
      { status: 500 },
    );
  }
}
