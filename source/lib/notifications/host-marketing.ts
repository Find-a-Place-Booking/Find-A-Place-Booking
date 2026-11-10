import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  bookingSender,
  brandedEmailHtml,
  escapeHtml,
} from "@/lib/notifications/transactional-email";

// Recipients match the verified active Gez and Renea platform-admin profiles.
const MARKETING_RECIPIENTS = [
  "gezplus4@yahoo.com",
  "fancyhillcabinsandrvpark@gmail.com",
];

export async function sendHostMarketingAdvertisingEmail(requestId: string) {
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("host_marketing_ad_requests")
    .select("id,organization_id,contact_email,notes,status,attempt_count")
    .eq("id", requestId).maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request || request.status === "SENT" || request.status === "CANCELLED") return;

  const { data: organization, error: orgError } = await admin
    .from("organizations")
    .select("name")
    .eq("id", request.organization_id).maybeSingle();
  if (orgError || !organization) throw new Error(orgError?.message || "Host not found");

  const subject = `[Host advertising request] ${organization.name}`;
  const details = [
    `Host: ${organization.name}`,
    `Contact email: ${request.contact_email}`,
    "Additional advertising: YES",
    `Notes: ${request.notes || "None provided"}`,
    `Request ID: ${request.id}`,
  ].join("\n");

  try {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `fap-host-marketing-${request.id}`,
      },
      body: JSON.stringify({
        from: bookingSender(),
        to: MARKETING_RECIPIENTS,
        reply_to: request.contact_email,
        subject,
        html: brandedEmailHtml({
          subject,
          preheader: "A host has asked about additional Find A Place advertising.",
          html: `<h2>Host advertising request</h2>
            <p><strong>Host:</strong> ${escapeHtml(organization.name)}</p>
            <p><strong>Reply to:</strong> ${escapeHtml(request.contact_email)}</p>
            <p><strong>Additional advertising requested:</strong> Yes</p>
            <p><strong>Notes:</strong> ${escapeHtml(request.notes || "None provided").replace(/\n/g,"<br>")}</p>
            <p>Request ID: ${escapeHtml(request.id)}</p>`,
        }),
        text: details,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !payload.id) {
      throw new Error(payload.message || `Email provider returned ${response.status}`);
    }
    const { error } = await admin.from("host_marketing_ad_requests").update({
      status: "SENT", attempt_count: Number(request.attempt_count || 0) + 1,
      provider_message_id: payload.id, sent_at: new Date().toISOString(), last_error: null,
    }).eq("id",requestId);
    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    console.error("[Host marketing] advertising email delivery failed",requestId,message);
    await admin.from("host_marketing_ad_requests").update({
      status:"FAILED", attempt_count:Number(request.attempt_count || 0)+1,
      last_error:message.slice(0,500),
    }).eq("id",requestId);
    throw error;
  }
}
