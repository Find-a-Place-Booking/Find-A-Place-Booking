import type { SupabaseClient } from "@supabase/supabase-js";

import {
  retrieveEmbeddedRecipientAccount,
  type StripeAccountV2,
} from "@/lib/payments/stripe-rest";
import { ensureManualPayoutSchedule } from "@/lib/payments/stripe-payouts";

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
  const { data: storedAccount, error: storedAccountError } = await admin
    .from("payment_accounts")
    .select("metadata")
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .eq("provider_account_id", providerAccountId)
    .single();

  if (storedAccountError || !storedAccount) {
    throw new Error(
      "Unable to load the Stripe payout account before synchronization.",
    );
  }

  const storedMetadata =
    storedAccount.metadata && typeof storedAccount.metadata === "object"
      ? (storedAccount.metadata as Record<string, unknown>)
      : {};

  const account = await retrieveEmbeddedRecipientAccount(providerAccountId);

  const transfersStatus = capabilityStatus(account, "stripe_transfers");
  const payoutsStatus = capabilityStatus(account, "payouts");
  const transfersEnabled = transfersStatus === "active";
  const payoutsEnabled = payoutsStatus === "active";

  let payoutScheduleStatus: "MANUAL" | "NOT_READY" | "ERROR" =
    payoutsEnabled ? "ERROR" : "NOT_READY";
  let payoutScheduleError: string | null = null;

  if (payoutsEnabled) {
    try {
      await ensureManualPayoutSchedule(providerAccountId);
      payoutScheduleStatus = "MANUAL";
    } catch (error) {
      payoutScheduleError =
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "Stripe payout schedule could not be set to manual.";
    }
  }

  const pastDue =
    account.requirements?.summary?.minimum_deadline?.status === "past_due";

  const status =
    transfersEnabled && payoutsEnabled && payoutScheduleStatus === "MANUAL"
      ? ("READY" as const)
      : pastDue
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
        ...storedMetadata,
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
        payout_schedule: payoutScheduleStatus,
        payout_schedule_policy: "CHECKIN_MINUS_13_DAYS",
        payout_schedule_error: payoutScheduleError,
        outstanding_requirement_count:
          account.requirements?.entries?.length ?? 0,
      },
    })
    .eq("id", paymentAccountId)
    .eq("provider", "STRIPE")
    .eq("provider_account_id", providerAccountId);

  if (error) {
    throw new Error(
      `Unable to synchronize Stripe payout account: ${error.message}`,
    );
  }

  return {
    account,
    status,
    transfersEnabled,
    payoutsEnabled,
    payoutScheduleStatus,
    payoutScheduleError,
  };
}
