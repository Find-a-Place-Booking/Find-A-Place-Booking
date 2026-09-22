import { NextRequest, NextResponse } from "next/server";

import {
  createGuestCheckoutToken,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function cleanConfirmation(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 320);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { confirmationCode?: string; email?: string }
    | null;

  const confirmationCode = cleanConfirmation(body?.confirmationCode);
  const email = cleanEmail(body?.email);

  if (!confirmationCode || !email) {
    return NextResponse.json(
      { error: "Enter the reservation number and booking email." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: reservation, error } = await admin
    .from("reservations")
    .select("id,confirmation_code,guest_email,status")
    .eq("confirmation_code", confirmationCode)
    .in("status", ["CONFIRMED", "CANCELLED"])
    .maybeSingle();

  const emailMatches =
    reservation?.guest_email &&
    String(reservation.guest_email).trim().toLowerCase() === email;

  if (error || !reservation || !emailMatches) {
    return NextResponse.json(
      {
        error:
          "We couldn't match that confirmation number and booking email. Check both and try again.",
      },
      { status: 404 },
    );
  }

  const checkoutToken = createGuestCheckoutToken(reservation.id);
  const url = `/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(
    reservation.id,
  )}&checkoutToken=${encodeURIComponent(checkoutToken)}`;

  return NextResponse.json({ ok: true, url });
}
