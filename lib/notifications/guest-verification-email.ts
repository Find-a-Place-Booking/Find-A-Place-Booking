function escapeHtml(value: string) {
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

function bookingSender() {
  const domain = process.env.EMAIL_DOMAIN?.trim();
  const local = process.env.EMAIL_FROM_BOOKINGS?.trim() || "bookings";
  const name = process.env.EMAIL_PLATFORM_NAME?.trim() || "Find A Place Booking";
  if (!domain) throw new Error("EMAIL_DOMAIN is not configured.");
  return `${name} <${local}@${domain}>`;
}

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

  // Keep the one-time code out of notification previews / lock-screen subject
  // lines. The code only appears inside the message body.
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
  const html = `<p>Verify your email to continue your Find A Place booking.</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">${escapeHtml(
    input.code,
  )}</p><p>This code expires in 10 minutes.</p><p><strong>Reservation:</strong> ${escapeHtml(
    input.confirmationCode,
  )}</p><p>If you did not start this booking, you can ignore this email.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `fap-guest-email-code-${input.reservationId}-${input.code}`,
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

  return payload.id;
}
