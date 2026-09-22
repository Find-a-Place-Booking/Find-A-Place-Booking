import { NextRequest, NextResponse } from "next/server";

import { sendRefundNotifications } from "@/lib/notifications/operational-emails";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { getStripeClient } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const environment = stripeEnvironment();
    // Refunds may complete without a usable webhook delivery. Stripe is the
    // authority for a pending refund; never create a second refund here.
    const { data: pending, error } = await admin.from("refunds")
      .select("id,reservation_id,payment_id,provider_refund_id,amount_cents")
      .eq("payment_environment", environment)
      .eq("status", "PENDING")
      .not("provider_refund_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(20);
    if (error) throw error;

    let reconciled = 0;
    const failures: Array<{ refundId: string; error: string }> = [];
    for (const row of pending ?? []) {
      try {
        const [{ data: reservation }, { data: payment }] = await Promise.all([
          admin.from("reservations").select("provider_account_ref,payment_environment")
            .eq("id", row.reservation_id).single(),
          admin.from("payments").select("provider_payment_id")
            .eq("id", row.payment_id).single(),
        ]);
        if (!reservation?.provider_account_ref ||
            reservation.payment_environment !== environment ||
            !payment?.provider_payment_id) {
          throw new Error("Connected merchant or payment reference is missing.");
        }
        const refund = await getStripeClient().refunds.retrieve(row.provider_refund_id!, {}, {
          stripeAccount: reservation.provider_account_ref,
        });
        const intentId = typeof refund.payment_intent === "string"
          ? refund.payment_intent : refund.payment_intent?.id;
        if (refund.id !== row.provider_refund_id ||
            refund.metadata?.refund_id !== row.id ||
            intentId !== payment.provider_payment_id ||
            refund.amount !== Number(row.amount_cents)) {
          throw new Error("Stripe refund does not match the local refund and merchant.");
        }
        const status = refund.status === "succeeded" ? "SUCCEEDED"
          : refund.status === "failed" ? "FAILED"
          : refund.status === "canceled" ? "CANCELLED" : "PENDING";
        if (status === "PENDING") continue;
        const { error: recordError } = await admin.rpc("record_refund_result", {
          target_refund_id: row.id,
          target_provider_refund_id: refund.id,
          target_status: status,
          target_failure_message: refund.failure_reason || null,
        });
        if (recordError) throw recordError;
        if (status === "SUCCEEDED") {
          const { error: requestError } = await admin.from("reservation_cancellation_requests")
            .update({ status: "COMPLETED", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("reservation_id", row.reservation_id).eq("status", "APPROVED");
          if (requestError) throw requestError;
        }
        reconciled++;
        try {
          await sendRefundNotifications(admin, row.id);
        } catch (notificationError) {
          console.error("[refund reconciliation] notification failed", row.id, notificationError);
        }
      } catch (reconcileError) {
        console.error("[refund reconciliation] failed", row.id, reconcileError);
        failures.push({ refundId: row.id, error: reconcileError instanceof Error ? reconcileError.message : "Unknown error" });
      }
    }
    const { count: missingReference } = await admin.from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("payment_environment", environment).eq("status", "PENDING")
      .is("provider_refund_id", null);
    return NextResponse.json({ ok: failures.length === 0, environment,
      checked: pending?.length ?? 0, reconciled, missingReference, failures },
      { status: failures.length ? 503 : 200 });
  } catch (error) {
    console.error("[refund reconciliation]", error);
    return NextResponse.json({ error: "Refund reconciliation failed." }, { status: 500 });
  }
}
