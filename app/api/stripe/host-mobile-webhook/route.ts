import Stripe from "stripe";
import {handleHostAppStripeEvent} from "@/lib/payments/host-app-events";
import { NextRequest, NextResponse } from "next/server";

import { getStripeClient } from "@/lib/payments/stripe-checkout";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_HOST_MOBILE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("stripe-signature");
  if (!secret) return NextResponse.json({ error: "Host mobile Stripe webhook is not configured." }, { status: 503, headers: NO_STORE });
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400, headers: NO_STORE });

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400, headers: NO_STORE });
  }
  if (event.livemode !== (stripeEnvironment() === "LIVE")) {
    return NextResponse.json({ error: "Incorrect Stripe mode." }, { status: 400, headers: NO_STORE });
  }
  if (event.account) return NextResponse.json({ received: true, ignored: true }, { headers: NO_STORE });

  try {
    const result = await handleHostAppStripeEvent(event);
    return NextResponse.json({ received: true, result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[host mobile billing webhook] retryable reconciliation failure", {
      errorType: error instanceof Error ? error.name : "unknown",
      eventType: event.type,
    });
    return NextResponse.json({ error: "Subscription reconciliation temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}
