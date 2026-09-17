import { NextResponse } from "next/server";

import {
  createAccountSession,
  createEmbeddedRecipientAccount,
} from "@/lib/payments/stripe-rest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STRIPE_ACCOUNT_SCHEMA =
  "accounts_v2_recipient_embedded_application_responsibility_v2";

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

    const { data: existing, error: existingError } = await admin
      .from("payment_accounts")
      .select("id,provider_account_id,status,is_default,metadata")
      .eq("organization_id", organizationId)
      .eq("provider", "STRIPE")
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

    let paymentAccountId = existing?.id ?? null;
    let providerAccountId = existing?.provider_account_id ?? null;

    // Sandbox cleanup only. Earlier broken test payloads stored stale account
    // references and stale schema markers. This creates one clean account when
    // the marker does not match the corrected integration.
    if (
      !providerAccountId ||
      existingMetadata.integration_schema !== STRIPE_ACCOUNT_SCHEMA
    ) {
      const stripeAccount = await createEmbeddedRecipientAccount({
        email,
        displayName,
        country: "US",
        requestScope: organizationId,
      });

      providerAccountId = stripeAccount.id;

      const metadata = {
        source: "stripe_connect_embedded",
        integration_schema: STRIPE_ACCOUNT_SCHEMA,
        api_namespace: "accounts_v2",
        account_configuration: "recipient",
        dashboard: "none",
        fees_collector: "application",
        losses_collector: "application",
        previous_test_provider_account_id:
          existing?.provider_account_id ?? null,
      };

      if (paymentAccountId) {
        const { error } = await admin
          .from("payment_accounts")
          .update({
            provider_account_id: providerAccountId,
            connection_mode: "STRIPE_CONNECT",
            status: "PENDING",
            charges_enabled: false,
            payouts_enabled: false,
            metadata,
          })
          .eq("id", paymentAccountId);

        if (error) {
          throw new Error(
            `Unable to save the new Stripe test account: ${error.message}`,
          );
        }
      } else {
        const { data: defaultAccount, error: defaultError } = await admin
          .from("payment_accounts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("is_default", true)
          .neq("status", "DISABLED")
          .limit(1)
          .maybeSingle();

        if (defaultError) {
          throw new Error(
            `Unable to inspect default payment account: ${defaultError.message}`,
          );
        }

        const { data: inserted, error } = await admin
          .from("payment_accounts")
          .insert({
            organization_id: organizationId,
            provider: "STRIPE",
            connection_mode: "STRIPE_CONNECT",
            provider_account_id: providerAccountId,
            status: "PENDING",
            is_default: !defaultAccount,
            country_code: "US",
            currency: "USD",
            charges_enabled: false,
            payouts_enabled: false,
            metadata,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (error || !inserted) {
          throw new Error(
            `Unable to save Stripe payment account: ${
              error?.message ?? "Unknown database error"
            }`,
          );
        }

        paymentAccountId = inserted.id;
      }
    }

    if (!paymentAccountId || !providerAccountId) {
      throw new Error("Stripe payout setup could not be initialized.");
    }

    const session = await createAccountSession(providerAccountId);

    if (!session.client_secret) {
      throw new Error("Stripe did not return an Account Session client secret.");
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      paymentAccountId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
