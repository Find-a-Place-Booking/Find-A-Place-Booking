import { createHmac, timingSafeEqual } from "node:crypto";

function guestTokenSecret() {
  const value = process.env.BOOKING_GUEST_TOKEN_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "BOOKING_GUEST_TOKEN_SECRET must be configured with at least 32 characters.",
    );
  }
  return value;
}

export function bookingCheckoutEnabled() {
  return process.env.BOOKING_CHECKOUT_ENABLED === "true";
}

export function requireBookingCheckout() {
  if (!bookingCheckoutEnabled()) {
    throw new Error("Guest checkout is currently disabled.");
  }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function createGuestCheckoutToken(reservationId: string) {
  return createHmac("sha256", guestTokenSecret())
    .update(`find-a-place:reservation:${reservationId}`, "utf8")
    .digest("hex");
}

export function guestCheckoutTokenMatches(
  reservationId: string,
  token: string | null | undefined,
) {
  if (!token) return false;

  const expected = createGuestCheckoutToken(reservationId);

  try {
    const candidate = Buffer.from(token, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    return (
      candidate.length === expectedBuffer.length &&
      timingSafeEqual(candidate, expectedBuffer)
    );
  } catch {
    return false;
  }
}

export function stripeIsTestMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  return key.startsWith("sk_test_");
}

export type PaymentEnvironment = "TEST" | "LIVE";

export function stripeEnvironment(): PaymentEnvironment {
  return assertStripeKeyModesMatch() === "test" ? "TEST" : "LIVE";
}

export function requireLiveCheckoutDependencies() {
  if (stripeEnvironment() !== "LIVE") return;

  const missing = [
    "TURNSTILE_SECRET_KEY",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_EXPECTED_HOSTNAME",
    "RESEND_API_KEY",
    "EMAIL_DOMAIN",
    "NEXT_PUBLIC_SITE_URL",
    "CRON_SECRET",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET",
    "STRIPE_PROCESSING_RATE_BPS",
    "STRIPE_PROCESSING_FIXED_CENTS",
    "BOOKING_GUEST_TOKEN_SECRET",
  ].filter((name) => !process.env[name]?.trim());

  if (missing.length) {
    throw new Error(
      `Live checkout is blocked until these production settings are configured: ${missing.join(", ")}.`,
    );
  }
}

export function assertStripeKeyModesMatch() {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  const secretMode = secret.startsWith("sk_test_")
    ? "test"
    : secret.startsWith("sk_live_")
      ? "live"
      : null;

  const publishableMode = publishable.startsWith("pk_test_")
    ? "test"
    : publishable.startsWith("pk_live_")
      ? "live"
      : null;

  if (!secretMode || !publishableMode || secretMode !== publishableMode) {
    throw new Error(
      "Stripe secret and publishable keys must both be test keys or both be live keys.",
    );
  }

  return secretMode;
}
