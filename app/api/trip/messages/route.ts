import { NextRequest, NextResponse } from "next/server";

import { guestCheckoutTokenMatches, sameOrigin } from "@/lib/payments/booking-runtime";
import { sendReservationMessageNotification } from "@/lib/notifications/message-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** The guest app and website share a booking-scoped token, not host permissions. */
async function verifiedReservation(reservationId: string, checkoutToken: string) {
  if (!guestCheckoutTokenMatches(reservationId, checkoutToken)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("reservations")
    .select("id,status,confirmation_code")
    .eq("id", reservationId)
    .maybeSingle();
  if (!data || !["CONFIRMED", "CANCELLED"].includes(data.status)) return null;
  return { admin, reservation: data };
}

export async function GET(request: NextRequest) {
  const reservationId = request.nextUrl.searchParams.get("reservationId")?.trim() || "";
  const checkoutToken = request.nextUrl.searchParams.get("checkoutToken")?.trim() || "";
  const verified = await verifiedReservation(reservationId, checkoutToken);
  if (!verified) {
    return NextResponse.json({ error: "Booking access could not be verified." }, { status: 403 });
  }
  const { data, error } = await verified.admin
    .from("reservation_messages")
    .select("id,sender_type,body,created_at")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: "Unable to load booking messages." }, { status: 500 });
  }
  // The mobile guest and host apps both display the same latest 200 messages.
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as
    | { reservationId?: string; checkoutToken?: string; message?: string }
    | null;
  const reservationId = body?.reservationId?.trim() || "";
  const checkoutToken = body?.checkoutToken?.trim() || "";
  const message = body?.message?.trim().slice(0, 4000) || "";
  if (!message) {
    return NextResponse.json({ error: "Enter a message first." }, { status: 400 });
  }
  const verified = await verifiedReservation(reservationId, checkoutToken);
  if (!verified) {
    return NextResponse.json({ error: "Booking access could not be verified." }, { status: 403 });
  }

  let { data: conversation, error: lookupError } = await verified.admin
    .from("reservation_conversations")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: "Unable to load booking conversation." }, { status: 500 });
  }
  if (!conversation) {
    const { data: created, error } = await verified.admin
      .from("reservation_conversations")
      .insert({ reservation_id: reservationId })
      .select("id")
      .single();
    if (error || !created) {
      // A host may have started this exact conversation at the same moment.
      const retry = await verified.admin
        .from("reservation_conversations")
        .select("id")
        .eq("reservation_id", reservationId)
        .maybeSingle();
      conversation = retry.data;
    } else conversation = created;
  }
  if (!conversation) {
    return NextResponse.json({ error: "Unable to start booking conversation." }, { status: 500 });
  }

  const { data: createdMessage, error } = await verified.admin
    .from("reservation_messages")
    .insert({
      conversation_id: conversation.id,
      reservation_id: reservationId,
      sender_type: "GUEST",
      sender_profile_id: null,
      body: message,
    })
    .select("id")
    .single();
  if (error || !createdMessage) {
    return NextResponse.json({ error: "Unable to send message." }, { status: 500 });
  }
  await verified.admin
    .from("reservation_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  try {
    await sendReservationMessageNotification(verified.admin, {
      reservationId,
      messageId: createdMessage.id,
      senderType: "GUEST",
      body: message,
    });
  } catch (notificationError) {
    console.error("[guest reservation message] email notification failed", createdMessage.id, notificationError);
  }
  return NextResponse.json({ ok: true });
}
