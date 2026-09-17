import { NextRequest, NextResponse } from "next/server";

export function sandboxBookingEnabled() {
  return process.env.BOOKING_SANDBOX_ENABLED === "true";
}

export function requireSandboxBooking() {
  if (!sandboxBookingEnabled()) {
    throw new Error("Sandbox guest booking is disabled.");
  }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function reservationCookieMatches(
  request: NextRequest,
  reservationId: string,
) {
  return (
    request.cookies.get("fap_sandbox_reservation")?.value === reservationId
  );
}

export function setReservationCookie(
  response: NextResponse,
  reservationId: string,
) {
  response.cookies.set("fap_sandbox_reservation", reservationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
}
