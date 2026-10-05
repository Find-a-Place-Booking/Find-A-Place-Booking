import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bookingSender,
  brandedEmailHtml,
  escapeHtml,
  siteUrl,
} from "@/lib/notifications/transactional-email";

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[host inquiry email] RESEND_API_KEY is not configured");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 240),
    },
    body: JSON.stringify({
      from: bookingSender(),
      to: [input.to],
      subject: input.subject,
      html: brandedEmailHtml({
        subject: input.subject,
        html: input.html,
      }),
      text: input.text,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.message || `Email provider returned HTTP ${response.status}.`,
    );
  }
}

export async function deliverHostProfileInquiryAlert(
  admin: SupabaseClient,
  inquiryId: string,
) {
  const { data: inquiry } = await admin
    .from("host_profile_inquiries")
    .select(
      "id,organization_id,property_id,guest_name,guest_email,message,created_at",
    )
    .eq("id", inquiryId)
    .maybeSingle();

  if (!inquiry) return;

  const [{ data: organization }, { data: property }] = await Promise.all([
    admin
      .from("organizations")
      .select("name,public_host_name,contact_email")
      .eq("id", inquiry.organization_id)
      .maybeSingle(),
    inquiry.property_id
      ? admin
          .from("properties")
          .select("name,notification_email,operations_email")
          .eq("id", inquiry.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const recipient =
    property?.notification_email ||
    property?.operations_email ||
    organization?.contact_email ||
    null;

  if (!recipient) return;

  const hostName =
    organization?.public_host_name || organization?.name || "Host";
  const subject = property?.name
    ? `Pre-booking question: ${property.name}`
    : `New pre-booking question for ${hostName}`;
  const inboxUrl = `${siteUrl()}/host/messages/inquiries`;

  await sendEmail({
    to: recipient,
    subject,
    idempotencyKey: `host-inquiry-${inquiry.id}`,
    text: [
      `${inquiry.guest_name} sent a pre-booking question through Find A Place.`,
      property?.name ? `Stay: ${property.name}` : null,
      `Guest email: ${inquiry.guest_email}`,
      "",
      inquiry.message,
      "",
      `Open the host inbox: ${inboxUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p><strong>New pre-booking inquiry</strong></p>
      <p>${escapeHtml(inquiry.guest_name)} sent a question through Find A Place.</p>
      ${
        property?.name
          ? `<p><strong>Stay:</strong> ${escapeHtml(property.name)}</p>`
          : ""
      }
      <p><strong>Guest email:</strong> ${escapeHtml(inquiry.guest_email)}</p>
      <blockquote>${escapeHtml(inquiry.message).replace(/\n/g, "<br>")}</blockquote>
      <p><a href="${escapeHtml(inboxUrl)}">Open pre-booking inquiries</a></p>`,
  });
}

export async function deliverHostProfileInquiryReply(
  admin: SupabaseClient,
  inquiryId: string,
) {
  const { data: inquiry } = await admin
    .from("host_profile_inquiries")
    .select(
      "id,organization_id,property_id,guest_name,guest_email,message,host_reply,replied_at",
    )
    .eq("id", inquiryId)
    .maybeSingle();

  if (!inquiry?.host_reply || !inquiry.guest_email) return;

  const [{ data: organization }, { data: property }] = await Promise.all([
    admin
      .from("organizations")
      .select("name,public_host_name,public_host_slug")
      .eq("id", inquiry.organization_id)
      .maybeSingle(),
    inquiry.property_id
      ? admin
          .from("properties")
          .select("name")
          .eq("id", inquiry.property_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const hostName =
    organization?.public_host_name || organization?.name || "Your host";
  const profileUrl = organization?.public_host_slug
    ? `${siteUrl()}/hosts/${encodeURIComponent(organization.public_host_slug)}`
    : siteUrl();
  const subject = property?.name
    ? `${hostName} replied about ${property.name}`
    : `${hostName} replied to your Find A Place question`;

  await sendEmail({
    to: inquiry.guest_email,
    subject,
    idempotencyKey: `host-inquiry-reply-${inquiry.id}-${String(
      inquiry.replied_at || "reply",
    ).replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`,
    text: [
      `Hi ${inquiry.guest_name},`,
      "",
      `${hostName} replied to your Find A Place question${
        property?.name ? ` about ${property.name}` : ""
      }:`,
      "",
      inquiry.host_reply,
      "",
      `Host profile: ${profileUrl}`,
    ].join("\n"),
    html: `<p>Hi ${escapeHtml(inquiry.guest_name)},</p>
      <p><strong>${escapeHtml(hostName)}</strong> replied to your Find A Place question${
        property?.name ? ` about ${escapeHtml(property.name)}` : ""
      }.</p>
      <blockquote>${escapeHtml(inquiry.host_reply).replace(/\n/g, "<br>")}</blockquote>
      <p><a href="${escapeHtml(profileUrl)}">View host profile</a></p>`,
  });
}
