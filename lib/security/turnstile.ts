import { stripeEnvironment } from "@/lib/payments/booking-runtime";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
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
      console.error(
        "[checkout security] Turnstile configuration missing in live checkout",
      );
      throw new Error("Live checkout requires Cloudflare Turnstile.");
    }
    return { success: true, bypassed: true } as const;
  }

  const token = input.token?.trim();
  if (!token || token.length > 4096) {
    console.warn("[checkout security] Turnstile token missing or invalid", {
      reason: !token ? "missing_token" : "token_too_long",
    });

    return {
      success: false,
      error: "Complete the security check and try again.",
    } as const;
  }

  const form = new URLSearchParams({ secret, response: token });
  if (input.remoteIp) form.set("remoteip", input.remoteIp);

  let response: Response;

  try {
    response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch (error) {
    console.error("[checkout security] Turnstile Siteverify request failed", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw error;
  }

  if (!response.ok) {
    console.error(
      "[checkout security] Turnstile Siteverify returned HTTP error",
      { status: response.status },
    );
    throw new Error("The booking security check could not be reached.");
  }

  const result = (await response.json()) as TurnstileResponse;
  const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME?.trim();
  const actionMismatch = Boolean(
    result.action && result.action !== "booking_hold",
  );
  const hostnameMismatch = Boolean(
    expectedHostname && result.hostname !== expectedHostname,
  );

  if (!result.success || actionMismatch || hostnameMismatch) {
    console.warn("[checkout security] Turnstile verification rejected", {
      success: result.success === true,
      reason: !result.success
        ? "cloudflare_rejected"
        : actionMismatch
          ? "action_mismatch"
          : "hostname_mismatch",
      action: result.action ?? null,
      hostname: result.hostname ?? null,
      expectedHostname: expectedHostname || null,
      challengeTs: result.challenge_ts ?? null,
      errorCodes: result["error-codes"] ?? [],
    });

    return {
      success: false,
      error: "The security check expired or could not be verified. Try again.",
      codes: result["error-codes"] ?? [],
    } as const;
  }

  console.info("[checkout security] Turnstile verified", {
    action: result.action ?? null,
    hostname: result.hostname ?? null,
    challengeTs: result.challenge_ts ?? null,
  });

  return { success: true, bypassed: false } as const;
}
