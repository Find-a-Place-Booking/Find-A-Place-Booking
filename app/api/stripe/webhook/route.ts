import { createHash } from "node:crypto";

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import {
  chargeProcessorFee,
  getStripeClient,
  retrieveChargeWithBalanceTransaction,
} from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function markProcessorEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  status: "PROCESSED" | "IGNORED" | "ERROR",
  errorMessage?: string | null,
) {
  await admin
    .from("processor_events")
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ? errorMessage.slice(0, 500) : null,
    })
    .eq("provider", "STRIPE")
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

  const admin = createAdminClient();
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const object = event.data.object as { id?: string };

  const { data: existing } = await admin
    .from("processor_events")
    .select("id,processing_status")
    .eq("provider", "STRIPE")
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
        .select("id,reservation_id,provider_payment_id")
        .eq("id", paymentId)
        .eq("reservation_id", reservationId)
        .eq("provider", "STRIPE")
        .single();

      if (
        paymentLookupError ||
        !payment ||
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
