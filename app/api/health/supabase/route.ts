import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Development/operations smoke check for the current verified Supabase schema.
 * Tables remain protected by RLS. No row contents or secrets are returned.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, service: "supabase", configured: false, message: "Supabase environment variables are not configured." },
      { status: 503 },
    );
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
      { data: reservationVersion, error: reservationVersionError },
      { data: hardeningVersion, error: hardeningVersionError },
    ] = await Promise.all([
      supabase.from("profiles").select("id,avatar_storage_path").limit(1),
      supabase.from("host_onboarding_drafts").select("id").limit(1),
      supabase.from("properties").select("id").limit(1),
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
      supabase.from("reservations").select("id,status,payment_status").limit(1),
      supabase.from("payment_accounts").select("id,provider,status").limit(1),
      supabase.from("payments").select("id,provider,status").limit(1),
      supabase.from("refunds").select("id,status").limit(1),
      supabase.from("financial_ledger_entries").select("id,entry_type").limit(1),
      supabase.from("processor_events").select("id,provider,processing_status").limit(1),
      supabase.rpc("reservation_payment_foundation_version"),
      supabase.rpc("reservation_payment_hardening_version"),
    ]);

    const error = profileError ?? onboardingError ?? propertyError ?? unitError ?? reviewError ?? publicCatalogError ?? rateRuleError ?? stayRuleError ?? addOnError ?? promotionError ?? connectionError ?? blockError ?? exportTokenError ?? syncRunError ?? calendarVersionError ?? reservationError ?? paymentAccountError ?? paymentError ?? refundError ?? ledgerError ?? processorEventError ?? reservationVersionError ?? hardeningVersionError;
    if (error) {
      return NextResponse.json(
        { ok: false, service: "supabase", configured: true, message: "Supabase is reachable, but the current schema check failed.", code: error.code ?? null },
        { status: 503 },
      );
    }

    if (
      calendarVersion !== "calendar-availability-hardening-v1"
      || reservationVersion !== "reservation-payment-foundation-v1"
      || hardeningVersion !== "reservation-payment-hardening-v1"
    ) {
      return NextResponse.json(
        { ok: false, service: "supabase", configured: true, message: "Supabase is reachable, but the reservation/payment hardening migration is not current." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      service: "supabase",
      configured: true,
      schema: hardeningVersion,
      reservation_schema: reservationVersion,
      calendar_schema: calendarVersion,
      live_money_enabled: false,
    });
  } catch {
    return NextResponse.json(
      { ok: false, service: "supabase", configured: true, message: "Supabase connection check failed." },
      { status: 503 },
    );
  }
}
