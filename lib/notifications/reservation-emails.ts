import type { SupabaseClient } from "@supabase/supabase-js";

import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  return value.replace(/\/$/, "");
}

function bookingSender() {
  const domain = process.env.EMAIL_DOMAIN?.trim();
  const local = process.env.EMAIL_FROM_BOOKINGS?.trim() || "bookings";
  const name = process.env.EMAIL_PLATFORM_NAME?.trim() || "Find A Place Booking";
  if (!domain) throw new Error("EMAIL_DOMAIN is not configured.");
  return `${name} <${local}@${domain}>`;
}

async function sendOnce(input: {
  admin: SupabaseClient;
  reservationId: string;
  type: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(`[reservation email] ${input.type} skipped because RESEND_API_KEY is not configured`);
    return;
  }

  const recipient = input.recipient.trim().toLowerCase();
  const { data: existing } = await input.admin
    .from("notification_deliveries")
    .select("id,status,attempt_count")
    .eq("reservation_id", input.reservationId)
    .eq("notification_type", input.type)
    .eq("recipient", recipient)
    .maybeSingle();

  if (existing?.status === "SENT") return;

  let deliveryId = existing?.id as string | undefined;
  let attemptCount = Number(existing?.attempt_count ?? 0);

  if (!deliveryId) {
    const { data: created, error } = await input.admin
      .from("notification_deliveries")
      .upsert(
        {
          reservation_id: input.reservationId,
          notification_type: input.type,
          recipient,
          status: "PENDING",
        },
        {
          onConflict: "reservation_id,notification_type,recipient",
          ignoreDuplicates: true,
        },
      )
      .select("id,attempt_count")
      .maybeSingle();

    if (error) throw new Error(`Unable to reserve email delivery: ${error.message}`);

    if (created) {
      deliveryId = created.id;
      attemptCount = Number(created.attempt_count ?? 0);
    } else {
      const { data: raced, error: racedError } = await input.admin
        .from("notification_deliveries")
        .select("id,status,attempt_count")
        .eq("reservation_id", input.reservationId)
        .eq("notification_type", input.type)
        .eq("recipient", recipient)
        .single();
      if (racedError || !raced) throw new Error("Unable to recover email delivery record.");
      if (raced.status === "SENT") return;
      deliveryId = raced.id;
      attemptCount = Number(raced.attempt_count ?? 0);
    }
  }

  const idempotencyKey = `fap-${input.type.toLowerCase()}-${input.reservationId}-${recipient}`
    .replace(/[^a-z0-9-_]/g, "-")
    .slice(0, 240);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: bookingSender(),
        to: [recipient],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok || !payload.id) {
      throw new Error(payload.message || `Resend returned HTTP ${response.status}.`);
    }

    const { error } = await input.admin
      .from("notification_deliveries")
      .update({
        status: "SENT",
        provider_message_id: payload.id,
        attempt_count: attemptCount + 1,
        last_error: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", deliveryId);
    if (error) throw new Error(error.message);
  } catch (error) {
    await input.admin
      .from("notification_deliveries")
      .update({
        status: "FAILED",
        attempt_count: attemptCount + 1,
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Email failed.",
      })
      .eq("id", deliveryId);
    throw error;
  }
}

export async function sendBookingNotifications(
  admin: SupabaseClient,
  reservationId: string,
) {
  const { data: reservation, error } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,organization_id,guest_name,guest_email,guest_total_cents,currency,check_in,check_out",
    )
    .eq("id", reservationId)
    .single();
  if (error || !reservation) throw new Error("Unable to load booking notification data.");

  const [propertyResult, organizationResult] = await Promise.all([
    admin
      .from("properties")
      .select("name,notification_email,operations_email")
      .eq("id", reservation.property_id)
      .single(),
    admin
      .from("organizations")
      .select("name,contact_email")
      .eq("id", reservation.organization_id)
      .single(),
  ]);

  const property = propertyResult.data;
  const organization = organizationResult.data;
  const propertyName = property?.name || "your stay";
  const guestName = reservation.guest_name || "Guest";
  const total = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: reservation.currency || "USD",
  }).format(Number(reservation.guest_total_cents) / 100);
  const token = createGuestCheckoutToken(reservation.id);
  const tripUrl = `${siteUrl()}/trip/${encodeURIComponent(
    reservation.confirmation_code,
  )}?reservationId=${encodeURIComponent(reservation.id)}&checkoutToken=${encodeURIComponent(token)}`;

  if (reservation.guest_email) {
    await sendOnce({
      admin,
      reservationId,
      type: "GUEST_BOOKING_CONFIRMED",
      recipient: reservation.guest_email,
      subject: `Booking confirmed: ${propertyName}`,
      text: `Hi ${guestName}, your booking ${reservation.confirmation_code} at ${propertyName} is confirmed for ${reservation.check_in} through ${reservation.check_out}. Total: ${total}. Open your secure trip page: ${tripUrl}`,
      html: `<p>Hi ${escapeHtml(guestName)},</p><p>Your booking at <strong>${escapeHtml(
        propertyName,
      )}</strong> is confirmed.</p><p><strong>Confirmation:</strong> ${escapeHtml(
        reservation.confirmation_code,
      )}<br><strong>Dates:</strong> ${escapeHtml(reservation.check_in)} through ${escapeHtml(
        reservation.check_out,
      )}<br><strong>Total:</strong> ${escapeHtml(total)}</p><p><a href="${escapeHtml(
        tripUrl,
      )}">Open your secure trip page</a></p>`,
    });
  }

  const hostRecipient =
    property?.notification_email ||
    property?.operations_email ||
    organization?.contact_email;

  if (hostRecipient) {
    await sendOnce({
      admin,
      reservationId,
      type: "HOST_NEW_BOOKING",
      recipient: hostRecipient,
      subject: `New booking: ${propertyName} · ${reservation.confirmation_code}`,
      text: `${guestName} booked ${propertyName} for ${reservation.check_in} through ${reservation.check_out}. Guest total: ${total}. Confirmation: ${reservation.confirmation_code}. Open Find A Place: ${siteUrl()}/host/reservations/${reservation.id}`,
      html: `<p><strong>New Find A Place booking</strong></p><p>${escapeHtml(
        guestName,
      )} booked ${escapeHtml(propertyName)}.</p><p><strong>Dates:</strong> ${escapeHtml(
        reservation.check_in,
      )} through ${escapeHtml(reservation.check_out)}<br><strong>Guest total:</strong> ${escapeHtml(
        total,
      )}<br><strong>Confirmation:</strong> ${escapeHtml(
        reservation.confirmation_code,
      )}</p><p><a href="${escapeHtml(
        `${siteUrl()}/host/reservations/${reservation.id}`,
      )}">Open the reservation</a></p>`,
    });
  }
}
