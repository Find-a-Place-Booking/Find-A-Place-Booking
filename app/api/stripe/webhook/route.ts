import { createHash } from "node:crypto";

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import {
  chargeProcessorFee,
  ensureFullRefundApplicationFee,
  getStripeClient,
  retrieveChargeWithBalanceTransaction,
} from "@/lib/payments/stripe-checkout";
import { sendBookingNotifications } from "@/lib/notifications/reservation-emails";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function markProcessorEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  status: "PROCESSED" | "IGNORED" | "ERROR",
  errorMessage?: string | null,
) {
  const environment = stripeEnvironment();
  await admin
    .from("processor_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ? errorMessage.slice(0, 500) : null,
    })
    .eq("provider", "STRIPE")
    .eq("payment_environment", environment)
    .eq("external_event_id", eventId);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (error) {
    console.error("[stripe webhook] signature rejected", error);
    return NextResponse.json(
      { error: "Invalid Stripe webhook signature." },
      { status: 400 },
    );
  }

  const environment = stripeEnvironment();
  if (event.livemode !== (environment === "LIVE")) {
    return NextResponse.json(
      { error: "Stripe webhook mode does not match the configured environment." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const object = event.data.object as { id?: string };

  const { data: existing } = await admin
    .from("processor_events")
    .select("id,processing_status")
    .eq("provider", "STRIPE")
    .eq("payment_environment", environment)
    .eq("external_event_id", event.id)
    .maybeSingle();

  if (existing?.processing_status === "PROCESSED") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!existing) {
    const { error: insertError } = await admin
      .from("processor_events")
      .insert({
        provider: "STRIPE",
        payment_environment: environment,
        external_event_id: event.id,
        event_type: event.type,
        external_object_id: object.id ?? null,
        payload_sha256: payloadSha256,
        processing_status: "RECEIVED",
        metadata: {},
      });

    if (insertError) {
      console.error("[stripe webhook] event persistence failed", insertError);
      return NextResponse.json(
        { error: "Event persistence failed." },
        { status: 500 },
      );
    }
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const reservationId = intent.metadata?.reservation_id;
      const paymentId = intent.metadata?.payment_id;

      if (!reservationId || !paymentId) {
        await markProcessorEvent(admin, event.id, "IGNORED");
        return NextResponse.json({ received: true, ignored: true });
      }

      const { data: payment, error: paymentLookupError } = await admin
        .from("payments")
        .select("id,reservation_id,provider_payment_id,payment_environment")
        .eq("id", paymentId)
        .eq("reservation_id", reservationId)
        .eq("provider", "STRIPE")
        .eq("payment_environment", environment)
        .single();

      if (
        paymentLookupError ||
        !payment ||
        payment.payment_environment !== environment ||
        (payment.provider_payment_id && payment.provider_payment_id !== intent.id)
      ) {
        throw new Error(
          "Stripe event metadata does not match the local payment record.",
        );
      }

      const chargeId =
        typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : intent.latest_charge?.id;

      let processorFeeActualCents = 0;

      if (chargeId) {
        const charge = await retrieveChargeWithBalanceTransaction(chargeId);
        processorFeeActualCents = chargeProcessorFee(charge);
      }

      const { error } = await admin.rpc("confirm_reservation_payment", {
        target_reservation_id: reservationId,
        target_payment_id: paymentId,
        target_provider_payment_id: intent.id,
        target_provider_charge_id: chargeId || null,
        target_processor_fee_actual_cents: processorFeeActualCents,
      });

      if (error) throw error;

      await sendBookingNotifications(admin, reservationId);

      await markProcessorEvent(admin, event.id, "PROCESSED");
      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const reservationId = intent.metadata?.reservation_id;
      const paymentId = intent.metadata?.payment_id;

      if (!reservationId || !paymentId) {
        await markProcessorEvent(admin, event.id, "IGNORED");
        return NextResponse.json({ received: true, ignored: true });
      }

      const { error } = await admin.rpc("mark_reservation_payment_failed", {
        target_reservation_id: reservationId,
        target_payment_id: paymentId,
        target_failure_code:
          intent.last_payment_error?.code || "payment_failed",
        target_failure_message:
          intent.last_payment_error?.message ||
          "Stripe reported that the payment failed.",
      });

      if (error) throw error;

      await markProcessorEvent(admin, event.id, "PROCESSED");
      return NextResponse.json({ received: true });
    }

    if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      const refund = event.data.object as Stripe.Refund;
      let refundId = refund.metadata?.refund_id;

      if (!refundId) {
        const { data: localRefund } = await admin
          .from("refunds")
          .select("id")
          .eq("provider_refund_id", refund.id)
          .eq("payment_environment", environment)
          .maybeSingle();
        refundId = localRefund?.id;
      }

      if (!refundId) {
        await markProcessorEvent(admin, event.id, "IGNORED");
        return NextResponse.json({ received: true, ignored: true });
      }

      const status = refund.status === "succeeded"
        ? "SUCCEEDED"
        : refund.status === "failed"
          ? "FAILED"
          : refund.status === "canceled"
            ? "CANCELLED"
            : "PENDING";

      if (
        status === "SUCCEEDED" &&
        refund.metadata?.refund_policy === "FULL_GUEST_100_PERCENT"
      ) {
        const { data: localRefund, error: localRefundError } = await admin
          .from("refunds")
          .select("id,payment_id,reservation_id,platform_fee_refund_cents")
          .eq("id", refundId)
          .eq("payment_environment", environment)
          .single();
        if (localRefundError || !localRefund) {
          throw new Error("The local full-refund record could not be loaded.");
        }

        const { data: localPayment, error: localPaymentError } = await admin
          .from("payments")
          .select("provider_payment_id")
          .eq("id", localRefund.payment_id)
          .eq("payment_environment", environment)
          .single();
        if (localPaymentError || !localPayment?.provider_payment_id) {
          throw new Error("The local Stripe payment for the full refund could not be loaded.");
        }

        await ensureFullRefundApplicationFee({
          paymentIntentId: localPayment.provider_payment_id,
          refundId: localRefund.id,
          reservationId: localRefund.reservation_id,
          platformFeeRefundCents: Number(localRefund.platform_fee_refund_cents),
        });
      }

      const { error } = await admin.rpc("record_refund_result", {
        target_refund_id: refundId,
        target_provider_refund_id: refund.id,
        target_status: status,
        target_failure_message: refund.failure_reason || null,
      });
      if (error) throw error;

      await markProcessorEvent(admin, event.id, "PROCESSED");
      return NextResponse.json({ received: true });
    }

    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed"
    ) {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      const paymentIntentId =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;

      const { error } = await admin.rpc("record_stripe_dispute", {
        target_provider_payment_id: paymentIntentId || null,
        target_provider_charge_id: chargeId || null,
        target_dispute_id: dispute.id,
        target_amount_cents: dispute.amount,
        target_dispute_status: dispute.status,
        target_outcome: dispute.status,
        expected_environment: environment,
      });
      if (error) throw error;

      await markProcessorEvent(admin, event.id, "PROCESSED");
      return NextResponse.json({ received: true });
    }

    await markProcessorEvent(admin, event.id, "IGNORED");
    return NextResponse.json({ received: true, ignored: true });
  } catch (error) {
    console.error("[stripe webhook] processing failed", error);

    await markProcessorEvent(
      admin,
      event.id,
      "ERROR",
      error instanceof Error ? error.message : "Unknown webhook error",
    );

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
