import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Development/operations smoke check for the current verified Supabase schema.
 *
 * Tables remain protected by RLS. The request only proves that the application
 * can reach the expected project and that the pricing/stay-rule schema exists on top of the verified review/publication foundation. No row contents or secrets are returned.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        configured: false,
        message: "Supabase environment variables are not configured.",
      },
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
    ]);

    const error = profileError ?? onboardingError ?? propertyError ?? unitError ?? reviewError ?? publicCatalogError ?? rateRuleError ?? stayRuleError ?? addOnError ?? promotionError;
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          service: "supabase",
          configured: true,
          message: "Supabase is reachable, but the current schema check failed.",
          code: error.code ?? null,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      service: "supabase",
      configured: true,
      schema: "pricing-promotions-hardening-v1",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "supabase",
        configured: true,
        message: "Supabase connection check failed.",
      },
      { status: 503 },
    );
  }
}
