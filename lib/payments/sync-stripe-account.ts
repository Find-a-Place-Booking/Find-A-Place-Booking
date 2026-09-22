import type { SupabaseClient } from "@supabase/supabase-js";

import {
  retrieveEmbeddedMerchantAccount,
  type StripeAccountV2,
} from "@/lib/payments/stripe-rest";

function cardPaymentsCapability(account: StripeAccountV2) {
  return account.configuration?.merchant?.capabilities?.card_payments ?? null;
}

export async function syncStripePaymentAccount(
  admin: SupabaseClient,
  paymentAccountId: string,
  providerAccountId: string,
) {
  const { data: storedAccount, error: storedAccountError } = await admin
    .from("payment_accounts")
    .select("metadata")
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .eq("provider_account_id", providerAccountId)
    .single();

  if (storedAccountError || !storedAccount) {
    throw new Error(
      "Unable to load the Stripe payment account before synchronization.",
    );
  }

  const storedMetadata =
    storedAccount.metadata && typeof storedAccount.metadata === "object"
      ? (storedAccount.metadata as Record<string, unknown>)
      : {};

  const account = await retrieveEmbeddedMerchantAccount(providerAccountId);
  const cardCapability = cardPaymentsCapability(account);
  const cardStatus = cardCapability?.status ?? null;
  const cardStatusDetails = cardCapability?.status_details ?? [];
  const chargesEnabled = cardStatus === "active";
  const pastDue =
    account.requirements?.summary?.minimum_deadline?.status === "past_due";

  const status = chargesEnabled
    ? ("READY" as const)
    : cardStatus === "restricted" || pastDue
      ? ("RESTRICTED" as const)
      : ("PENDING" as const);

  const { error } = await admin
    .from("payment_accounts")
    .update({
      status,
      charges_enabled: chargesEnabled,
      // Kept true with READY for compatibility with existing host UI. Bank
      // payout timing itself is now controlled by Stripe/the host, not FAP.
      payouts_enabled: chargesEnabled,
      currency: (account.defaults?.currency || "usd").toUpperCase(),
      metadata: {
        ...storedMetadata,
        source: "stripe_connect_embedded",
        api_namespace: "accounts_v2",
        account_configuration: "merchant",
        charge_model: "DIRECT",
        dashboard: account.dashboard ?? null,
        fees_collector:
          account.defaults?.responsibilities?.fees_collector ?? null,
        losses_collector:
          account.defaults?.responsibilities?.losses_collector ?? null,
        card_payments_status: cardStatus,
        card_payments_status_details: cardStatusDetails,
        payout_schedule: "STRIPE_MANAGED",
        payout_schedule_policy: null,
        payout_schedule_error: null,
        outstanding_requirement_count:
          account.requirements?.entries?.length ?? 0,
      },
    })
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .eq("provider_account_id", providerAccountId);

  if (error) {
    throw new Error(
      `Unable to synchronize Stripe payment account: ${error.message}`,
    );
  }

  return {
    account,
    status,
    chargesEnabled,
    cardStatus,
    cardStatusDetails,
    // Compatibility fields consumed by the current sync endpoint/UI.
    transfersEnabled: false,
    payoutsEnabled: chargesEnabled,
    payoutScheduleStatus: "STRIPE_MANAGED" as const,
    payoutScheduleError: null,
  };
}
