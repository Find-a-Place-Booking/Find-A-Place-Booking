import { NextRequest, NextResponse } from "next/server";

import { guestCheckoutTokenMatches } from "@/lib/payments/booking-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * IMPORTANT:
 * This GET route must remain side-effect free.
 *
 * Recovery links in email can be revisited by browser history, link previews,
 * security scanners, or mail clients. A GET request must never place inventory
 * back on hold by itself.
 */
export async function GET(request: NextRequest) {
  const reservationId =
    request.nextUrl.searchParams.get("reservationId")?.trim() || "";
  const checkoutToken =
    request.nextUrl.searchParams.get("checkoutToken")?.trim() || "";

  if (
    !UUID_RE.test(reservationId) ||
    !guestCheckoutTokenMatches(reservationId, checkoutToken)
  ) {
    return NextResponse.redirect(new URL("/stays", request.url));
  }

  const target = new URL("/checkout/resume", request.url);
  target.searchParams.set("reservationId", reservationId);
  target.searchParams.set("checkoutToken", checkoutToken);

  return NextResponse.redirect(target, 303);
}
