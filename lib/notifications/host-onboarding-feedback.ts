import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeHtml } from "@/lib/notifications/transactional-email";

const REQUIRED_RECIPIENTS = [
  "findaplacebookingtech@gmail.com",
  "fancyhillcabinsandrvpark@gmail.com",
];

type FeedbackRow = {
  id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  organization_name: string | null;
  property_name: string;
  property_slug: string;
  overall_ease: number;
  difficulty_areas: string[];
  hardest_part: string | null;
  explain_better: string | null;
  unnecessary_part: string | null;
  missing_feature: string | null;
  human_help: string;
  human_help_details: string | null;
  add_property_confidence: number;
  one_change: string | null;
  additional_comments: string | null;
  dont_go_empty_interest: boolean | null;
  context: Record<string, unknown> | null;
  needs_review: boolean;
  faq_candidate: boolean;
  email_status: string;
  email_attempt_count: number;
  created_at: string;
};

function feedbackSender() {
  const domain = process.env.EMAIL_DOMAIN?.trim();
  const local =
    process.env.EMAIL_FROM_HOST_FEEDBACK?.trim() ||
    process.env.EMAIL_FROM_BOOKINGS?.trim() ||
    "bookings";
  const name =
    process.env.EMAIL_PLATFORM_NAME?.trim() ||
    "Find A Place Booking";

  if (!domain) {
    throw new Error("EMAIL_DOMAIN is not configured.");
  }

  return `${name} <${local}@${domain}>`;
}

function humanHelpLabel(value: string) {
  if (value === "NO") return "No";
  if (value === "A_LITTLE") return "A little";
  if (value === "YES_SEVERAL") return "Yes, several times";
  return value || "Not answered";
}

function line(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || "No response";
}

