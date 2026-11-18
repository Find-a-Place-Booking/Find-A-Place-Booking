import { NextRequest, NextResponse } from "next/server";
import { guestPolicySummary, propertyPolicyReference, reservationPolicyReadiness } from "@/lib/policies/booking-policy";
import { getCurrentPolicyVersions } from "@/lib/policies/current";
import { guestCheckoutTokenMatches, guestFacingBookingError, sameOrigin } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { securityDepositPaymentsEnabled } from "@/lib/payments/security-deposit-toggle";
import { rentalSignatureEnabled } from "@/lib/policies/rental-signature-toggle";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const body = await request.json() as { reservationId?: string; checkoutToken?: string };
    const reservationId = body.reservationId?.trim() || "";
    if (!reservationId || !guestCheckoutTokenMatches(reservationId, body.checkoutToken))
      return NextResponse.json({ error: "Booking access could not be verified." }, { status: 403 });
    const admin = createAdminClient();
    const [{ data: reservation, error }, currentVersions] = await Promise.all([
      admin.from("reservations").select("id,status,hold_expires_at,guest_email,policy_snapshot,unit_id")
        .eq("id", reservationId).maybeSingle(),
      getCurrentPolicyVersions(admin),
    ]);
    if (error || !reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    if (reservation.hold_expires_at && new Date(reservation.hold_expires_at).getTime() <= Date.now() && reservation.status !== "CONFIRMED")
      return NextResponse.json({ error: "This booking hold expired. Choose the dates again." }, { status: 409 });
    const reference = propertyPolicyReference(reservation.policy_snapshot);
    let documentUrl: string | null = null;
    if (reference.storagePath) {
      const { data: signed } = await admin.storage.from("property-documents").createSignedUrl(reference.storagePath, 1800);
      documentUrl = signed?.signedUrl ?? null;
      if (rentalSignatureEnabled() && reservation.status !== "CONFIRMED" && !documentUrl) {
        throw new Error("The host's agreement PDF cannot be loaded. Try again or contact the host.");
      }
    }
    const readiness = await reservationPolicyReadiness(admin, reservationId);
    let disclosed: { amount_cents: number; terms_snapshot: string } | null = null;
    if (securityDepositPaymentsEnabled()) {
      const [{ data: depositPolicy, error: policyError }, { data: alreadyShown, error: disclosureError }] = await Promise.all([
        admin.from("unit_security_deposit_settings")
          .select("enabled,amount_cents,terms,due_days_before_arrival,refund_days_after_checkout")
          .eq("unit_id", reservation.unit_id).maybeSingle(),
        admin.from("reservation_deposit_disclosures")
          .select("amount_cents,terms_snapshot")
          .eq("reservation_id", reservationId).maybeSingle(),
      ]);
      if (policyError || disclosureError) throw new Error("Unable to load security deposit policy.");
      disclosed = alreadyShown;
      if (!disclosed && depositPolicy?.enabled && depositPolicy.amount_cents > 0 && reservation.status !== "CONFIRMED") {
        const { error: insertError } = await admin.from("reservation_deposit_disclosures").insert({
          reservation_id: reservationId, unit_id: reservation.unit_id,
          amount_cents: depositPolicy.amount_cents,
          terms_snapshot: depositPolicy.terms || "",
          due_days_before_arrival: depositPolicy.due_days_before_arrival,
          refund_days_after_checkout: depositPolicy.refund_days_after_checkout,
        });
        if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
        const { data: saved } = await admin.from("reservation_deposit_disclosures")
          .select("amount_cents,terms_snapshot")
          .eq("reservation_id", reservationId).maybeSingle();
        disclosed = saved;
      }
    }
    return NextResponse.json({
      ...readiness,
      propertyPolicies: guestPolicySummary(reservation.policy_snapshot),
      propertyDocument: reference.id ? {
        id: reference.id, version: reference.version, originalName: reference.originalName, url: documentUrl,
      } : null,
      securityDeposit: disclosed ? { amountCents: disclosed.amount_cents, terms: disclosed.terms_snapshot } : null,
      platform: {
        termsVersion: currentVersions.guestTerms.version,
        cancellationPolicyVersion: currentVersions.cancellationPolicy.version,
        privacyVersion: currentVersions.privacyNotice.version,
        termsUrl: "/terms", cancellationUrl: "/cancellation-policy", privacyUrl: "/privacy",
      },
    });
  } catch (error) {
    console.error("[booking policy status]", error);
    return NextResponse.json({ error: guestFacingBookingError(error, "Unable to load booking policies. Refresh and try again.") }, { status: 500 });
  }
}
