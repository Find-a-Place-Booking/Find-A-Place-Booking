import { NextRequest, NextResponse } from "next/server";

import {
  availableBalanceCents,
  createConnectedPayout,
  ensureManualPayoutSchedule,
  retrieveConnectedBalance,
  retrieveConnectedPayout,
} from "@/lib/payments/stripe-payouts";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
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

async function enforceManualSchedules(
  admin: ReturnType<typeof createAdminClient>,
) {
  const { data, error } = await admin
    .from("payment_accounts")
    .select("id,provider_account_id,metadata")
    .eq("provider", "STRIPE")
    .eq("payouts_enabled", true)
    .not("provider_account_id", "is", null)
    .limit(100);

  if (error) throw new Error(`Unable to load Stripe payout accounts: ${error.message}`);

  let ready = 0;
  let failed = 0;

  for (const account of data ?? []) {
    const providerAccountId = String(account.provider_account_id || "");
    if (!providerAccountId) continue;

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
        .eq("id", account.id);
    } catch (scheduleError) {
      failed += 1;
      const message =
        scheduleError instanceof Error
          ? scheduleError.message.slice(0, 1000)
          : "Unable to enforce manual Stripe payouts.";

      await admin
        .from("payment_accounts")
        .update({
          status: "PENDING",
          metadata: {
            ...metadata,
            payout_schedule: "ERROR",
            payout_schedule_policy: "CHECKIN_MINUS_13_DAYS",
            payout_schedule_error: message,
            payout_schedule_checked_at: new Date().toISOString(),
          },
        })
        .eq("id", account.id);
    }
  }

  return { checked: (data ?? []).length, ready, failed };
}

async function reconcileCreatedPayouts(
  admin: ReturnType<typeof createAdminClient>,
) {
  const { data, error } = await admin
    .from("reservation_payouts")
    .select(
      "id,connected_account_id,provider_payout_id,status",
    )
    .in("status", ["PENDING", "IN_TRANSIT"])
    .not("provider_payout_id", "is", null)
    .limit(100);

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
        .eq("id", row.id);

      if (updateError) throw updateError;
      updated += 1;
    } catch (error) {
      errors += 1;
      console.error("[payout cron] reconciliation failed", row.id, error);
    }
  }

  return { checked: (data ?? []).length, updated, errors };
}

async function processDuePayouts(
  admin: ReturnType<typeof createAdminClient>,
) {
  const today = isoDate();
  const { data, error } = await admin
    .from("reservation_payouts")
    .select(
      "id,reservation_id,payment_id,confirmation_code,connected_account_id,amount_cents,currency,payout_eligible_date,status,attempt_count",
    )
    .in("status", ["SCHEDULED", "WAITING_FUNDS", "WAITING_REFUND", "RETRY"])
    .lte("payout_eligible_date", today)
    .gt("amount_cents", 0)
    .order("payout_eligible_date", { ascending: true })
    .limit(100);

  if (error) throw new Error(`Unable to load due payouts: ${error.message}`);

  let paid = 0;
  let waitingFunds = 0;
  let waitingRefund = 0;
  let retried = 0;

  for (const row of data ?? []) {
    const now = new Date().toISOString();

    const [{ data: reservation }, { data: payment }, { data: refunds }] =
      await Promise.all([
        admin
          .from("reservations")
          .select("id,status,payment_status")
          .eq("id", row.reservation_id)
          .maybeSingle(),
        admin
          .from("payments")
          .select("id,status,host_proceeds_cents")
          .eq("id", row.payment_id)
          .maybeSingle(),
        admin
          .from("refunds")
          .select("id,status,amount_cents")
          .eq("reservation_id", row.reservation_id)
          .in("status", ["PENDING", "SUCCEEDED"]),
      ]);

    if (!reservation || reservation.status !== "CONFIRMED") {
      await admin
        .from("reservation_payouts")
        .update({
          status: "CANCELLED",
          last_attempt_at: now,
          last_error: "Reservation is no longer confirmed.",
        })
        .eq("id", row.id);
      continue;
    }

    if (!payment || payment.status !== "SUCCEEDED") {
      await admin
        .from("reservation_payouts")
        .update({
          status: "RETRY",
          attempt_count: Number(row.attempt_count || 0) + 1,
          last_attempt_at: now,
          last_error: "Successful payment record is not available yet.",
        })
        .eq("id", row.id);
      retried += 1;
      continue;
    }

    const refundRows = refunds ?? [];
    if (refundRows.some((refund) => refund.status === "PENDING")) {
      await admin
        .from("reservation_payouts")
        .update({
          status: "WAITING_REFUND",
          last_attempt_at: now,
          last_error: "A refund is still pending reconciliation.",
        })
        .eq("id", row.id);
      waitingRefund += 1;
      continue;
    }

    if (refundRows.some((refund) => refund.status === "SUCCEEDED" && Number(refund.amount_cents) >= Number(payment.host_proceeds_cents || 0))) {
      await admin
        .from("reservation_payouts")
        .update({
          status: "CANCELLED",
          amount_cents: 0,
          last_attempt_at: now,
          last_error: null,
        })
        .eq("id", row.id);
      continue;
    }

    try {
      await ensureManualPayoutSchedule(row.connected_account_id);
      const balance = await retrieveConnectedBalance(row.connected_account_id);
      const available = availableBalanceCents(balance, row.currency);
      const amount = Number(row.amount_cents);

      if (available < amount) {
        await admin
          .from("reservation_payouts")
          .update({
            status: "WAITING_FUNDS",
            attempt_count: Number(row.attempt_count || 0) + 1,
            last_attempt_at: now,
            last_error: `Connected Stripe balance has ${available} available cents; ${amount} cents are required.`,
          })
          .eq("id", row.id);
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
        attempt_count: Number(row.attempt_count || 0) + 1,
        last_attempt_at: now,
        initiated_at: now,
        estimated_arrival_at: arrivalIso(payout.arrival_date),
        last_error: null,
      };
      if (payoutStatus === "PAID") patch.paid_at = now;
      if (payoutStatus === "FAILED") {
        patch.failed_at = now;
        patch.last_error = payout.failure_message || payout.failure_code || "Stripe payout failed.";
      }

      const { error: updateError } = await admin
        .from("reservation_payouts")
        .update(patch)
        .eq("id", row.id)
        .in("status", ["SCHEDULED", "WAITING_FUNDS", "WAITING_REFUND", "RETRY"]);

      if (updateError) throw updateError;
      paid += 1;
    } catch (payoutError) {
      const message =
        payoutError instanceof Error
          ? payoutError.message.slice(0, 1000)
          : "Stripe payout attempt failed.";

      await admin
        .from("reservation_payouts")
        .update({
          status: "RETRY",
          attempt_count: Number(row.attempt_count || 0) + 1,
          last_attempt_at: now,
          last_error: message,
        })
        .eq("id", row.id);
      retried += 1;
    }
  }

  return {
    due: (data ?? []).length,
    initiated: paid,
    waitingFunds,
    waitingRefund,
    retry: retried,
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const schedules = await enforceManualSchedules(admin);
    const reconciliation = await reconcileCreatedPayouts(admin);
    const processing = await processDuePayouts(admin);

    return NextResponse.json({
      ok: true,
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
          error instanceof Error
            ? error.message
            : "Payout scheduler failed.",
      },
      { status: 500 },
    );
  }
}
