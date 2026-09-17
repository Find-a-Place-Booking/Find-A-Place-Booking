"use server";

import { redirect } from "next/navigation";

import { getManagedOrganizations } from "@/lib/host/properties";
import {
  createConnectedAccountLink,
  createExpressConnectedAccount,
} from "@/lib/payments/stripe-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function siteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  return value.replace(/\/$/, "");
}

export async function startStripeOnboarding(formData: FormData) {
  const organizationId = String(formData.get("organizationId") || "");
  const organizations = await getManagedOrganizations();
  const organization = organizations.find((item) => item.id === organizationId);
  if (!organization) throw new Error("You do not manage that organization.");

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect("/host/sign-in");

  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("payment_accounts")
    .select(
      "id,provider_account_id,status,is_default,charges_enabled,payouts_enabled",
    )
    .eq("organization_id", organizationId)
    .eq("provider", "STRIPE")
    .neq("status", "DISABLED")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to load Stripe payment account: ${existingError.message}`);
  }

  let paymentAccountId = existing?.id ?? null;
  let stripeAccountId = existing?.provider_account_id ?? null;

  if (!stripeAccountId) {
    const account = await createExpressConnectedAccount(user.email ?? null);
    stripeAccountId = account.id;

    if (paymentAccountId) {
      const { error } = await admin
        .from("payment_accounts")
        .update({
          provider_account_id: account.id,
          connection_mode: "STRIPE_CONNECT",
          status: "PENDING",
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          metadata: {
            source: "stripe_hosted_onboarding",
            details_submitted: account.details_submitted ?? false,
          },
        })
        .eq("id", paymentAccountId);

      if (error) throw new Error(`Unable to save Stripe account: ${error.message}`);
    } else {
      const { data: defaultAccount } = await admin
        .from("payment_accounts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .neq("status", "DISABLED")
        .limit(1)
        .maybeSingle();

      const { data: inserted, error } = await admin
        .from("payment_accounts")
        .insert({
          organization_id: organizationId,
          provider: "STRIPE",
          connection_mode: "STRIPE_CONNECT",
          provider_account_id: account.id,
          status: "PENDING",
          is_default: !defaultAccount,
          country_code: "US",
          currency: "USD",
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          metadata: {
            source: "stripe_hosted_onboarding",
            details_submitted: account.details_submitted ?? false,
          },
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error || !inserted) {
        throw new Error(
          `Unable to create Find A Place payment account: ${error?.message ?? "Unknown database error"}`,
        );
      }
      paymentAccountId = inserted.id;
    }
  }

  if (!paymentAccountId || !stripeAccountId) {
    throw new Error("Stripe account setup could not be initialized.");
  }

  const base = siteUrl();
  const encoded = encodeURIComponent(paymentAccountId);
  const link = await createConnectedAccountLink({
    accountId: stripeAccountId,
    refreshUrl: `${base}/host/payments/stripe/refresh?payment_account_id=${encoded}`,
    returnUrl: `${base}/host/payments/stripe/return?payment_account_id=${encoded}`,
  });

  redirect(link.url);
}
