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
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,guest_phone",
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
      .select("name,contact_email,contact_phone")
      .eq("id", reservation.organization_id)
      .maybeSingle(),
  ]);

  const propertyName = property?.name || "your Find A Place stay";
  const hostName = organization?.name || propertyName;
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
      text: [
        `${reservation.guest_name || "Your guest"} sent a message about ${propertyName}.`,
        `Guest email: ${reservation.guest_email || "Not provided"}`,
        `Guest phone: ${reservation.guest_phone || "Not provided"}`,
        "",
        cleanBody,
        "",
        `Reply from the reservation page: ${siteUrl()}/host/reservations/${reservation.id}#messages`,
      ].join("\n"),
      html: `<p><strong>New guest message</strong></p><p>${escapeHtml(
        reservation.guest_name || "Your guest",
      )} sent a message about ${escapeHtml(
        propertyName,
      )}.</p><p><strong>Email:</strong> ${escapeHtml(
        reservation.guest_email || "Not provided",
      )}<br><strong>Phone:</strong> ${escapeHtml(
        reservation.guest_phone || "Not provided",
      )}</p><blockquote>${escapedBody}</blockquote><p><a href="${escapeHtml(
        `${siteUrl()}/host/reservations/${reservation.id}#messages`,
      )}">Reply to the guest</a></p>`,
    });

    return;
  }

  if (!reservation.guest_email) return;

  const token = createGuestCheckoutToken(reservation.id);
  const tripUrl = `${siteUrl()}/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(
    reservation.id,
  )}&checkoutToken=${encodeURIComponent(token)}#messages`;

  await sendNotificationOnce({
    admin,
    reservationId: reservation.id,
    type: `GUEST_MESSAGE_${cleanMessageId}`,
    recipient: reservation.guest_email,
    subject: `New host message: ${propertyName}`,
    text: [
      `${hostName} sent a message about ${propertyName} (${reservation.confirmation_code}).`,
      organization?.contact_email ? `Host email: ${organization.contact_email}` : null,
      organization?.contact_phone ? `Host phone: ${organization.contact_phone}` : null,
      "",
      cleanBody,
      "",
      `Reply from your secure trip page: ${tripUrl}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    html: `<p><strong>New host message</strong></p><p>${escapeHtml(
      hostName,
    )} sent a message about ${escapeHtml(propertyName)}.</p>${
      organization?.contact_email || organization?.contact_phone
        ? `<p>${
            organization?.contact_email
              ? `<strong>Email:</strong> ${escapeHtml(organization.contact_email)}`
              : ""
          }${
            organization?.contact_email && organization?.contact_phone
              ? "<br>"
              : ""
          }${
            organization?.contact_phone
              ? `<strong>Phone:</strong> ${escapeHtml(organization.contact_phone)}`
              : ""
          }</p>`
        : ""
    }<blockquote>${escapedBody}</blockquote><p><a href="${escapeHtml(
      tripUrl,
    )}">Reply to your host</a></p>`,
  });
}
