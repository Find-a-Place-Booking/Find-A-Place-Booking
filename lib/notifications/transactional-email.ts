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

export function formatMoney(
  cents: number | string | null | undefined,
  currency = "USD",
) {
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

export function bookingSender() {
  const domain = process.env.EMAIL_DOMAIN?.trim();
  const local = process.env.EMAIL_FROM_BOOKINGS?.trim() || "bookings";
  const name =
    process.env.EMAIL_PLATFORM_NAME?.trim() || "Find A Place Booking";

  if (!domain) throw new Error("EMAIL_DOMAIN is not configured.");
  return `${name} <${local}@${domain}>`;
}

const EMAIL_BRAND_MARKER = 'data-fap-email="v1"';

function styleEmailLinks(html: string) {
  return html.replace(
    /<a href="([^"]+)">/g,
    `<a href="$1" style="display:inline-block;background:#263a40;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:1.2;padding:12px 18px;border-radius:10px;margin:4px 0 8px">`,
  );
}

export function brandedEmailHtml(input: {
  subject: string;
  html: string;
  preheader?: string | null;
}) {
  if (input.html.includes(EMAIL_BRAND_MARKER)) return input.html;

  const base = siteUrl();
  const homeUrl = escapeHtml(base);
  const logoUrl = escapeHtml(
    `${base}/brand/find-a-place-seal.png`,
  );
  const preheader = escapeHtml(
    (input.preheader?.trim() || input.subject).slice(0, 180),
  );
  const content = styleEmailLinks(input.html);

  return `<!doctype html>
<html lang="en" ${EMAIL_BRAND_MARKER}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.subject)}</title>
    <style>
      body {
        margin: 0 !important;
        padding: 0 !important;
        background: #f4f1e9 !important;
      }
      table {
        border-spacing: 0;
      }
      img {
        border: 0;
        line-height: 100%;
      }
      .fap-content p {
        margin: 0 0 16px;
        color: #34433f;
        font-size: 15px;
        line-height: 1.62;
      }
      .fap-content h1,
      .fap-content h2,
      .fap-content h3 {
        margin: 0 0 12px;
        color: #263a40;
        font-family: Georgia, "Times New Roman", serif;
        font-weight: 500;
        line-height: 1.2;
      }
      .fap-content strong {
        color: #263a40;
      }
      .fap-content blockquote {
        margin: 16px 0;
        padding: 14px 16px;
        border-left: 3px solid #879d8a;
        background: #f5f7f3;
        color: #34433f;
        border-radius: 0 10px 10px 0;
      }
      .fap-content hr {
        height: 1px;
        margin: 22px 0;
        border: 0;
        background: #e6e1d7;
      }
      .fap-content small {
        color: #6f7773;
      }
      @media only screen and (max-width: 620px) {
        .fap-shell {
          width: 100% !important;
        }
        .fap-pad {
          padding-left: 18px !important;
          padding-right: 18px !important;
        }
        .fap-card {
          border-radius: 14px !important;
        }
        .fap-logo {
          width: 48px !important;
          height: 48px !important;
        }
      }
    </style>
  </head>
  <body>
    <div
      style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent"
    >${preheader}</div>

    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="width:100%;background:#f4f1e9"
    >
      <tr>
        <td align="center" style="padding:28px 12px 36px">
          <table
            role="presentation"
            width="620"
            cellpadding="0"
            cellspacing="0"
            class="fap-shell"
            style="width:620px;max-width:620px"
          >
            <tr>
              <td
                class="fap-pad"
                style="padding:0 10px 18px"
              >
                <a
                  href="${homeUrl}"
                  style="display:inline-block;text-decoration:none;color:#263a40"
                >
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:12px">
                        <img
                          src="${logoUrl}"
                          width="56"
                          height="56"
                          class="fap-logo"
                          alt="Find A Place"
                          style="display:block;width:56px;height:56px;object-fit:contain"
                        >
                      </td>
                      <td style="vertical-align:middle">
                        <div
                          style="font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.05;color:#263a40"
                        >Find A Place</div>
                        <div
                          style="margin-top:4px;font-family:Arial,sans-serif;font-size:11px;line-height:1.2;letter-spacing:.08em;text-transform:uppercase;color:#708078"
                        >Booking · Arkansas, Missouri &amp; beyond</div>
                      </td>
                    </tr>
                  </table>
                </a>
              </td>
            </tr>

            <tr>
              <td
                class="fap-card"
                style="background:#ffffff;border:1px solid #e2ded5;border-radius:18px;box-shadow:0 8px 28px rgba(38,58,64,.08);overflow:hidden"
              >
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="height:5px;background:#6f8f7a;font-size:0;line-height:0">&nbsp;</td>
                  </tr>
                  <tr>
                    <td
                      class="fap-content fap-pad"
                      style="padding:28px 30px 26px;font-family:Arial,Helvetica,sans-serif;color:#34433f;font-size:15px;line-height:1.62"
                    >
                      ${content}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td
                class="fap-pad"
                style="padding:18px 16px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#7b817e"
              >
                <div style="font-size:11px;line-height:1.6">
                  Sent by <strong style="color:#5c6862">Find A Place Booking</strong>
                  <br>
                  <a
                    href="${homeUrl}"
                    style="color:#5c7366;text-decoration:none"
                  >findaplacebooking.com</a>
                </div>
                <div style="margin-top:8px;font-size:10px;line-height:1.5;color:#929895">
                  Keep your confirmation number and secure trip links private.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
    const brandedHtml = brandedEmailHtml({
      subject: delivery.subject,
      html: delivery.html_body,
    });

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
        html: brandedHtml,
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
        payload.message ||
          `Email provider returned HTTP ${response.status}.`,
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
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Email failed.",
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

  const brandedHtml = brandedEmailHtml({
    subject: input.subject,
    html: input.html,
  });

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
    throw new Error(
      `Unable to inspect email delivery: ${existingError.message}`,
    );
  }

  if (existing?.status === "SENT") {
    return { sent: false, skipped: true } as const;
  }

  let delivery: DeliveryPayload | null =
    existing as DeliveryPayload | null;

  if (delivery) {
    const { data: updated, error } = await input.admin
      .from("notification_deliveries")
      .update({
        subject: input.subject,
        html_body: brandedHtml,
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
      throw new Error(
        `Unable to prepare email delivery: ${
          error?.message ?? "Unknown error"
        }`,
      );
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
          html_body: brandedHtml,
          text_body: input.text,
          status: "PENDING",
        },
        {
          onConflict:
            "reservation_id,notification_type,recipient",
          ignoreDuplicates: true,
        },
      )
      .select(
        "id,reservation_id,notification_type,recipient,subject,html_body,text_body,status,attempt_count",
      )
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to reserve email delivery: ${error.message}`,
      );
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

      const { data: refreshed, error: refreshError } =
        await input.admin
          .from("notification_deliveries")
          .update({
            subject: input.subject,
            html_body: brandedHtml,
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
          `Unable to refresh email delivery: ${
            refreshError?.message ?? "Unknown error"
          }`,
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

  if (error) {
    throw new Error(
      `Unable to load failed email: ${error.message}`,
    );
  }

  if (!data || data.status !== "FAILED") {
    return {
      sent: false,
      skipped: true,
      legacy: false,
    } as const;
  }

  if (!data.subject || !data.html_body || !data.text_body) {
    return {
      sent: false,
      skipped: true,
      legacy: true,
    } as const;
  }

  const { error: pendingError } = await admin
    .from("notification_deliveries")
    .update({
      status: "PENDING",
      last_error: null,
    })
    .eq("id", data.id)
    .eq("status", "FAILED");

  if (pendingError) {
    throw new Error(
      `Unable to retry failed email: ${pendingError.message}`,
    );
  }

  return {
    ...(await deliverReservedNotification(admin, {
      ...(data as DeliveryPayload),
      status: "PENDING",
    })),
    legacy: false,
  };
}
