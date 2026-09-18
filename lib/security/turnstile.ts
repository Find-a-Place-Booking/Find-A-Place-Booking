import { stripeEnvironment } from "@/lib/payments/booking-runtime";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export function turnstileConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() &&
      process.env.TURNSTILE_SECRET_KEY?.trim(),
  );
}

export async function verifyBookingTurnstile(input: {
  token?: string | null;
  remoteIp?: string | null;
}) {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    if (stripeEnvironment() === "LIVE") {
      throw new Error("Live checkout requires Cloudflare Turnstile.");
    }
    return { success: true, bypassed: true } as const;
  }

  const token = input.token?.trim();
  if (!token || token.length > 4096) {
    return { success: false, error: "Complete the security check and try again." } as const;
  }

  const form = new URLSearchParams({ secret, response: token });
  if (input.remoteIp) form.set("remoteip", input.remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );

  if (!response.ok) {
    throw new Error("The booking security check could not be reached.");
  }

  const result = (await response.json()) as TurnstileResponse;
  const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME?.trim();

  if (
    !result.success ||
    (result.action && result.action !== "booking_hold") ||
    (expectedHostname && result.hostname !== expectedHostname)
  ) {
    return {
      success: false,
      error: "The security check expired or could not be verified. Try again.",
      codes: result["error-codes"] ?? [],
    } as const;
  }

  return { success: true, bypassed: false } as const;
}
