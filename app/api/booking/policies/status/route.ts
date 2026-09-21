import { NextRequest, NextResponse } from "next/server";

import {
  guestPolicySummary,
  propertyPolicyReference,
  reservationPolicyReadiness,
} from "@/lib/policies/booking-policy";
import {
  CANCELLATION_POLICY_VERSION,
  GUEST_TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "@/lib/policies/versions";
import {
  guestCheckoutTokenMatches,
  guestFacingBookingError,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const body = (await request.json()) as {
      reservationId?: string;
      checkoutToken?: string;
    };
    const reservationId = body.reservationId?.trim() || "";
    const checkoutToken = body.checkoutToken?.trim() || "";

    if (!reservationId || !guestCheckoutTokenMatches(reservationId, checkoutToken)) {
      return NextResponse.json({ error: "Booking access could not be verified." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: reservation, error } = await admin
      .from("reservations")
      .select("id,status,hold_expires_at,guest_email,policy_snapshot")
      .eq("id", reservationId)
      .maybeSingle();

    if (error || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (
      reservation.hold_expires_at &&
      new Date(reservation.hold_expires_at).getTime() <= Date.now() &&
      reservation.status !== "CONFIRMED"
    ) {
      return NextResponse.json(
        { error: "This booking hold expired. Choose the dates again." },
        { status: 409 },
      );
    }

    const reference = propertyPolicyReference(reservation.policy_snapshot);
    let documentUrl: string | null = null;

    if (reference.storagePath) {
      const { data: signed } = await admin.storage
        .from("property-documents")
        .createSignedUrl(reference.storagePath, 1800);
      documentUrl = signed?.signedUrl ?? null;
    }

    const readiness = await reservationPolicyReadiness(admin, reservationId);

    return NextResponse.json({
      ...readiness,
      propertyPolicies: guestPolicySummary(reservation.policy_snapshot),
      propertyDocument: reference.id
        ? {
            id: reference.id,
            version: reference.version,
            originalName: reference.originalName,
            url: documentUrl,
          }
        : null,
      platform: {
        termsVersion: GUEST_TERMS_VERSION,
        cancellationPolicyVersion: CANCELLATION_POLICY_VERSION,
        privacyVersion: PRIVACY_NOTICE_VERSION,
        termsUrl: "/terms",
        cancellationUrl: "/cancellation-policy",
        privacyUrl: "/privacy",
      },
    });
  } catch (error) {
    console.error("[booking policy status]", error);
    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to load booking policies. Refresh and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
