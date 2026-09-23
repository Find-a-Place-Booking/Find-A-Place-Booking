import { NextResponse } from "next/server";

import {
  createAccountSession,
  createEmbeddedMerchantAccount,
} from "@/lib/payments/stripe-rest";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STRIPE_ACCOUNT_SCHEMA =
  "accounts_v2_merchant_full_stripe_responsibility_direct_charge_v1";

function jsonError(error: unknown, status = 500) {
  const message =
    error instanceof Error ? error.message : "Unable to start Stripe onboarding.";

  console.error("[stripe connect account-session]", error);
  return NextResponse.json({ error: message }, { status });
}

function usablePublicOrigin(request: Request, environment: "TEST" | "LIVE") {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const candidates = [configured, new URL(request.url).origin].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      const local =
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "::1";

      if (local) continue;
      if (environment === "LIVE" && url.protocol !== "https:") continue;

      return url.origin;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function getStripeBusinessProfile(input: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  displayName: string;
  request: Request;
  environment: "TEST" | "LIVE";
}) {
  const { data: property, error: propertyError } = await input.admin
    .from("properties")
    .select("id,name,description,status,published_at")
    .eq("organization_id", input.organizationId)
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (propertyError) {
    throw new Error(
      `Unable to load the host's public listing for Stripe: ${propertyError.message}`,
    );
  }

  let businessUrl: string | null = null;

  if (property?.id) {
    const { data: unit, error: unitError } = await input.admin
      .from("property_units")
      .select("slug")
      .eq("property_id", property.id)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();

    if (unitError) {
      throw new Error(
        `Unable to load the host's public listing URL for Stripe: ${unitError.message}`,
      );
    }

    const origin = usablePublicOrigin(input.request, input.environment);
    if (origin && unit?.slug) {
      businessUrl = `${origin}/stays/${encodeURIComponent(unit.slug)}`;
    }
  }

  const listingName =
    typeof property?.name === "string" && property.name.trim()
      ? property.name.trim()
      : input.displayName;

  const productDescription =
    `${input.displayName} offers short-term vacation rental and lodging ` +
    `accommodations through Find A Place Booking. Guests can book stays ` +
    `such as ${listingName} through the Find A Place platform.`;

  return {
    businessUrl,
    productDescription,
  };
}

export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { organizationId?: string }
      | null;

    const organizationId = body?.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing organization reference." },
        { status: 400 },
      );
    }

    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("status", "ACTIVE")
      .in("role", ["OWNER", "MANAGER"])
      .maybeSingle();

    if (membershipError) {
      throw new Error(`Unable to verify host access: ${membershipError.message}`);
    }

    if (!membership) {
      return NextResponse.json(
        { error: "Organization owner or manager access required." },
        { status: 403 },
      );
    }

    const { data: organization, error: organizationError } = await userClient
      .from("organizations")
      .select("id,name,contact_email")
      .eq("id", organizationId)
      .single();

    if (organizationError || !organization) {
      throw new Error(
        `Unable to load host organization: ${
          organizationError?.message ?? "Organization not found"
        }`,
      );
    }

    const email = (organization.contact_email || user.email || "").trim();
    if (!email) {
      return NextResponse.json(
        { error: "A host contact email is required before connecting Stripe." },
        { status: 400 },
      );
    }

    const displayName = (organization.name || "Find A Place host").trim();
    const admin = createAdminClient();
    const environment = stripeEnvironment();

    const { data: existing, error: existingError } = await admin
      .from("payment_accounts")
      .select("id,provider_account_id,status,is_default,metadata")
      .eq("organization_id", organizationId)
      .eq("provider", "STRIPE")
      .eq("environment", environment)
      .neq("status", "DISABLED")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Unable to load Stripe payment account: ${existingError.message}`,
      );
    }

    const existingMetadata =
      existing?.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const isDirectMerchant =
      existingMetadata.account_configuration === "merchant" &&
      existingMetadata.charge_model === "DIRECT";

    let paymentAccountId = isDirectMerchant ? existing?.id ?? null : null;
    let providerAccountId = isDirectMerchant
      ? existing?.provider_account_id ?? null
      : null;

    if (!providerAccountId) {
      const businessProfile = await getStripeBusinessProfile({
        admin,
        organizationId,
        displayName,
        request,
        environment,
      });

      const stripeAccount = await createEmbeddedMerchantAccount({
        email,
        displayName,
        country: "US",
        requestScope: `${organizationId}:${environment}:direct-charge-v1`,
        businessUrl: businessProfile.businessUrl,
        productDescription: businessProfile.productDescription,
      });

      providerAccountId = stripeAccount.id;

      const metadata = {
        source: "stripe_connect_embedded",
        integration_schema: STRIPE_ACCOUNT_SCHEMA,
        api_namespace: "accounts_v2",
        account_configuration: "merchant",
        charge_model: "DIRECT",
        dashboard: "full",
        fees_collector: "stripe",
        losses_collector: "stripe",
        payment_environment: environment,
        payout_schedule: "STRIPE_MANAGED",
        business_profile_source: businessProfile.businessUrl
          ? "FAP_PUBLIC_LISTING"
          : "PRODUCT_DESCRIPTION",
        business_profile_url: businessProfile.businessUrl,
      };

      const replacedPaymentAccountId = existing?.id ?? null;
      const shouldBeDefault = existing?.is_default ?? true;

      if (replacedPaymentAccountId) {
        const { error: disableError } = await admin
          .from("payment_accounts")
          .update({
            status: "DISABLED",
            is_default: false,
            metadata: {
              ...existingMetadata,
              replaced_by_direct_charge_model: true,
              replaced_at: new Date().toISOString(),
            },
          })
          .eq("id", replacedPaymentAccountId);

        if (disableError) {
          throw new Error(
            `Unable to retire the legacy Stripe payout account: ${disableError.message}`,
          );
        }
      }

      const { data: inserted, error: insertError } = await admin
        .from("payment_accounts")
        .insert({
          organization_id: organizationId,
          provider: "STRIPE",
          connection_mode: "STRIPE_CONNECT",
          provider_account_id: providerAccountId,
          environment,
          status: "PENDING",
          is_default: shouldBeDefault,
          country_code: "US",
          currency: "USD",
          charges_enabled: false,
          payouts_enabled: false,
          metadata,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        throw new Error(
          `Unable to save Stripe payment account: ${
            insertError?.message ?? "Unknown database error"
          }`,
        );
      }

      paymentAccountId = inserted.id;

      if (replacedPaymentAccountId) {
        const { error: assignmentError } = await admin
          .from("payment_account_assignments")
          .update({ payment_account_id: paymentAccountId })
          .eq("payment_account_id", replacedPaymentAccountId)
          .eq("environment", environment);

        if (assignmentError) {
          throw new Error(
            `Unable to move property payment routing to the direct-charge account: ${assignmentError.message}`,
          );
        }
      }
    }

    if (!paymentAccountId || !providerAccountId) {
      throw new Error("Stripe payment setup could not be initialized.");
    }

    // For an already-onboarded connected account, do not try to rewrite
    // defaults.profile fields here. Stripe's embedded/hosted onboarding owns
    // those fields after Account Link / Account Session onboarding. The host
    // can edit supported business/public/bank details through the embedded
    // Account Management component instead.
    const session = await createAccountSession(providerAccountId);

    if (!session.client_secret) {
      throw new Error("Stripe did not return an Account Session client secret.");
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      paymentAccountId,
      environment,
      chargeModel: "DIRECT",
    });
  } catch (error) {
    return jsonError(error);
  }
}
