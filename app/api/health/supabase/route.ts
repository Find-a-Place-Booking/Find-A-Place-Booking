import { NextRequest, NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Development/operations smoke check for the current verified Supabase schema. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, service: "supabase", configured: false, message: "Supabase environment variables are not configured." }, { status: 503 });
  }

  try {
    const supabase = await createClient();
    const [
      { error: profileError },
      { error: onboardingError },
      { error: propertyError },
      { error: unitError },
      { error: reviewError },
      { error: publicCatalogError },
      { error: rateRuleError },
      { error: stayRuleError },
      { error: addOnError },
      { error: promotionError },
      { error: connectionError },
      { error: blockError },
      { error: exportTokenError },
      { error: syncRunError },
      { data: calendarVersion, error: calendarVersionError },
      { error: reservationError },
      { error: paymentAccountError },
      { error: paymentError },
      { error: refundError },
      { error: ledgerError },
      { error: processorEventError },
      { error: notificationDeliveryError },
      { error: verificationError },
      { error: policyAcceptanceError },
      { error: payoutError },
      { error: taxProfileError },
      { data: reservationVersion, error: reservationVersionError },
      { data: hardeningVersion, error: hardeningVersionError },
      { data: preLiveVersion, error: preLiveVersionError },
      { data: liveSafetyVersion, error: liveSafetyVersionError },
      { data: finalRegressionVersion, error: finalRegressionVersionError },
      { data: pilotReadinessVersion, error: pilotReadinessVersionError },
    ] = await Promise.all([
      supabase.from("profiles").select("id,avatar_storage_path").limit(1),
      supabase.from("host_onboarding_drafts").select("id").limit(1),
      supabase.from("properties").select("id,live_checkout_enabled,time_zone").limit(1),
      supabase.from("property_units").select("id").limit(1),
      supabase.from("property_review_events").select("id").limit(1),
      supabase.rpc("public_listing_index"),
      supabase.from("unit_rate_rules").select("id").limit(1),
      supabase.from("unit_stay_rules").select("id").limit(1),
      supabase.from("unit_add_ons").select("id").limit(1),
      supabase.from("promotion_codes").select("id,allow_with_public_special,archived_at").limit(1),
      supabase.from("calendar_connections").select("id,sync_status").limit(1),
      supabase.from("availability_blocks").select("id,block_type,state,reservation_id").limit(1),
      supabase.from("calendar_export_tokens").select("id").limit(1),
      supabase.from("calendar_sync_runs").select("id,status").limit(1),
      supabase.rpc("calendar_hardening_version"),
      supabase.from("reservations").select("id,status,payment_status,payment_environment,tax_provider,tax_provider_calculation_id,tax_provider_transaction_id,guest_email_verified_at,identity_verification_status").limit(1),
      supabase.from("payment_accounts").select("id,provider,status,environment").limit(1),
      supabase.from("payments").select("id,provider,status,payment_environment").limit(1),
      supabase.from("refunds").select("id,status,payment_environment").limit(1),
      supabase.from("financial_ledger_entries").select("id,entry_type").limit(1),
      supabase.from("processor_events").select("id,provider,payment_environment,processing_status").limit(1),
      supabase.from("notification_deliveries").select("id,status,notification_type,subject,text_body,html_body").limit(1),
      supabase.from("guest_email_verifications").select("reservation_id,verified_at,attempt_count").limit(1),
      supabase.from("reservation_policy_acceptances").select("reservation_id,accepted_at,platform_terms_version").limit(1),
      supabase.from("reservation_payouts").select("id,status,payment_environment,cancellation_cutoff_at,payout_eligible_at").limit(1),
      supabase.from("property_tax_profiles").select("property_id,verification_status").limit(1),
      supabase.rpc("reservation_payment_foundation_version"),
      supabase.rpc("reservation_payment_hardening_version"),
      supabase.rpc("pre_live_hardening_version"),
      supabase.rpc("live_safety_hardening_version"),
      supabase.rpc("final_regression_version"),
      supabase.rpc("pilot_readiness_cleanup_version"),
    ]);

    const error = profileError ?? onboardingError ?? propertyError ?? unitError ?? reviewError ?? publicCatalogError ?? rateRuleError ?? stayRuleError ?? addOnError ?? promotionError ?? connectionError ?? blockError ?? exportTokenError ?? syncRunError ?? calendarVersionError ?? reservationError ?? paymentAccountError ?? paymentError ?? refundError ?? ledgerError ?? processorEventError ?? notificationDeliveryError ?? verificationError ?? policyAcceptanceError ?? payoutError ?? taxProfileError ?? reservationVersionError ?? hardeningVersionError ?? preLiveVersionError ?? liveSafetyVersionError ?? finalRegressionVersionError ?? pilotReadinessVersionError;

    if (error) {
      return NextResponse.json({ ok: false, service: "supabase", configured: true, message: "Supabase is reachable, but the current schema check failed.", code: error.code ?? null }, { status: 503 });
    }

    if (
      calendarVersion !== "calendar-availability-hardening-v1" ||
      reservationVersion !== "reservation-payment-foundation-v1" ||
      hardeningVersion !== "reservation-payment-hardening-v1" ||
      preLiveVersion !== "pre-live-hardening-026-v1" ||
      liveSafetyVersion !== "live-safety-hardening-046-v1" ||
      finalRegressionVersion !== "final-regression-049-v1" ||
      pilotReadinessVersion !== "pilot-readiness-cleanup-050-v1"
    ) {
      return NextResponse.json({ ok: false, service: "supabase", configured: true, message: "Supabase is reachable, but the current hardening migrations are not complete." }, { status: 503 });
    }

    const liveKeys = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
    const checkoutEnabled = process.env.BOOKING_CHECKOUT_ENABLED === "true";
    return NextResponse.json({
      ok: true,
      service: "supabase",
      configured: true,
      schema: hardeningVersion,
      pre_live_schema: preLiveVersion,
      live_safety_schema: liveSafetyVersion,
      final_regression_schema: finalRegressionVersion,
      pilot_readiness_schema: pilotReadinessVersion,
      reservation_schema: reservationVersion,
      calendar_schema: calendarVersion,
      live_money_enabled: checkoutEnabled && liveKeys,
    });
  } catch {
    return NextResponse.json({ ok: false, service: "supabase", configured: true, message: "Supabase connection check failed." }, { status: 503 });
  }
}
