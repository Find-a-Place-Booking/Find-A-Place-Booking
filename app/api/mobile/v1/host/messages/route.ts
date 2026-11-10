import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions, readMobileObject } from "@/lib/mobile/http";
import { mobileUserClient } from "@/lib/mobile/user-client";
import { sendReservationMessageNotification } from "@/lib/notifications/message-emails";
export async function OPTIONS(r: NextRequest) {
  return mobileOptions(r);
}
async function context(r: NextRequest, reservationId: unknown) {
  const auth = await authenticateMobileHost(r);
  if (!auth.ok)
    return { error: mobileJson(r, { error: auth.message }, auth.status) };
  if (!auth.access.allowed)
    return {
      error: mobileJson(r, { error: "Host app access required." }, 402),
    };
  if (
    typeof reservationId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(reservationId)
  )
    return { error: mobileJson(r, { error: "Choose a reservation." }, 400) };
  const booking = await auth.admin
    .from("reservations")
    .select("id,status")
    .eq("id", reservationId)
    .eq("organization_id", auth.access.organizationId)
    .maybeSingle();
  if (booking.error || !booking.data)
    return { error: mobileJson(r, { error: "Reservation not found." }, 404) };
  if (!["CONFIRMED", "CANCELLED"].includes(booking.data.status))
    return {
      error: mobileJson(
        r,
        {
          error:
            "Guest conversations are available for confirmed or cancelled reservations.",
        },
        409,
      ),
    };
  return { auth, reservationId };
}
export async function GET(r: NextRequest) {
  const c = await context(r, r.nextUrl.searchParams.get("reservationId"));
  if (c.error) return c.error;
  const result = await c
    .auth!.admin.from("reservation_messages")
    .select("id,sender_type,body,created_at,read_by_host_at")
    .eq("reservation_id", c.reservationId!)
    .order("created_at", { ascending: false })
    .limit(200);
  if (result.error)
    return mobileJson(r, { error: "Messages unavailable." }, 503);
  return mobileJson(r, { messages: (result.data || []).reverse() });
}
export async function POST(r: NextRequest) {
  const parsed = await readMobileObject(r);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  const c = await context(r, b?.reservationId);
  if (c.error) return c.error;
  const user = await mobileUserClient(r);
  if (b.action === "read") {
    const read = await c
      .auth!.admin.from("reservation_messages")
      .update({ read_by_host_at: new Date().toISOString() })
      .eq("reservation_id", c.reservationId!)
      .eq("sender_type", "GUEST")
      .is("read_by_host_at", null);
    return mobileJson(
      r,
      read.error ? { error: "Could not mark messages read." } : { ok: true },
      read.error ? 503 : 200,
    );
  }
  const body = typeof b?.message === "string" ? b.message.trim() : "";
  if (!body || body.length > 4000)
    return mobileJson(
      r,
      { error: "Enter a message up to 4,000 characters." },
      400,
    );
  // Use RLS for writes in addition to explicit organization authorization above.
  let { data: conversation, error: lookupError } = await user
    .from("reservation_conversations")
    .select("id")
    .eq("reservation_id", c.reservationId!)
    .maybeSingle();
  if (lookupError)
    return mobileJson(r, { error: "Conversation unavailable." }, 503);
  if (!conversation) {
    const created = await user
      .from("reservation_conversations")
      .insert({ reservation_id: c.reservationId! })
      .select("id")
      .single();
    if (created.error) {
      const retry = await user
        .from("reservation_conversations")
        .select("id")
        .eq("reservation_id", c.reservationId!)
        .maybeSingle();
      conversation = retry.data;
    } else conversation = created.data;
  }
  if (!conversation)
    return mobileJson(r, { error: "Could not start conversation." }, 503);
  const sent = await user
    .from("reservation_messages")
    .insert({
      conversation_id: conversation.id,
      reservation_id: c.reservationId!,
      sender_type: "HOST",
      sender_profile_id: c.auth!.access.userId,
      body,
    })
    .select("id")
    .single();
  if (sent.error || !sent.data)
    return mobileJson(r, { error: "Message could not be sent." }, 503);
  await c
    .auth!.admin.from("reservation_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
  try {
    await sendReservationMessageNotification(c.auth!.admin, {
      reservationId: c.reservationId!,
      messageId: sent.data.id,
      senderType: "HOST",
      body,
    });
  } catch {
    console.error("[mobile message] notification failed", sent.data.id);
  }
  return mobileJson(r, { ok: true });
}
