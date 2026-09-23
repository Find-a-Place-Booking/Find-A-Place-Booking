import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { getStripeClient } from "@/lib/payments/stripe-checkout";

export type ReservationVerificationRow = {
  id: string;
  confirmation_code?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_email_verified_at?: string | null;
  stripe_identity_verification_session_id?: string | null;
  identity_verification_status?: string | null;
  identity_verified_at?: string | null;
};

function verificationSecret() {
  const value = process.env.BOOKING_GUEST_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error(
      "BOOKING_GUEST_TOKEN_SECRET must be configured with at least 32 characters.",
    );
  }
  return value;
}

export function guestIdentityVerificationRequired() {
  const value =
    process.env.BOOKING_IDENTITY_VERIFICATION_REQUIRED?.trim().toLowerCase() ||
    "";

  return ["1", "true", "yes", "on"].includes(value);
}

export function normalizeGuestEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function createGuestEmailCode() {
  return String(randomInt(100000, 1000000));
}

export function guestEmailCodeHash(input: {
  reservationId: string;
  email: string;
  code: string;
}) {
  return createHmac("sha256", verificationSecret())
    .update(
      `find-a-place:guest-email:${input.reservationId}:${normalizeGuestEmail(
        input.email,
      )}:${input.code}`,
      "utf8",
    )
    .digest("hex");
}

export function guestEmailCodeMatches(input: {
  reservationId: string;
  email: string;
  code: string;
  expectedHash: string;
}) {
  const candidate = Buffer.from(
    guestEmailCodeHash({
      reservationId: input.reservationId,
      email: input.email,
      code: input.code,
    }),
    "hex",
  );

  let expected: Buffer;
  try {
    expected = Buffer.from(input.expectedHash, "hex");
  } catch {
    return false;
  }

  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export function maskedEmail(value: string | null | undefined) {
  const email = normalizeGuestEmail(value);
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email";

  const visible = local.length <= 2 ? local[0] || "" : local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}`;
}

export function identityPlatformCostCents() {
  if (stripeEnvironment() === "TEST") return 0;

  const configured = process.env.STRIPE_IDENTITY_COST_CENTS;
  const value = configured == null || configured === "" ? 150 : Number(configured);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error("STRIPE_IDENTITY_COST_CENTS must be zero or a positive integer.");
  }

  return Math.round(value);
}

export function canonicalIdentityStatus(
  status: string,
) {
  switch (status) {
    case "verified":
      return "VERIFIED";
    case "processing":
      return "PROCESSING";
    case "canceled":
      return "CANCELED";
    default:
      return "REQUIRES_INPUT";
  }
}

function sessionMatchesEnvironment(session: { livemode: boolean }) {
  return session.livemode === (stripeEnvironment() === "LIVE");
}

export async function syncIdentityVerification(
  admin: SupabaseClient,
  reservation: ReservationVerificationRow,
) {
  const sessionId = reservation.stripe_identity_verification_session_id?.trim();
  if (!sessionId) {
    return {
      ready: false as const,
      status: "NOT_STARTED",
      session: null,
      error: "Identity verification has not been started.",
    };
  }

  const stripe = getStripeClient();
  const session = await stripe.identity.verificationSessions.retrieve(sessionId);

  if (!sessionMatchesEnvironment(session)) {
    throw new Error("Identity verification environment does not match checkout.");
  }

  if (session.metadata?.reservation_id !== reservation.id) {
    throw new Error("Identity verification does not belong to this reservation.");
  }

  const status = canonicalIdentityStatus(session.status);
  const update: Record<string, unknown> = {
    identity_verification_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === "VERIFIED") {
    update.identity_verified_at =
      reservation.identity_verified_at || new Date().toISOString();
    update.identity_verification_platform_cost_cents =
      identityPlatformCostCents();
  }

  const { error: updateError } = await admin
    .from("reservations")
    .update(update)
    .eq("id", reservation.id);

  if (updateError) {
    throw new Error(
      `Unable to save guest identity verification: ${updateError.message}`,
    );
  }

  if (status === "VERIFIED") {
    return {
      ready: true as const,
      status,
      session,
      error: null,
    };
  }

  const reason = session.last_error?.reason?.trim();
  return {
    ready: false as const,
    status,
    session,
    error:
      reason ||
      (status === "PROCESSING"
        ? "Stripe is still processing the identity verification."
        : status === "CANCELED"
          ? "Identity verification was canceled."
          : "Identity verification still needs to be completed."),
  };
}

export async function reservationVerificationReadiness(
  admin: SupabaseClient,
  reservation: ReservationVerificationRow,
) {
  const phonePresent = Boolean(reservation.guest_phone?.trim());
  const emailVerified = Boolean(reservation.guest_email_verified_at);
  const identityRequired = guestIdentityVerificationRequired();
  const storedIdentityStatus =
    reservation.identity_verification_status || "NOT_STARTED";
  const storedIdentityVerified =
    Boolean(reservation.identity_verified_at) ||
    storedIdentityStatus === "VERIFIED";

  if (!phonePresent) {
    return {
      ready: false as const,
      phonePresent,
      emailVerified,
      identityRequired,
      identityVerified: storedIdentityVerified,
      identityStatus: storedIdentityStatus,
      error: "A phone number is required before payment.",
    };
  }

  if (!emailVerified) {
    return {
      ready: false as const,
      phonePresent,
      emailVerified,
      identityRequired,
      identityVerified: storedIdentityVerified,
      identityStatus: storedIdentityStatus,
      error: "Verify the booking email before payment.",
    };
  }

  // Identity infrastructure is intentionally preserved, but it is no longer a
  // booking gate by default. Set BOOKING_IDENTITY_VERIFICATION_REQUIRED=true
  // to restore the previous ID + selfie requirement without a schema change.
  if (!identityRequired) {
    return {
      ready: true as const,
      phonePresent,
      emailVerified,
      identityRequired,
      identityVerified: storedIdentityVerified,
      identityStatus: storedIdentityStatus,
      error: null,
    };
  }

  if (!reservation.stripe_identity_verification_session_id) {
    return {
      ready: false as const,
      phonePresent,
      emailVerified,
      identityRequired,
      identityVerified: false,
      identityStatus: "NOT_STARTED",
      error: "Complete identity verification before payment.",
    };
  }

  const identity = await syncIdentityVerification(admin, reservation);

  return {
    ready: identity.ready,
    phonePresent,
    emailVerified,
    identityRequired,
    identityVerified: identity.ready,
    identityStatus: identity.status,
    error: identity.error,
  };
}
