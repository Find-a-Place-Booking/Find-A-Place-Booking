import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  chargeProcessorFee,
  retrieveChargeWithBalanceTransaction,
} from "@/lib/payments/stripe-guest";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function verifyStripeSignature(rawBody: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!header) throw new Error("Missing Stripe-Signature header.");

  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || !signatures.length) {
    throw new Error("Invalid Stripe signature header.");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    throw new Error("Stripe webhook timestamp is outside tolerance.");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    try {
      const candidate = Buffer.from(signature, "hex");
      return (
        candidate.length === expectedBuffer.length &&
        timingSafeEqual(candidate, expectedBuffer)
      );
    } catch {
      return false;
    }
  });

  if (!valid) throw new Error("Stripe webhook signature verification failed.");

  return JSON.parse(rawBody) as {
    id: string;
    type: string;
    data: { object: Record<string, any> };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let event;
  try {
    event = verifyStripeSignature(
      rawBody,
      request.headers.get("stripe-signature"),
    );
  } catch (error) {
    console.error("[stripe webhook] rejected", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const object = event.data.object;
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");

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
        external_object_id: object?.id ?? null,
        payload_sha256: payloadSha256,
        processing_status: "RECEIVED",
        metadata: {},
      });

    if (insertError) {
      console.error("[stripe webhook] event persistence failed", insertError);
      return NextResponse.json({ error: "Event persistence failed" }, { status: 500 });
    }
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const reservationId = object.metadata?.reservation_id as string | undefined;
      const paymentId = object.metadata?.payment_id as string | undefined;

      if (reservationId && paymentId) {
        const chargeId =
          typeof object.latest_charge === "string"
            ? object.latest_charge
            : object.latest_charge?.id;

        let processorFeeActualCents = 0;

        if (chargeId) {
          const charge = await retrieveChargeWithBalanceTransaction(chargeId);
          processorFeeActualCents = chargeProcessorFee(charge);
        }

        const { error } = await admin.rpc(
          "confirm_sandbox_reservation_payment",
          {
            target_reservation_id: reservationId,
            target_payment_id: paymentId,
            target_provider_payment_id: object.id,
            target_provider_charge_id: chargeId || null,
            target_processor_fee_actual_cents: processorFeeActualCents,
          },
        );

        if (error) throw error;
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const reservationId = object.metadata?.reservation_id as string | undefined;
      const paymentId = object.metadata?.payment_id as string | undefined;

      if (reservationId && paymentId) {
        const { error } = await admin.rpc(
          "mark_sandbox_reservation_payment_failed",
          {
            target_reservation_id: reservationId,
            target_payment_id: paymentId,
            target_failure_code:
              object.last_payment_error?.code || "payment_failed",
            target_failure_message:
              object.last_payment_error?.message ||
              "Stripe reported that the payment failed.",
          },
        );

        if (error) throw error;
      }
    }

    await admin
      .from("processor_events")
      .update({
        processing_status: "PROCESSED",
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("provider", "STRIPE")
      .eq("external_event_id", event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe webhook] processing failed", error);

    await admin
      .from("processor_events")
      .update({
        processing_status: "ERROR",
        processed_at: new Date().toISOString(),
        error_message:
          error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      })
      .eq("provider", "STRIPE")
      .eq("external_event_id", event.id);

    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
