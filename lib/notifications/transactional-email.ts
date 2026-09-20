import type { SupabaseClient } from "@supabase/supabase-js";

export function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '\"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

export function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  return value.replace(/\/$/, "");
}

export function formatMoney(cents: number | string | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(Number(cents || 0) / 100);
}

export function internalAlertRecipients() {
  const raw = process.env.EMAIL_INTERNAL_ALERT_TO?.trim();
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(/[;,]/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function bookingSender() {
  const domain = process.env.EMAIL_DOMAIN?.trim();
  const local = process.env.EMAIL_FROM_BOOKINGS?.trim() || "bookings";
  const name = process.env.EMAIL_PLATFORM_NAME?.trim() || "Find A Place Booking";
  if (!domain) throw new Error("EMAIL_DOMAIN is not configured.");
  return `${name} <${local}@${domain}>`;
}

function deliveryIdempotencyKey(input: {
  type: string;
  reservationId: string;
  recipient: string;
}) {
  return `fap-${input.type.toLowerCase()}-${input.reservationId}-${input.recipient}`
    .replace(/[^a-z0-9-_]/g, "-")
    .slice(0, 240);
}

type DeliveryPayload = {
  id: string;
  reservation_id: string;
  notification_type: string;
  recipient: string;
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  status: string;
  attempt_count: number;
};

async function deliverReservedNotification(
  admin: SupabaseClient,
  delivery: DeliveryPayload,
) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      `[transactional email] ${delivery.notification_type} skipped because RESEND_API_KEY is not configured`,
    );
    return { sent: false, skipped: true } as const;
  }

  if (!delivery.subject || !delivery.html_body || !delivery.text_body) {
    throw new Error(
      `Notification ${delivery.notification_type} does not have a persisted email payload.`,
    );
  }

  const attemptCount = Number(delivery.attempt_count || 0);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": deliveryIdempotencyKey({
          type: delivery.notification_type,
          reservationId: delivery.reservation_id,
          recipient: delivery.recipient,
        }),
      },
      body: JSON.stringify({
        from: bookingSender(),
        to: [delivery.recipient],
        subject: delivery.subject,
        html: delivery.html_body,
        text: delivery.text_body,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok || !payload.id) {
      throw new Error(
        payload.message || `Email provider returned HTTP ${response.status}.`,
      );
    }

    const { error } = await admin
      .from("notification_deliveries")
      .update({
        status: "SENT",
        provider_message_id: payload.id,
        attempt_count: attemptCount + 1,
        last_error: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);

    if (error) throw new Error(error.message);
    return { sent: true, skipped: false } as const;
  } catch (error) {
    await admin
      .from("notification_deliveries")
      .update({
        status: "FAILED",
        attempt_count: attemptCount + 1,
        last_error:
          error instanceof Error ? error.message.slice(0, 1000) : "Email failed.",
      })
      .eq("id", delivery.id);
    throw error;
  }
}

export async function sendNotificationOnce(input: {
  admin: SupabaseClient;
  reservationId: string;
  type: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
}) {
  const recipient = input.recipient.trim().toLowerCase();
  if (!recipient) return { sent: false, skipped: true } as const;

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      `[transactional email] ${input.type} skipped because RESEND_API_KEY is not configured`,
    );
    return { sent: false, skipped: true } as const;
  }

  const { data: existing, error: existingError } = await input.admin
    .from("notification_deliveries")
    .select(
      "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
    )
    .eq("reservation_id", input.reservationId)
    .eq("notification_type", input.type)
    .eq("recipient", recipient)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to inspect email delivery: ${existingError.message}`);
  }
  if (existing?.status === "SENT") {
    return { sent: false, skipped: true } as const;
  }

  let delivery: DeliveryPayload | null = existing as DeliveryPayload | null;

  if (delivery) {
    const { data: updated, error } = await input.admin
      .from("notification_deliveries")
      .update({
        subject: input.subject,
        html_body: input.html,
        text_body: input.text,
        status: "PENDING",
        last_error: null,
      })
      .eq("id", delivery.id)
      .select(
        "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
      )
      .single();

    if (error || !updated) {
      throw new Error(`Unable to prepare email delivery: ${error?.message ?? "Unknown error"}`);
    }
    delivery = updated as DeliveryPayload;
  } else {
    const { data: created, error } = await input.admin
      .from("notification_deliveries")
      .upsert(
        {
          reservation_id: input.reservationId,
          notification_type: input.type,
          recipient,
          subject: input.subject,
          html_body: input.html,
          text_body: input.text,
          status: "PENDING",
        },
        {
          onConflict: "reservation_id,notification_type,recipient",
          ignoreDuplicates: true,
        },
      )
      .select(
        "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
      )
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to reserve email delivery: ${error.message}`);
    }

    if (created) {
      delivery = created as DeliveryPayload;
    } else {
      const { data: raced, error: racedError } = await input.admin
        .from("notification_deliveries")
        .select(
          "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
        )
        .eq("reservation_id", input.reservationId)
        .eq("notification_type", input.type)
        .eq("recipient", recipient)
        .single();

      if (racedError || !raced) {
        throw new Error("Unable to recover email delivery record.");
      }
      if (raced.status === "SENT") {
        return { sent: false, skipped: true } as const;
      }

      const { data: refreshed, error: refreshError } = await input.admin
        .from("notification_deliveries")
        .update({
          subject: input.subject,
          html_body: input.html,
          text_body: input.text,
          status: "PENDING",
          last_error: null,
        })
        .eq("id", raced.id)
        .select(
          "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
        )
        .single();

      if (refreshError || !refreshed) {
        throw new Error(
          `Unable to refresh email delivery: ${refreshError?.message ?? "Unknown error"}`,
        );
      }
      delivery = refreshed as DeliveryPayload;
    }
  }

  return deliverReservedNotification(input.admin, delivery);
}

export async function retryNotificationDelivery(
  admin: SupabaseClient,
  deliveryId: string,
) {
  const { data, error } = await admin
    .from("notification_deliveries")
    .select(
      "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
    )
    .eq("id", deliveryId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load failed email: ${error.message}`);
  if (!data || data.status !== "FAILED") {
    return { sent: false, skipped: true, legacy: false } as const;
  }

  if (!data.subject || !data.html_body || !data.text_body) {
    return { sent: false, skipped: true, legacy: true } as const;
  }

  const { error: pendingError } = await admin
    .from("notification_deliveries")
    .update({ status: "PENDING", last_error: null })
    .eq("id", data.id)
    .eq("status", "FAILED");

  if (pendingError) {
    throw new Error(`Unable to retry failed email: ${pendingError.message}`);
  }

  return {
    ...(await deliverReservedNotification(admin, {
      ...(data as DeliveryPayload),
      status: "PENDING",
    })),
    legacy: false,
  };
}
