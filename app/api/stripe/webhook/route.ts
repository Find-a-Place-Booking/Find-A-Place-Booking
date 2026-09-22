import { createHash } from "node:crypto";

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import {
  chargeProcessorFee,
  getStripeClient,
  reconcileApplicationFeeRefund,
  retrieveChargeWithBalanceTransaction,
} from "@/lib/payments/stripe-checkout";
import { sendBookingNotifications } from "@/lib/notifications/reservation-emails";
import { sendDirectChargePaymentConfirmedNotification } from "@/lib/notifications/direct-charge-emails";
import {
  sendDisputeNotifications,
  sendRefundNotifications,
} from "@/lib/notifications/operational-emails";
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

function constructStripeEvent(rawBody: string, signature: string) {
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (!secrets.length) {
    throw new Error("Stripe webhook secrets are not configured.");
  }

  let lastError: unknown = null;
  for (const secret of secrets) {
    try {
      return getStripeClient().webhooks.constructEvent(
        rawBody,
        signature,
        secret,
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Invalid Stripe webhook signature.");
}

function connectedAccountId(event: Stripe.Event) {
  const account = (event as Stripe.Event & { account?: string | null }).account;
  return typeof account === "string" ? account : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Stripe webhook signature is missing." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = constructStripeEvent(rawBody, signature);
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
  const eventAccount = connectedAccountId(event);

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
        metadata: {
          connected_account_id: eventAccount,
          charge_model: eventAccount ? "DIRECT" : "PLATFORM",
        },
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

      if (!reservationId || !paymentId || !eventAccount) {
        await markProcessorEvent(admin, event.id, "IGNORED");
        return NextResponse.json({ received: true, ignored: true });
      }

      const [{ data: payment, error: paymentLookupError }, reservationResult] =
        await Promise.all([
          admin
            .from("payments")
            .select("id,reservation_id,provider_payment_id,payment_environment,amount_cents,application_fee_cents,currency")
            .eq("id", paymentId)
            .eq("reservation_id", reservationId)
            .eq("provider", "STRIPE")
            .eq("payment_environment", environment)
            .single(),
          admin
            .from("reservations")
            .select("provider_account_ref,payment_environment")
            .eq("id", reservationId)
            .single(),
        ]);

      const reservation = reservationResult.data;
      if (
        paymentLookupError ||
        reservationResult.error ||
        !payment ||
        !reservation ||
        payment.payment_environment !== environment ||
        reservation.payment_environment !== environment ||
        reservation.provider_account_ref !== eventAccount ||
        Number(payment.amount_cents) !== intent.amount ||
        Number(payment.application_fee_cents) !== Number(intent.application_fee_amount || 0) ||
        payment.currency.toLowerCase() !== intent.currency.toLowerCase() ||
        intent.metadata?.payment_environment !== environment ||
        intent.metadata?.charge_model !== "DIRECT" ||
        (payment.provider_payment_id && payment.provider_payment_id !== intent.id)
      ) {
        throw new Error(
          "Stripe direct-charge event does not match the local payment route.",
        );
      }

      const chargeId =
        typeof intent.latest_charge === "string"
          ? intent.latest_charge
          : intent.latest_charge?.id;

      let processorFeeActualCents = 0;

      if (chargeId) {
        const charge = await retrieveChargeWithBalanceTransaction(
          chargeId,
          eventAccount,
        );
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

      try {
        await sendBookingNotifications(admin, reservationId);
      } catch (notificationError) {
        console.error(
          "[stripe webhook] booking confirmed but booking notification delivery failed",
          reservationId,
          notificationError,
        );
      }

      try {
        await sendDirectChargePaymentConfirmedNotification(
          admin,
          reservationId,
          paymentId,
        );
      } catch (notificationError) {
        console.error(
          "[stripe webhook] direct-charge payment confirmed but host payment notification failed",
          reservationId,
          notificationError,
        );
      }

      await markProcessorEvent(admin, event.id, "PROCESSED");
      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const reservationId = intent.metadata?.reservation_id;
      const paymentId = intent.metadata?.payment_id;

      if (!reservationId || !paymentId || !eventAccount) {
        await markProcessorEvent(admin, event.id, "IGNORED");
        return NextResponse.json({ received: true, ignored: true });
      }

      const [{ data: failedPayment }, { data: failedReservation }] =
        await Promise.all([
          admin.from("payments")
            .select("id,provider_payment_id")
            .eq("id", paymentId)
            .eq("reservation_id", reservationId)
            .eq("provider", "STRIPE")
            .eq("payment_environment", environment)
            .maybeSingle(),
          admin.from("reservations")
            .select("provider_account_ref,payment_environment")
            .eq("id", reservationId)
            .maybeSingle(),
        ]);

      if (
        !failedPayment || !failedReservation ||
        failedPayment.provider_payment_id !== intent.id ||
        failedReservation.provider_account_ref !== eventAccount ||
        failedReservation.payment_environment !== environment
      ) {
        throw new Error("Failed payment event does not match the connected merchant and payment.");
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

      const { data: localRefund, error: refundLookupError } = await admin
        .from("refunds")
        .select("id,provider_refund_id,payment_environment,reservation_id,payment_id,platform_fee_refund_cents,application_fee_refund_status")
        .eq("id", refundId)
        .maybeSingle();
      if (refundLookupError || !localRefund) {
        throw new Error("Refund event has no matching local refund.");
      }
      const { data: refundReservation } = await admin
        .from("reservations")
        .select("provider_account_ref")
        .eq("id", localRefund.reservation_id)
        .maybeSingle();
      if (
        !eventAccount || !refundReservation ||
        refundReservation.provider_account_ref !== eventAccount ||
        localRefund.payment_environment !== environment ||
        (localRefund.provider_refund_id && localRefund.provider_refund_id !== refund.id)
      ) {
        throw new Error("Refund event does not match the connected merchant and refund.");
      }

      const status =
        refund.status === "succeeded"
          ? "SUCCEEDED"
          : refund.status === "failed"
            ? "FAILED"
            : refund.status === "canceled"
              ? "CANCELLED"
              : "PENDING";

      const { error } = await admin.rpc("record_refund_result", {
        target_refund_id: refundId,
        target_provider_refund_id: refund.id,
        target_status: status,
        target_failure_message: refund.failure_reason || null,
      });
      if (error) throw error;

      if (status === "SUCCEEDED") {
        if (
          Number(localRefund.platform_fee_refund_cents) > 0 &&
          localRefund.application_fee_refund_status !== "SUCCEEDED"
        ) {
          const { data: refundPayment, error: paymentError } = await admin
            .from("payments")
            .select("provider_payment_id,provider_charge_id")
            .eq("id", localRefund.payment_id)
            .single();
          if (paymentError || !refundPayment?.provider_payment_id) {
            throw new Error("Application-fee refund needs a Stripe payment reference.");
          }
          try {
            const feeRefund = await reconcileApplicationFeeRefund({
              connectedAccountId: eventAccount,
              paymentIntentId: refundPayment.provider_payment_id,
              chargeId: refundPayment.provider_charge_id,
              refundId,
              reservationId: localRefund.reservation_id,
              amountCents: Number(localRefund.platform_fee_refund_cents),
            });
            const { error: feeRecordError } = await admin.rpc(
              "record_application_fee_refund_result",
              {
                target_refund_id: refundId,
                target_status: "SUCCEEDED",
                target_application_fee_refund_id: feeRefund.id,
              },
            );
            if (feeRecordError) throw feeRecordError;
          } catch (feeError) {
            await admin.rpc("record_application_fee_refund_result", {
              target_refund_id: refundId,
              target_status: "FAILED",
              target_error: feeError instanceof Error ? feeError.message : "Fee refund needs reconciliation.",
            });
            throw feeError;
          }
        }

        if (localRefund.reservation_id) {
          await admin
            .from("reservation_cancellation_requests")
            .update({
              status: "COMPLETED",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("reservation_id", localRefund.reservation_id)
            .eq("status", "APPROVED");
        }
      }

      try {
        await sendRefundNotifications(admin, refundId);
      } catch (notificationError) {
        console.error(
          "[stripe webhook] refund recorded but notification delivery failed",
          refundId,
          notificationError,
        );
      }

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

      try {
        await sendDisputeNotifications(admin, {
          paymentEnvironment: environment,
          paymentIntentId,
          chargeId,
          disputeId: dispute.id,
          amountCents: dispute.amount,
          currency: dispute.currency || "usd",
          status: dispute.status,
          closed: event.type === "charge.dispute.closed",
        });
      } catch (notificationError) {
        console.error(
          "[stripe webhook] dispute recorded but notification delivery failed",
          dispute.id,
          notificationError,
        );
      }

      await markProcessorEvent(admin, event.id, "PROCESSED");
      return NextResponse.json({ received: true });
    }

    // Payout events now belong to the host's normal Stripe account lifecycle.
    // Find A Place does not create or reconcile host bank payouts anymore.
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
