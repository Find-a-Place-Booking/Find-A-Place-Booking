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
      const stripeAccount = await createEmbeddedMerchantAccount({
        email,
        displayName,
        country: "US",
        requestScope: `${organizationId}:${environment}:direct-charge-v1`,
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
