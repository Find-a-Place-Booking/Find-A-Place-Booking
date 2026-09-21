import type { SupabaseClient } from "@supabase/supabase-js";

import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";
import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";

type SenderType = "GUEST" | "HOST";

export async function sendReservationMessageNotification(
  admin: SupabaseClient,
  input: {
    reservationId: string;
    messageId: string;
    senderType: SenderType;
    body: string;
  },
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email",
    )
    .eq("id", input.reservationId)
    .maybeSingle();

  if (error || !reservation) {
    throw new Error("Unable to load reservation message notification data.");
  }

  const [{ data: property }, { data: organization }] = await Promise.all([
    admin
      .from("properties")
      .select("name,notification_email,operations_email")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("name,contact_email")
      .eq("id", reservation.organization_id)
      .maybeSingle(),
  ]);

  const propertyName = property?.name || "your Find A Place stay";
  const cleanBody = input.body.trim().slice(0, 4000);
  const escapedBody = escapeHtml(cleanBody).replace(/\n/g, "<br>");
  const cleanMessageId = input.messageId.replace(/[^a-zA-Z0-9]/g, "");

  if (input.senderType === "GUEST") {
    const recipient =
      property?.notification_email ||
      property?.operations_email ||
      organization?.contact_email ||
      null;

    if (!recipient) return;

    await sendNotificationOnce({
      admin,
      reservationId: reservation.id,
      type: `HOST_MESSAGE_${cleanMessageId}`,
      recipient,
      subject: `New guest message: ${propertyName} · ${reservation.confirmation_code}`,
      text: `${reservation.guest_name || "Your guest"} sent a message about ${propertyName}.\n\n${cleanBody}\n\nOpen the reservation: ${siteUrl()}/host/reservations/${reservation.id}`,
      html: `<p><strong>New guest message</strong></p><p>${escapeHtml(
        reservation.guest_name || "Your guest",
      )} sent a message about ${escapeHtml(
        propertyName,
      )}.</p><blockquote>${escapedBody}</blockquote><p><a href="${escapeHtml(
        `${siteUrl()}/host/reservations/${reservation.id}`,
      )}">Open the reservation</a></p>`,
    });

    return;
  }

  if (!reservation.guest_email) return;

  const token = createGuestCheckoutToken(reservation.id);
  const tripUrl = `${siteUrl()}/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(
    reservation.id,
  )}&checkoutToken=${encodeURIComponent(token)}`;

  await sendNotificationOnce({
    admin,
    reservationId: reservation.id,
    type: `GUEST_MESSAGE_${cleanMessageId}`,
    recipient: reservation.guest_email,
    subject: `New host message: ${propertyName}`,
    text: `Your host sent a message about ${propertyName} (${reservation.confirmation_code}).\n\n${cleanBody}\n\nOpen your secure trip page: ${tripUrl}`,
    html: `<p><strong>New host message</strong></p><p>Your host sent a message about ${escapeHtml(
      propertyName,
    )}.</p><blockquote>${escapedBody}</blockquote><p><a href="${escapeHtml(
      tripUrl,
    )}">Open your secure trip page</a></p>`,
  });
}
