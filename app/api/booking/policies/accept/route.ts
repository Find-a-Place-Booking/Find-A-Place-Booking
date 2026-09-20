import { NextRequest, NextResponse } from "next/server";

import { propertyPolicyReference } from "@/lib/policies/booking-policy";
import {
  CANCELLATION_POLICY_VERSION,
  GUEST_TERMS_VERSION,
} from "@/lib/policies/versions";
import { guestCheckoutTokenMatches, sameOrigin } from "@/lib/payments/booking-runtime";
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
    const [{ data: reservation, error: reservationError }, { data: acceptance, error: acceptanceError }] =
      await Promise.all([
        admin
          .from("reservations")
          .select("id,status,hold_expires_at,guest_email,policy_snapshot")
          .eq("id", reservationId)
          .maybeSingle(),
        admin
          .from("reservation_policy_acceptances")
          .select(
            "reservation_id,platform_terms_version,cancellation_policy_version,property_policy_opened_at,platform_terms_opened_at,accepted_at",
          )
          .eq("reservation_id", reservationId)
          .maybeSingle(),
      ]);

    if (reservationError || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }
    if (acceptanceError) throw new Error(acceptanceError.message);

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

    if (
      !acceptance?.property_policy_opened_at ||
      !acceptance?.platform_terms_opened_at
    ) {
      return NextResponse.json(
        { error: "Open the property policies and Find A Place terms before agreeing." },
        { status: 409 },
      );
    }

    if (
      acceptance.platform_terms_version !== GUEST_TERMS_VERSION ||
      acceptance.cancellation_policy_version !== CANCELLATION_POLICY_VERSION
    ) {
      return NextResponse.json(
        { error: "The booking terms changed. Review the current terms before agreeing." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const reference = propertyPolicyReference(reservation.policy_snapshot);
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || null;

    const { error: updateError } = await admin
      .from("reservation_policy_acceptances")
      .update({
        accepted_at: now,
        accepted_guest_email: reservation.guest_email,
        property_policy_document_id: reference.id,
        property_policy_document_version: reference.version,
        user_agent: userAgent,
        updated_at: now,
      })
      .eq("reservation_id", reservationId);

    if (updateError) throw new Error(updateError.message);

    await admin.from("reservation_events").insert({
      reservation_id: reservationId,
      event_type: "GUEST_POLICIES_ACCEPTED",
      actor_profile_id: null,
      metadata: {
        platform_terms_version: GUEST_TERMS_VERSION,
        cancellation_policy_version: CANCELLATION_POLICY_VERSION,
        property_policy_document_id: reference.id,
        property_policy_document_version: reference.version,
      },
    });

    return NextResponse.json({ accepted: true, acceptedAt: now });
  } catch (error) {
    console.error("[booking policy accept]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to accept booking policies.",
      },
      { status: 500 },
    );
  }
}
