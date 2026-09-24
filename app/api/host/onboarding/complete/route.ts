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

const SUPPORTED_TAX_STATES = new Set([
  "AR",
  "MO",
  "TX",
  "TN",
]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

function parseOnboardingTaxLines(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("The property tax setup is invalid.");
  }

  if (parsed.length > 12) {
    throw new Error(
      "A property can have at most 12 custom tax lines.",
    );
  }

  return parsed.map((line) => ({
    category: String(line?.category || "OTHER")
      .trim()
      .toUpperCase(),
    label: cleanText(line?.label, 160),
    rate_bps: Number(line?.rate_bps || 0),
    base_scope: String(
      line?.base_scope || "ACCOMMODATION_TOTAL",
    )
      .trim()
      .toUpperCase(),
  }));
}

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
    const organizationId =
      body.organizationId?.trim() || "";

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
        {
          error:
            "Sign in again to finish host setup.",
        },
        { status: 401 },
      );
    }

    const { data: preparedData, error: preparedError } =
      await supabase.rpc("prepare_onboarding_property", {
        target_organization_id: organizationId,
      });

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
        {
          error:
            "The onboarding property is not ready.",
        },
        { status: 409 },
      );
    }

    const { data: draft, error: draftError } =
      await supabase
        .from("host_onboarding_drafts")
        .select("form_data")
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (draftError || !draft) {
      return NextResponse.json(
        {
          error:
            "Unable to load the saved onboarding tax setup.",
        },
        { status: 409 },
      );
    }

    const form =
      draft.form_data &&
      typeof draft.form_data === "object" &&
      !Array.isArray(draft.form_data)
        ? (draft.form_data as Record<string, unknown>)
        : {};

    const propertyState = cleanText(
      form.state,
      2,
    ).toUpperCase();

    if (!SUPPORTED_TAX_STATES.has(propertyState)) {
      return NextResponse.json(
        {
          error:
            "This property's state does not have a live statewide tax setup yet. Contact Find A Place before publishing it.",
          code: "TAX_STATE_NOT_READY",
        },
        { status: 409 },
      );
    }

    if (form.taxResponsibilityAccepted !== "true") {
      return NextResponse.json(
        {
          error:
            "Review and confirm the property tax setup before finishing onboarding.",
          code: "TAX_SETUP_REQUIRED",
        },
        { status: 409 },
      );
    }

    let taxLines;
    try {
      taxLines = parseOnboardingTaxLines(
        form.taxLinesJson,
      );
    } catch (taxParseError) {
      return NextResponse.json(
        {
          error:
            taxParseError instanceof Error
              ? taxParseError.message
              : "The property tax setup is invalid.",
          code: "TAX_SETUP_INVALID",
        },
        { status: 409 },
      );
    }

    const { error: taxSetupError } = await supabase.rpc(
      "host_save_property_tax_configuration_v2",
      {
        target_property_id: prepared.property_id,
        county_name_value:
          cleanText(form.taxCounty, 120) || null,
        locality_name_value:
          cleanText(form.taxLocality, 120) ||
          cleanText(form.city, 120) ||
          null,
        tax_lines_value: taxLines,
        responsibility_ack_value: true,
      },
    );

    if (taxSetupError) {
      console.error(
        "[complete host onboarding] tax setup",
        taxSetupError,
      );
      return NextResponse.json(
        {
          error:
            taxSetupError.message ||
            "Unable to save the property tax setup.",
          code: "TAX_SETUP_FAILED",
        },
        { status: 409 },
      );
    }

    const admin = createAdminClient();
    const environment = stripeEnvironment();

    const [
      { data: stripeAccount, error: stripeError },
      imageResult,
    ] = await Promise.all([
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
      console.error(
        "[complete host onboarding] Stripe lookup",
        stripeError,
      );
      return NextResponse.json(
        {
          error:
            "Unable to verify the Stripe connection.",
        },
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
      console.error(
        "[complete host onboarding] photo count",
        imageResult.error,
      );
      return NextResponse.json(
        {
          error:
            "Unable to verify the saved property photos.",
        },
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

    const { data: propertyData, error: propertyError } =
      await supabase.rpc(
        "create_property_from_onboarding",
        {
          target_organization_id: organizationId,
        },
      );

    if (propertyError) {
      console.error(
        "[complete host onboarding] finalize RPC",
        {
          code: propertyError.code,
          message: propertyError.message,
          details: propertyError.details,
          hint: propertyError.hint,
        },
      );
      return NextResponse.json(
        {
          error:
            propertyError.message ||
            "Unable to finish host setup.",
        },
        { status: 409 },
      );
    }

    const property = Array.isArray(propertyData)
      ? propertyData[0]
      : propertyData;

    if (!property?.property_id || !property?.slug) {
      return NextResponse.json(
        {
          error:
            "Host setup finished without a property reference.",
        },
        { status: 500 },
      );
    }

    try {
      await syncOnboardingPropertyMapLocation(
        property.property_id,
      );
    } catch (mapError) {
      console.error(
        "[complete host onboarding] map geocode failed",
        mapError,
      );
    }

    let published = false;
    let publicationMessage: string | null = null;

    const { error: publicationError } =
      await supabase.rpc("host_publish_property", {
        target_property_id: property.property_id,
      });

    if (publicationError) {
      publicationMessage = publicationError.message;
      console.info(
        "[complete host onboarding] property remains draft",
        publicationError.message,
      );
    } else {
      published = true;
    }

    revalidatePath("/");
    revalidatePath("/stays");
    revalidatePath(`/stays/${property.slug}`);
    revalidatePath("/sitemap.xml");
    revalidatePath("/host");
    revalidatePath("/host/onboarding");
    revalidatePath("/host/properties");
    revalidatePath(
      `/host/properties/${property.slug}`,
    );
    revalidatePath("/host/payments");
    revalidatePath("/admin");
    revalidatePath("/admin/properties");
    revalidatePath("/admin/taxes");

    return NextResponse.json({
      ok: true,
      propertyId: property.property_id,
      unitId: property.unit_id,
      slug: property.slug,
      published,
      publicationMessage,
    });
  } catch (error) {
    console.error(
      "[complete host onboarding]",
      error,
    );
    return NextResponse.json(
      {
        error:
          "Unable to finish host setup. Refresh and try again.",
      },
      { status: 500 },
    );
  }
}
