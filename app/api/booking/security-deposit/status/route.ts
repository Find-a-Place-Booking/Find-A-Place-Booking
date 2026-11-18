import { NextRequest, NextResponse } from "next/server";
import { guestCheckoutTokenMatches, sameOrigin } from "@/lib/payments/booking-runtime";
import { getStripeClient } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { securityDepositPaymentsEnabled } from "@/lib/payments/security-deposit-toggle";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    if (!securityDepositPaymentsEnabled()) return NextResponse.json({ status: "NOT_REQUIRED" });
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const body = (await request.json()) as { reservationId?: string; checkoutToken?: string };
    const id = body.reservationId?.trim() || "";
    if (!/^[0-9a-f-]{36}$/i.test(id) || !guestCheckoutTokenMatches(id, body.checkoutToken))
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    const admin = createAdminClient();
    const { data: deposit, error } = await admin.from("reservation_security_deposits")
      .select("id,status,amount_cents,stripe_payment_intent_id,stripe_account_id").eq("reservation_id", id).maybeSingle();
    if (error || !deposit) return NextResponse.json({ status: "NOT_REQUIRED" });
    if (!deposit.stripe_payment_intent_id || !deposit.stripe_account_id)
      return NextResponse.json({ status: deposit.status, amountCents: deposit.amount_cents });
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(deposit.stripe_payment_intent_id, {}, { stripeAccount: deposit.stripe_account_id });
    if (intent.status === "succeeded" && deposit.status !== "PAID" && deposit.status !== "REFUND_PENDING" && deposit.status !== "REFUNDED") {
      const { error: updateError } = await admin.from("reservation_security_deposits")
        .update({ status: "PAID", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", deposit.id).in("status", ["PENDING", "PROCESSING", "FAILED"]);
      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ status: "PAID", amountCents: deposit.amount_cents });
    }
    return NextResponse.json({ status: deposit.status, stripeStatus: intent.status, amountCents: deposit.amount_cents });
  } catch (error) {
    console.error("[deposit status]", error);
    return NextResponse.json({ error: "Unable to check deposit status." }, { status: 500 });
  }
}
