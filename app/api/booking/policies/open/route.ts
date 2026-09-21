import { NextRequest, NextResponse } from "next/server";

import { propertyPolicyReference } from "@/lib/policies/booking-policy";
import {
  CANCELLATION_POLICY_VERSION,
  GUEST_TERMS_VERSION,
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
      kind?: "property" | "platform";
    };
    const reservationId = body.reservationId?.trim() || "";
    const checkoutToken = body.checkoutToken?.trim() || "";
    const kind = body.kind;

    if (!reservationId || !guestCheckoutTokenMatches(reservationId, checkoutToken)) {
      return NextResponse.json({ error: "Booking access could not be verified." }, { status: 403 });
    }
    if (kind !== "property" && kind !== "platform") {
      return NextResponse.json({ error: "Invalid policy review type." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: reservation, error } = await admin
      .from("reservations")
      .select("id,status,hold_expires_at,policy_snapshot")
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
    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await admin
      .from("reservation_policy_acceptances")
      .select("reservation_id,platform_terms_version,cancellation_policy_version")
      .eq("reservation_id", reservationId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const row = {
      platform_terms_version: GUEST_TERMS_VERSION,
      cancellation_policy_version: CANCELLATION_POLICY_VERSION,
      property_policy_document_id: reference.id,
      property_policy_document_version: reference.version,
      updated_at: now,
      ...(kind === "property"
        ? { property_policy_opened_at: now }
        : { platform_terms_opened_at: now }),
    };

    if (existing) {
      const versionChanged =
        existing.platform_terms_version !== GUEST_TERMS_VERSION ||
        existing.cancellation_policy_version !== CANCELLATION_POLICY_VERSION;
      const resetOpenings = versionChanged
        ? {
            accepted_at: null,
            property_policy_opened_at: kind === "property" ? now : null,
            platform_terms_opened_at: kind === "platform" ? now : null,
          }
        : {};
      const { error: updateError } = await admin
        .from("reservation_policy_acceptances")
        .update({ ...row, ...resetOpenings })
        .eq("reservation_id", reservationId);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await admin
        .from("reservation_policy_acceptances")
        .insert({ reservation_id: reservationId, ...row });
      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ ok: true, kind, openedAt: now });
  } catch (error) {
    console.error("[booking policy opened]", error);
    return NextResponse.json(
      {
        error:
          guestFacingBookingError(
            error,
            "Unable to record the policy review. Refresh and try again.",
          ),
      },
      { status: 500 },
    );
  }
}
