import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { syncOnboardingPropertyMapLocation } from "@/lib/host/finalize-onboarding-property";
import {
  sameOrigin,
  stripeEnvironment,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      organizationId?: string;
    };
    const organizationId = body.organizationId?.trim() || "";

    if (!UUID_RE.test(organizationId)) {
      return NextResponse.json(
        { error: "Host organization is invalid." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();

    if (!claims?.claims?.sub) {
      return NextResponse.json(
        { error: "Sign in again to finish host setup." },
        { status: 401 },
      );
    }

    const { data: preparedData, error: preparedError } = await supabase.rpc(
      "prepare_onboarding_property",
      { target_organization_id: organizationId },
    );

    if (preparedError) {
      return NextResponse.json(
        { error: preparedError.message },
        { status: 409 },
      );
    }

    const prepared = Array.isArray(preparedData)
      ? preparedData[0]
      : preparedData;

    if (!prepared?.property_id || !prepared?.unit_id) {
      return NextResponse.json(
        { error: "The onboarding property is not ready." },
        { status: 409 },
      );
    }

    const admin = createAdminClient();
    const environment = stripeEnvironment();

    const [{ data: stripeAccount, error: stripeError }, imageResult] =
      await Promise.all([
        admin
          .from("payment_accounts")
          .select(
            "id,status,charges_enabled,payouts_enabled,provider_account_id",
          )
          .eq("organization_id", organizationId)
          .eq("provider", "STRIPE")
          .eq("environment", environment)
          .eq("status", "READY")
          .eq("charges_enabled", true)
          .eq("payouts_enabled", true)
          .not("provider_account_id", "is", null)
          .limit(1)
          .maybeSingle(),
        admin
          .from("property_images")
          .select("id", { count: "exact", head: true })
          .eq("unit_id", prepared.unit_id),
      ]);

    if (stripeError) {
      console.error("[complete host onboarding] Stripe lookup", stripeError);
      return NextResponse.json(
        { error: "Unable to verify the Stripe connection." },
        { status: 500 },
      );
    }

    if (!stripeAccount) {
      return NextResponse.json(
        {
          error:
            "Finish Stripe Connect before completing host setup. The account must be ready to accept guest payments.",
          code: "STRIPE_NOT_READY",
        },
        { status: 409 },
      );
    }

    if (imageResult.error) {
      console.error("[complete host onboarding] photo count", imageResult.error);
      return NextResponse.json(
        { error: "Unable to verify the saved property photos." },
        { status: 500 },
      );
    }

    if (!imageResult.count) {
      return NextResponse.json(
        {
          error:
            "Upload at least one real property photo before completing host setup.",
          code: "PHOTO_REQUIRED",
        },
        { status: 409 },
      );
    }

    const { data: propertyData, error: propertyError } = await supabase.rpc(
      "create_property_from_onboarding",
      { target_organization_id: organizationId },
    );

    if (propertyError) {
      console.error("[complete host onboarding] finalize RPC", {
        code: propertyError.code,
        message: propertyError.message,
        details: propertyError.details,
        hint: propertyError.hint,
      });
      return NextResponse.json(
        { error: propertyError.message || "Unable to finish host setup." },
        { status: 409 },
      );
    }

    const property = Array.isArray(propertyData)
      ? propertyData[0]
      : propertyData;

    if (!property?.property_id || !property?.slug) {
      return NextResponse.json(
        { error: "Host setup finished without a property reference." },
        { status: 500 },
      );
    }

    try {
      await syncOnboardingPropertyMapLocation(property.property_id);
    } catch (mapError) {
      console.error(
        "[complete host onboarding] map geocode failed",
        mapError,
      );
    }

    revalidatePath("/host");
    revalidatePath("/host/onboarding");
    revalidatePath("/host/properties");
    revalidatePath(`/host/properties/${property.slug}`);
    revalidatePath("/admin");
    revalidatePath("/admin/properties");

    return NextResponse.json({
      ok: true,
      propertyId: property.property_id,
      unitId: property.unit_id,
      slug: property.slug,
    });
  } catch (error) {
    console.error("[complete host onboarding]", error);
    return NextResponse.json(
      { error: "Unable to finish host setup. Refresh and try again." },
      { status: 500 },
    );
  }
}
