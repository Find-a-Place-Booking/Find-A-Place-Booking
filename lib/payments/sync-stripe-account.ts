import type { SupabaseClient } from "@supabase/supabase-js";

import {
  retrieveEmbeddedRecipientAccount,
  type StripeAccountV2,
} from "@/lib/payments/stripe-rest";

function capabilityStatus(
  account: StripeAccountV2,
  capability: "stripe_transfers" | "payouts",
) {
  return (
    account.configuration?.recipient?.capabilities?.stripe_balance?.[capability]
      ?.status ?? null
  );
}

export async function syncStripePaymentAccount(
  admin: SupabaseClient,
  paymentAccountId: string,
  providerAccountId: string,
) {
  const account = await retrieveEmbeddedRecipientAccount(providerAccountId);

  const transfersStatus = capabilityStatus(account, "stripe_transfers");
  const payoutsStatus = capabilityStatus(account, "payouts");
  const transfersEnabled = transfersStatus === "active";
  const payoutsEnabled = payoutsStatus === "active";

  const status =
    transfersEnabled && payoutsEnabled
      ? ("READY" as const)
      : account.requirements?.summary?.minimum_deadline?.status === "past_due"
        ? ("RESTRICTED" as const)
        : ("PENDING" as const);

  const { error } = await admin
    .from("payment_accounts")
    .update({
      status,
      charges_enabled: false,
      payouts_enabled: payoutsEnabled,
      currency: (account.defaults?.currency || "usd").toUpperCase(),
      metadata: {
        source: "stripe_connect_embedded",
        api_namespace: "accounts_v2",
        account_configuration: "recipient",
        dashboard: account.dashboard ?? null,
        fees_collector:
          account.defaults?.responsibilities?.fees_collector ?? null,
        losses_collector:
          account.defaults?.responsibilities?.losses_collector ?? null,
        transfers_status: transfersStatus,
        payouts_status: payoutsStatus,
        outstanding_requirement_count:
          account.requirements?.entries?.length ?? 0,
      },
    })
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .eq("provider_account_id", providerAccountId);

  if (error) {
    throw new Error(`Unable to synchronize Stripe payout account: ${error.message}`);
  }

  return { account, status, transfersEnabled, payoutsEnabled };
}
