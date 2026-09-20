import { NextRequest, NextResponse } from "next/server";

import {
  availableBalanceCents,
  createConnectedPayout,
  ensureManualPayoutSchedule,
  retrieveConnectedBalance,
  retrieveConnectedPayout,
} from "@/lib/payments/stripe-payouts";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { sendPayoutNotifications } from "@/lib/notifications/operational-emails";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function stripePayoutStatus(status: string) {
  if (status === "paid") return "PAID";
  if (status === "failed") return "FAILED";
  if (status === "canceled") return "CANCELLED";
  if (status === "in_transit") return "IN_TRANSIT";
  return "PENDING";
}

function arrivalIso(unixSeconds?: number | null) {
  if (!unixSeconds) return null;
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;

  async function runner() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner()),
  );
}

async function enforceManualSchedules(
  admin: ReturnType<typeof createAdminClient>,
  environment: "TEST" | "LIVE",
) {
  const { data, error } = await admin
    .from("payment_accounts")
    .select("id,provider_account_id,metadata,updated_at")
    .eq("provider", "STRIPE")
    .eq("environment", environment)
    .eq("payouts_enabled", true)
    .not("provider_account_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(25);

  if (error) {
    throw new Error(`Unable to load Stripe payout accounts: ${error.message}`);
  }

  let ready = 0;
  let failed = 0;

  await runWithConcurrency(data ?? [], 5, async (account) => {
    const providerAccountId = String(account.provider_account_id || "");
    if (!providerAccountId) return;

    const metadata =
      account.metadata && typeof account.metadata === "object"
        ? (account.metadata as Record<string, unknown>)
        : {};

    try {
      await ensureManualPayoutSchedule(providerAccountId);
      ready += 1;
      await admin
        .from("payment_accounts")
        .update({
          metadata: {
            ...metadata,
            payout_schedule: "MANUAL",
            payout_schedule_policy: "CHECKIN_MINUS_13_DAYS",
            payout_schedule_error: null,
            payout_schedule_checked_at: new Date().toISOString(),
          },
        })
        .eq("id", account.id)
        .eq("environment", environment);
    } catch (scheduleError) {
      failed += 1;
      const message =
        scheduleError instanceof Error
          ? scheduleError.message.slice(0, 1000)
          : "Unable to enforce manual Stripe payouts.";

      await admin
        .from("payment_accounts")
        .update({
          metadata: {
            ...metadata,
            payout_schedule: "ERROR",
            payout_schedule_policy: "CHECKIN_MINUS_13_DAYS",
            payout_schedule_error: message,
            payout_schedule_checked_at: new Date().toISOString(),
          },
        })
        .eq("id", account.id)
        .eq("environment", environment);
    }
  });

  return { checked: (data ?? []).length, ready, failed };
}

async function reconcileCreatedPayouts(
  admin: ReturnType<typeof createAdminClient>,
  environment: "TEST" | "LIVE",
) {
  const { data, error } = await admin
    .from("reservation_payouts")
    .select("id,connected_account_id,provider_payout_id,status")
    .eq("payment_environment", environment)
    .in("status", ["PENDING", "IN_TRANSIT"])
    .not("provider_payout_id", "is", null)
    .limit(50);

  if (error) throw new Error(`Unable to load pending payouts: ${error.message}`);

  let updated = 0;
  let errors = 0;

  for (const row of data ?? []) {
    try {
      const payout = await retrieveConnectedPayout(
        row.connected_account_id,
        row.provider_payout_id,
      );
      const status = stripePayoutStatus(payout.status);
      const now = new Date().toISOString();

      const patch: Record<string, unknown> = {
        status,
        estimated_arrival_at: arrivalIso(payout.arrival_date),
        last_error:
          status === "FAILED"
            ? payout.failure_message || payout.failure_code || "Stripe payout failed."
            : null,
      };

      if (status === "PAID") patch.paid_at = now;
      if (status === "FAILED") patch.failed_at = now;

      const { error: updateError } = await admin
        .from("reservation_payouts")
        .update(patch)
        .eq("id", row.id)
        .eq("payment_environment", environment);

      if (updateError) throw updateError;

      try {
        await sendPayoutNotifications(admin, row.id);
      } catch (notificationError) {
        console.error(
          "[payout cron] reconciled payout notification failed",
          row.id,
          notificationError,
        );
      }

      updated += 1;
    } catch (error) {
      errors += 1;
      console.error("[payout cron] reconciliation failed", row.id, error);
    }
  }

  return { checked: (data ?? []).length, updated, errors };
}

type ClaimedPayout = {
  id: string;
  reservation_id: string;
  payment_id: string;
  confirmation_code: string;
  connected_account_id: string;
  amount_cents: number | string;
  currency: string;
  payment_environment: "TEST" | "LIVE";
  payout_eligible_at: string;
  attempt_count: number;
};

async function processDuePayouts(
  admin: ReturnType<typeof createAdminClient>,
  environment: "TEST" | "LIVE",
) {
  const { data, error } = await admin.rpc("claim_due_reservation_payouts", {
    expected_environment: environment,
    max_rows: 25,
  });

  if (error) throw new Error(`Unable to claim due payouts: ${error.message}`);

  const claimed = (data ?? []) as ClaimedPayout[];
  let initiated = 0;
  let waitingFunds = 0;
  let waitingRefund = 0;
  let retry = 0;
  let cancelled = 0;

  for (const row of claimed) {
    const now = new Date().toISOString();

    const [{ data: reservation }, { data: payment }, { data: refunds }] =
      await Promise.all([
        admin
          .from("reservations")
          .select("id,status,payment_status,payment_environment")
          .eq("id", row.reservation_id)
          .eq("payment_environment", environment)
          .maybeSingle(),
        admin
          .from("payments")
          .select("id,status,host_proceeds_cents,payment_environment")
          .eq("id", row.payment_id)
          .eq("payment_environment", environment)
          .maybeSingle(),
        admin
          .from("refunds")
          .select("id,status,amount_cents,payment_environment")
          .eq("reservation_id", row.reservation_id)
          .eq("payment_environment", environment)
          .in("status", ["PENDING", "SUCCEEDED"]),
      ]);

    if (!reservation || reservation.status !== "CONFIRMED") {
      await admin
        .from("reservation_payouts")
        .update({
          status: "CANCELLED",
          last_error: "Reservation is no longer confirmed.",
        })
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");
      cancelled += 1;
      continue;
    }

    const payoutEligiblePaymentStatuses = new Set([
      "SUCCEEDED",
      "PARTIALLY_REFUNDED",
    ]);

    if (!payment || !payoutEligiblePaymentStatuses.has(payment.status)) {
      const paymentReason =
        payment?.status === "DISPUTED"
          ? "Payment is disputed. Payout is paused until the dispute is resolved."
          : "Successful payment record is not available yet.";

      await admin
        .from("reservation_payouts")
        .update({
          status: "RETRY",
          last_error: paymentReason,
        })
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");
      retry += 1;
      continue;
    }

    const refundRows = refunds ?? [];
    if (refundRows.some((refund) => refund.status === "PENDING")) {
      await admin
        .from("reservation_payouts")
        .update({
          status: "WAITING_REFUND",
          last_error: "A refund is still pending reconciliation.",
        })
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");
      waitingRefund += 1;
      continue;
    }

    const successfulRefundCents = refundRows
      .filter((refund) => refund.status === "SUCCEEDED")
      .reduce((sum, refund) => sum + Number(refund.amount_cents || 0), 0);
    const desiredAmount = Math.max(
      0,
      Number(payment.host_proceeds_cents || 0) - successfulRefundCents,
    );

    if (desiredAmount <= 0) {
      await admin
        .from("reservation_payouts")
        .update({
          status: "CANCELLED",
          amount_cents: 0,
          last_error: null,
        })
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");
      cancelled += 1;
      continue;
    }

    if (desiredAmount !== Number(row.amount_cents)) {
      const { error: amountUpdateError } = await admin
        .from("reservation_payouts")
        .update({ amount_cents: desiredAmount })
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");
      if (amountUpdateError) throw amountUpdateError;
    }

    try {
      await ensureManualPayoutSchedule(row.connected_account_id);
      const balance = await retrieveConnectedBalance(row.connected_account_id);
      const available = availableBalanceCents(balance, row.currency);
      const amount = desiredAmount;

      if (available < amount) {
        await admin
          .from("reservation_payouts")
          .update({
            status: "WAITING_FUNDS",
            last_error: `Connected Stripe balance has ${available} available cents; ${amount} cents are required.`,
          })
          .eq("id", row.id)
          .eq("payment_environment", environment)
          .eq("status", "CREATING");
        waitingFunds += 1;
        continue;
      }

      const payout = await createConnectedPayout({
        connectedAccountId: row.connected_account_id,
        amountCents: amount,
        currency: row.currency,
        payoutRecordId: row.id,
        reservationId: row.reservation_id,
        confirmationCode: row.confirmation_code,
      });

      const payoutStatus = stripePayoutStatus(payout.status);
      const patch: Record<string, unknown> = {
        status: payoutStatus,
        provider_payout_id: payout.id,
        initiated_at: now,
        estimated_arrival_at: arrivalIso(payout.arrival_date),
        last_error: null,
      };
      if (payoutStatus === "PAID") patch.paid_at = now;
      if (payoutStatus === "FAILED") {
        patch.failed_at = now;
        patch.last_error =
          payout.failure_message || payout.failure_code || "Stripe payout failed.";
      }

      const { error: updateError } = await admin
        .from("reservation_payouts")
        .update(patch)
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");

      if (updateError) throw updateError;

      try {
        await sendPayoutNotifications(admin, row.id);
      } catch (notificationError) {
        console.error(
          "[payout cron] initiated payout notification failed",
          row.id,
          notificationError,
        );
      }

      initiated += 1;
    } catch (payoutError) {
      const message =
        payoutError instanceof Error
          ? payoutError.message.slice(0, 1000)
          : "Stripe payout attempt failed.";

      // The Stripe request uses a stable idempotency key tied to row.id. If the
      // network result was uncertain, the next claim safely retries the same
      // Stripe operation rather than creating a second bank payout.
      await admin
        .from("reservation_payouts")
        .update({
          status: "RETRY",
          last_error: message,
        })
        .eq("id", row.id)
        .eq("payment_environment", environment)
        .eq("status", "CREATING");
      retry += 1;
    }
  }

  return {
    claimed: claimed.length,
    initiated,
    waitingFunds,
    waitingRefund,
    retry,
    cancelled,
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const environment = stripeEnvironment();

    const schedules = await enforceManualSchedules(admin, environment);
    const reconciliation = await reconcileCreatedPayouts(admin, environment);
    const processing = await processDuePayouts(admin, environment);

    return NextResponse.json({
      ok: true,
      environment,
      policy: {
        cancellationClosesDaysBeforeCheckIn: 14,
        payoutEligibleDaysBeforeCheckIn: 13,
      },
      schedules,
      reconciliation,
      processing,
    });
  } catch (error) {
    console.error("[payout cron]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Payout scheduler failed.",
      },
      { status: 500 },
    );
  }
}
