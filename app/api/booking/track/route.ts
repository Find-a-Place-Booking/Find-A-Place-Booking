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

function trackedLabel(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.label;
  return typeof value === "string" ? value.trim().slice(0, 350) : "";
}

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
  const requestedStage = body.stage?.trim().toUpperCase() || "";

  if (!EVENT_RE.test(eventName) || !ALLOWED_STAGES.has(requestedStage)) {
    return NextResponse.json(
      { error: "Invalid booking event." },
      { status: 400 },
    );
  }

  // Turnstile telemetry happens before a booking hold exists. Older client
  // builds labeled these events HOLD, which made the funnel look farther along
  // than it really was. Normalize them server-side so cached clients cannot
  // keep polluting the funnel.
  const stage = eventName.startsWith("security_event_")
    ? "CHECKOUT_DETAILS"
    : requestedStage;

  const path =
    request.headers.get("x-fap-page-path") ||
    request.nextUrl.pathname;
  const userAgent = request.headers.get("user-agent");
  const referrer = request.headers.get("referer");

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
    path,
    userAgent,
    referrer,
  });

  // The checkout UI copy changed, but older client tracking still looks for
  // the previous button labels. Derive the important funnel milestones from
  // the generic click event for the current labels. Restrict this to only the
  // new labels so older cached clients that still emit their own milestone
  // events do not double-count.
  if (eventName === "booking_ui_clicked") {
    const label = trackedLabel(body.metadata);

    let derived:
      | { eventName: string; stage: string }
      | null = null;

    if (
      stage === "LISTING" &&
      /^reserve these dates$/i.test(label)
    ) {
      derived = {
        eventName: "checkout_clicked",
        stage: "LISTING",
      };
    } else if (
      stage === "CHECKOUT_DETAILS" &&
      /^reserve these dates$/i.test(label)
    ) {
      derived = {
        eventName: "hold_submit_clicked",
        stage: "HOLD",
      };
    } else if (
      stage === "CHECKOUT_DETAILS" &&
      /^pay .+ & confirm stay$/i.test(label)
    ) {
      derived = {
        eventName: "payment_submit_clicked",
        stage: "PAYMENT",
      };
    }

    if (derived) {
      await recordBookingAttemptEvent({
        attemptId: body.attemptId,
        eventName: derived.eventName,
        stage: derived.stage,
        unitId: body.unitId || null,
        reservationId: body.reservationId || null,
        metadata: {
          source: "server_derived_booking_ui_click",
          label,
        },
        path,
        userAgent,
        referrer,
      });
    }
  }

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
