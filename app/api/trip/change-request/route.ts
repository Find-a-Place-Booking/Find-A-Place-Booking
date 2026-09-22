import { NextRequest, NextResponse } from "next/server";

import {
  guestCheckoutTokenMatches,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { sendChangeRequestNotification } from "@/lib/notifications/change-request-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function loadReservation(
  reservationId: string,
  checkoutToken: string | null | undefined,
) {
  if (!guestCheckoutTokenMatches(reservationId, checkoutToken)) return null;

  const admin = createAdminClient();
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,status,check_in,check_out,organization_id,property_id,guest_name,guest_email,guest_phone",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !reservation) return null;
  return { admin, reservation };
}

async function latestRequest(
  admin: ReturnType<typeof createAdminClient>,
  reservationId: string,
) {
  const { data } = await admin
    .from("reservation_change_requests")
    .select(
      "id,status,request_text,host_response,requested_at,responded_at,completed_at,metadata",
    )
    .eq("reservation_id", reservationId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export async function GET(request: NextRequest) {
  const reservationId =
    request.nextUrl.searchParams.get("reservationId")?.trim() || "";
  const checkoutToken =
    request.nextUrl.searchParams.get("checkoutToken")?.trim() || "";

  if (!reservationId) {
    return NextResponse.json({ error: "Reservation is required." }, { status: 400 });
  }

  const loaded = await loadReservation(reservationId, checkoutToken);
  if (!loaded) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  const { admin, reservation } = loaded;
  const requestRow = await latestRequest(admin, reservationId);
  const activeRequest = requestRow?.status === "REQUESTED";

  return NextResponse.json({
    reservationId,
    confirmationCode: reservation.confirmation_code,
    reservationStatus: reservation.status,
    checkIn: reservation.check_in,
    checkOut: reservation.check_out,
    canRequest: reservation.status === "CONFIRMED" && !activeRequest,
    request: requestRow
      ? {
          id: requestRow.id,
          status: requestRow.status,
          requestText: requestRow.request_text,
          hostResponse: requestRow.host_response,
          requestedAt: requestRow.requested_at,
          respondedAt: requestRow.responded_at,
          completedAt: requestRow.completed_at,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        reservationId?: string;
        checkoutToken?: string;
        requestText?: string;
      }
    | null;

  const reservationId = body?.reservationId?.trim() || "";
  const checkoutToken = body?.checkoutToken?.trim() || "";
  const requestText = body?.requestText?.trim().slice(0, 1600) || "";

  if (!reservationId) {
    return NextResponse.json({ error: "Reservation is required." }, { status: 400 });
  }
  if (!requestText) {
    return NextResponse.json(
      { error: "Tell the host what you would like to change." },
      { status: 400 },
    );
  }

  const loaded = await loadReservation(reservationId, checkoutToken);
  if (!loaded) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  const { admin, reservation } = loaded;
  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Only confirmed reservations can send a change request." },
      { status: 409 },
    );
  }

  const { data: activeRequest } = await admin
    .from("reservation_change_requests")
    .select("id,status")
    .eq("reservation_id", reservationId)
    .eq("status", "REQUESTED")
    .limit(1)
    .maybeSingle();

  if (activeRequest) {
    return NextResponse.json(
      { error: "A change request is already waiting for the host." },
      { status: 409 },
    );
  }

  const { data: requestRow, error: requestError } = await admin
    .from("reservation_change_requests")
    .insert({
      reservation_id: reservationId,
      requested_by: "GUEST",
      status: "REQUESTED",
      request_text: requestText,
      metadata: { source: "guest_trip" },
    })
    .select("id,status,requested_at")
    .single();

  if (requestError || !requestRow) {
    return NextResponse.json(
      { error: "The change request could not be sent." },
      { status: 500 },
    );
  }

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "GUEST_CHANGE_REQUESTED",
    metadata: {
      change_request_id: requestRow.id,
      request_text: requestText,
      source: "guest_trip",
    },
  });

  try {
    await sendChangeRequestNotification(admin, {
      requestId: requestRow.id,
      reservationId,
      requestText,
    });
  } catch (notificationError) {
    console.error(
      "[guest change request] host notification failed",
      requestRow.id,
      notificationError,
    );
  }

  return NextResponse.json({
    ok: true,
    confirmationCode: reservation.confirmation_code,
    request: {
      id: requestRow.id,
      status: requestRow.status,
      requestedAt: requestRow.requested_at,
      requestText,
    },
  });
}
