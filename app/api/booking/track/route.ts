import { NextRequest, NextResponse } from "next/server";

import {
  recordBookingAttemptEvent,
  validBookingAttemptId,
} from "@/lib/bookings/booking-tracking";
import { sameOrigin } from "@/lib/payments/booking-runtime";

export const runtime = "nodejs";

const EVENT_RE = /^[a-z0-9_.:-]{1,100}$/;
const ALLOWED_STAGES = new Set([
  "LISTING",
  "AVAILABILITY",
  "CHECKOUT_DETAILS",
  "HOLD",
  "VERIFY",
  "POLICIES",
  "PAYMENT",
  "CONFIRMATION",
  "COMPLETE",
]);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    attemptId?: string;
    eventName?: string;
    stage?: string;
    unitId?: string | null;
    reservationId?: string | null;
    success?: boolean | null;
    statusCode?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  } | null;

  if (!body || !validBookingAttemptId(body.attemptId)) {
    return NextResponse.json(
      { error: "Invalid booking attempt." },
      { status: 400 },
    );
  }

  const eventName = body.eventName?.trim().toLowerCase() || "";
  const stage = body.stage?.trim().toUpperCase() || "";

  if (!EVENT_RE.test(eventName) || !ALLOWED_STAGES.has(stage)) {
    return NextResponse.json(
      { error: "Invalid booking event." },
      { status: 400 },
    );
  }

  await recordBookingAttemptEvent({
    attemptId: body.attemptId,
    eventName,
    stage,
    unitId: body.unitId || null,
    reservationId: body.reservationId || null,
    success:
      typeof body.success === "boolean" ? body.success : null,
    statusCode:
      Number.isInteger(body.statusCode)
        ? Number(body.statusCode)
        : null,
    errorCode: body.errorCode || null,
    errorMessage: body.errorMessage || null,
    metadata: body.metadata || {},
    path:
      request.headers.get("x-fap-page-path") ||
      request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