function contextLine(
  context: Record<string, unknown> | null,
  key: string,
) {
  const value = context?.[key];
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "None";
  }
  if (value == null || value === "") return "Not available";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildEmail(row: FeedbackRow) {
  const difficulties = row.difficulty_areas?.length
    ? row.difficulty_areas.join(", ")
    : "None selected";

  const subject =
    `[Host onboarding feedback] ${row.property_name} · ` +
    `${row.overall_ease}/5 ease`;

  const text = [
    "HOST ONBOARDING FEEDBACK",
    "",
    `Property: ${row.property_name}`,
    `Organization: ${row.organization_name || "Not available"}`,
    `Host/respondent: ${row.respondent_name || "Not available"}`,
    `Host email: ${row.respondent_email || "Not available"}`,
    `Submitted: ${row.created_at}`,
    "",
    `Overall ease: ${row.overall_ease}/5`,
    `Problem areas: ${difficulties}`,
    `Needed human help: ${humanHelpLabel(row.human_help)}`,
    `Comfort adding another property alone: ${row.add_property_confidence}/5`,
    `Needs review: ${row.needs_review ? "YES" : "No"}`,
    `FAQ / tooltip candidate: ${row.faq_candidate ? "YES" : "No"}`,
    `Don't Go Empty program: ${
      row.dont_go_empty_interest === true
        ? "YES - interested"
        : row.dont_go_empty_interest === false
          ? "NO - not right now"
          : "Not answered"
    }`,
    "",
    "Hardest or most confusing part:",
    line(row.hardest_part),
    "",
    "What should the site explain better?",
    line(row.explain_better),
    "",
    "What felt unnecessary or should be removed?",
    line(row.unnecessary_part),
    "",
    "What was missing that would have made setup easier?",
    line(row.missing_feature),
    "",
    "What did they need human help with?",
    line(row.human_help_details),
    "",
    "If they could change one thing:",
    line(row.one_change),
    "",
    "Anything else:",
    line(row.additional_comments),
    "",
    "AUTOMATIC CONTEXT",
    `Calendar preference: ${contextLine(row.context, "calendar_preference")}`,
    `Calendar connections: ${contextLine(row.context, "calendar_connections")}`,
    `Stripe status: ${contextLine(row.context, "stripe_status")}`,
    `Property status: ${contextLine(row.context, "property_status")}`,
    `Onboarding status: ${contextLine(row.context, "onboarding_status")}`,
  ].join("\n");

  const answer = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e8e4dc;font-weight:700;vertical-align:top;width:32%">${escapeHtml(label)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8e4dc;white-space:pre-wrap">${escapeHtml(value)}</td>
    </tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#263a40;max-width:760px;margin:0 auto">
      <div style="background:#263a40;color:white;padding:22px 24px">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Find A Place Booking</div>
        <h1 style="font-size:24px;margin:7px 0 4px">Host onboarding feedback</h1>
        <div>${escapeHtml(row.property_name)}</div>
      </div>

      <div style="padding:20px 0">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${answer("Organization", row.organization_name || "Not available")}
          ${answer("Host / respondent", row.respondent_name || "Not available")}
          ${answer("Host email", row.respondent_email || "Not available")}
          ${answer("Overall ease", `${row.overall_ease}/5`)}
          ${answer("Problem areas", difficulties)}
          ${answer("Needed human help", humanHelpLabel(row.human_help))}
          ${answer("Comfort adding another property", `${row.add_property_confidence}/5`)}
          ${answer("Needs review", row.needs_review ? "YES" : "No")}
          ${answer("FAQ / tooltip candidate", row.faq_candidate ? "YES" : "No")}
          ${answer(
            "Don't Go Empty program",
            row.dont_go_empty_interest === true
              ? "YES - interested"
              : row.dont_go_empty_interest === false
                ? "NO - not right now"
                : "Not answered",
          )}
        </table>

        <h2 style="font-size:18px;margin:26px 0 8px">Written feedback</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${answer("Hardest / most confusing", line(row.hardest_part))}
          ${answer("Explain better", line(row.explain_better))}
          ${answer("Unnecessary / remove", line(row.unnecessary_part))}
          ${answer("Missing / add", line(row.missing_feature))}
          ${answer("Human help details", line(row.human_help_details))}
          ${answer("One change", line(row.one_change))}
          ${answer("Anything else", line(row.additional_comments))}
        </table>

        <h2 style="font-size:18px;margin:26px 0 8px">Automatic setup context</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${answer("Property status", contextLine(row.context, "property_status"))}
          ${answer("Calendar preference", contextLine(row.context, "calendar_preference"))}
          ${answer("Calendar connections", contextLine(row.context, "calendar_connections"))}
          ${answer("Stripe status", contextLine(row.context, "stripe_status"))}
          ${answer("Onboarding status", contextLine(row.context, "onboarding_status"))}
        </table>
      </div>
    </div>`;

  return { subject, text, html };
}

export async function sendHostOnboardingFeedbackEmail(
  admin: SupabaseClient,
  feedbackId: string,
) {
  const { data, error } = await admin
    .from("host_onboarding_feedback")
    .select(
      "id,respondent_name,respondent_email,organization_name,property_name,property_slug,overall_ease,difficulty_areas,hardest_part,explain_better,unnecessary_part,missing_feature,human_help,human_help_details,add_property_confidence,one_change,additional_comments,dont_go_empty_interest,context,needs_review,faq_candidate,email_status,email_attempt_count,created_at",
    )
    .eq("id", feedbackId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load onboarding feedback email: ${error.message}`,
    );
  }

  if (!data || data.email_status === "SENT") {
    return { sent: false, skipped: true } as const;
  }

  const row = data as FeedbackRow;
  const attemptCount = Number(row.email_attempt_count || 0);
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    const message = "RESEND_API_KEY is not configured.";
    await admin
      .from("host_onboarding_feedback")
      .update({
        email_status: "FAILED",
        email_attempt_count: attemptCount + 1,
        email_error: message,
      })
      .eq("id", row.id);
    throw new Error(message);
  }

  const email = buildEmail(row);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `fap-host-onboarding-feedback-${row.id}`,
      },
      body: JSON.stringify({
        from: feedbackSender(),
        to: REQUIRED_RECIPIENTS,
        reply_to: row.respondent_email || undefined,
        subject: email.subject,
        html: email.html,
        text: email.text,
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

    const { error: updateError } = await admin
      .from("host_onboarding_feedback")
      .update({
        email_status: "SENT",
        email_attempt_count: attemptCount + 1,
        email_provider_message_id: payload.id,
        email_error: null,
        emailed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) throw new Error(updateError.message);

    return { sent: true, skipped: false } as const;
  } catch (sendError) {
    const message =
      sendError instanceof Error
        ? sendError.message.slice(0, 1000)
        : "Feedback email failed.";

    await admin
      .from("host_onboarding_feedback")
      .update({
        email_status: "FAILED",
        email_attempt_count: attemptCount + 1,
        email_error: message,
      })
      .eq("id", row.id);

    throw sendError;
  }
}

export async function retryHostOnboardingFeedbackEmails(
  admin: SupabaseClient,
  limit = 20,
) {
  const { data, error } = await admin
    .from("host_onboarding_feedback")
    .select("id")
    .in("email_status", ["PENDING", "FAILED"])
    .lt("email_attempt_count", 5)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(
      `Unable to load pending onboarding feedback emails: ${error.message}`,
    );
  }

  let retried = 0;
  let sent = 0;
  let failed = 0;

  for (const row of data ?? []) {
    retried += 1;
    try {
      const result = await sendHostOnboardingFeedbackEmail(
        admin,
        row.id,
      );
      if (result.sent) sent += 1;
    } catch (retryError) {
      failed += 1;
      console.error(
        "[host onboarding feedback] retry failed",
        row.id,
        retryError,
      );
    }
  }

  return { retried, sent, failed };
}
