import { NextRequest, NextResponse } from "next/server";

import {
  guestCheckoutTokenMatches,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { sendCancellationRequestNotification } from "@/lib/notifications/cancellation-request-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NON_REFUNDABLE_COMMISSION_NOTICE =
  "Find A Place's host-paid platform commission is earned when a paid booking connects the guest and host and is not reversed by a later cancellation, refund, shortened stay or booking change. Any guest refund approved by the host is funded from the host's connected payment charge.";

async function loadReservation(
  reservationId: string,
  checkoutToken: string | null | undefined,
) {
  if (!guestCheckoutTokenMatches(reservationId, checkoutToken)) {
    return null;
  }

  const admin = createAdminClient();
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,status,payment_status,check_in,check_out,currency,organization_id,property_id,guest_name,guest_email,guest_phone",
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
    .from("reservation_cancellation_requests")
    .select(
      "id,status,reason,host_response,requested_at,responded_at,completed_at,metadata",
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
    return NextResponse.json(
      { error: "Reservation is required." },
      { status: 400 },
    );
  }

  const loaded = await loadReservation(
    reservationId,
    checkoutToken,
  );

  if (!loaded) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  const { admin, reservation } = loaded;
  const requestRow = await latestRequest(admin, reservationId);
  const activeRequest =
    requestRow &&
    ["REQUESTED", "APPROVED"].includes(requestRow.status);

  const canRequest =
    reservation.status === "CONFIRMED" && !activeRequest;

  let policy: string;

  if (reservation.status === "CANCELLED") {
    policy =
      `This reservation is cancelled. Any guest refund is tracked separately with the payment processor. ${NON_REFUNDABLE_COMMISSION_NOTICE}`;
  } else if (activeRequest) {
    policy =
      requestRow?.status === "APPROVED"
        ? `Your host approved the request. Any guest refund they approved is being processed against the host's connected payment charge. ${NON_REFUNDABLE_COMMISSION_NOTICE}`
        : `Your cancellation request was sent to the host. The reservation remains confirmed until the host approves it and the cancellation is completed. ${NON_REFUNDABLE_COMMISSION_NOTICE}`;
  } else if (requestRow?.status === "DECLINED") {
    policy =
      `Your host declined the last cancellation request. The reservation remains confirmed. You can message the host or submit another request if circumstances change. ${NON_REFUNDABLE_COMMISSION_NOTICE}`;
  } else {
    policy =
      `Cancellation requests go directly to the host. Sending a request does not cancel the booking or guarantee a refund; the host applies the property policy accepted at booking, subject to applicable law. ${NON_REFUNDABLE_COMMISSION_NOTICE}`;
  }

  return NextResponse.json({
    reservationId,
    confirmationCode: reservation.confirmation_code,
    reservationStatus: reservation.status,
    paymentStatus: reservation.payment_status,
    checkIn: reservation.check_in,
    checkOut: reservation.check_out,
    canRequest,
    request: requestRow
      ? {
          id: requestRow.id,
          status: requestRow.status,
          reason: requestRow.reason,
          hostResponse: requestRow.host_response,
          requestedAt: requestRow.requested_at,
          respondedAt: requestRow.responded_at,
          completedAt: requestRow.completed_at,
        }
      : null,
    policy,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        reservationId?: string;
        checkoutToken?: string;
        reason?: string;
      }
    | null;

  const reservationId = body?.reservationId?.trim() || "";
  const checkoutToken = body?.checkoutToken?.trim() || "";
  const reason =
    body?.reason?.trim().slice(0, 1200) || null;

  if (!reservationId) {
    return NextResponse.json(
      { error: "Reservation is required." },
      { status: 400 },
    );
  }

  const loaded = await loadReservation(
    reservationId,
    checkoutToken,
  );

  if (!loaded) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  const { admin, reservation } = loaded;

  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json(
      {
        error:
          "Only confirmed reservations can send a cancellation request.",
      },
      { status: 409 },
    );
  }

  const { data: activeRequest } = await admin
    .from("reservation_cancellation_requests")
    .select("id,status")
    .eq("reservation_id", reservationId)
    .in("status", ["REQUESTED", "APPROVED"])
    .limit(1)
    .maybeSingle();

  if (activeRequest) {
    return NextResponse.json(
      {
        error:
          activeRequest.status === "APPROVED"
            ? "Your host already approved a cancellation request for this reservation."
            : "A cancellation request is already waiting for the host.",
      },
      { status: 409 },
    );
  }

  const { data: requestRow, error: requestError } =
    await admin
      .from("reservation_cancellation_requests")
      .insert({
        reservation_id: reservationId,
        requested_by: "GUEST",
        status: "REQUESTED",
        reason,
        metadata: {
          source: "guest_trip",
          platform_commission_policy:
            "NON_REFUNDABLE",
        },
      })
      .select("id,status,requested_at")
      .single();

  if (requestError || !requestRow) {
    return NextResponse.json(
      {
        error:
          "The cancellation request could not be sent.",
      },
      { status: 500 },
    );
  }

  await admin.from("reservation_events").insert({
    reservation_id: reservationId,
    event_type: "GUEST_CANCELLATION_REQUESTED",
    metadata: {
      cancellation_request_id: requestRow.id,
      reason,
      source: "guest_trip",
      platform_commission_policy: "NON_REFUNDABLE",
    },
  });

  try {
    await sendCancellationRequestNotification(admin, {
      requestId: requestRow.id,
      reservationId,
      reason,
    });
  } catch (notificationError) {
    console.error(
      "[guest cancellation request] host notification failed",
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
      reason,
    },
  });
}
