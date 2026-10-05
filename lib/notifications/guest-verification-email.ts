import {
  bookingSender,
  brandedEmailHtml,
  escapeHtml,
} from "@/lib/notifications/transactional-email";

export async function sendGuestVerificationCodeEmail(input: {
  reservationId: string;
  confirmationCode: string;
  recipient: string;
  code: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  // Keep the one-time code out of notification previews / lock-screen
  // subject lines. The code only appears inside the message body.
  const subject = "Your Find A Place verification code";

  const text = [
    "Verify your email to continue your Find A Place booking.",
    "",
    `Verification code: ${input.code}`,
    "",
    "This code expires in 10 minutes.",
    `Reservation: ${input.confirmationCode}`,
    "",
    "If you did not start this booking, you can ignore this email.",
  ].join("\n");

  const body = `
    <p style="margin-bottom:8px">Verify your email to continue your Find A Place booking.</p>
    <div
      style="margin:18px 0 20px;padding:18px 20px;background:#f3f7f3;border:1px solid #d7e1d8;border-radius:12px;text-align:center"
    >
      <div
        style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b786f;margin-bottom:8px"
      >Verification code</div>
      <div
        style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:7px;color:#263a40"
      >${escapeHtml(input.code)}</div>
    </div>
    <p>This code expires in <strong>10 minutes</strong>.</p>
    <p><strong>Reservation:</strong> ${escapeHtml(
      input.confirmationCode,
    )}</p>
    <p><small>If you did not start this booking, you can ignore this email.</small></p>
  `;

  const html = brandedEmailHtml({
    subject,
    preheader:
      "Verify your email to continue your Find A Place booking.",
    html: body,
  });

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key":
          `fap-guest-email-code-${input.reservationId}-${input.code}`,
      },
      body: JSON.stringify({
        from: bookingSender(),
        to: [input.recipient.trim().toLowerCase()],
        subject,
        html,
        text,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  const payload = (
    await response.json().catch(() => ({}))
  ) as {
    id?: string;
    message?: string;
  };

  if (!response.ok || !payload.id) {
    throw new Error(
      payload.message ||
        `Email provider returned HTTP ${response.status}.`,
    );
  }

  return payload.id;
}
