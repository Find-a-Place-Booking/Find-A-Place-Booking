import { NextRequest, NextResponse } from "next/server";
import { guestCheckoutTokenMatches, sameOrigin } from "@/lib/payments/booking-runtime";
import { getStripeClient } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { securityDepositPaymentsEnabled } from "@/lib/payments/security-deposit-toggle";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!securityDepositPaymentsEnabled()) return NextResponse.json({ error: "Security deposit payments are temporarily unavailable." }, { status: 503 });
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const data = (await request.json()) as { reservationId?: string; checkoutToken?: string };
    const reservationId = data.reservationId?.trim() || "";
    if (!/^[0-9a-f-]{36}$/i.test(reservationId) || !guestCheckoutTokenMatches(reservationId, data.checkoutToken))
      return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const admin = createAdminClient();
    const [{ data: reservation }, { data: deposit }] = await Promise.all([
      admin.from("reservations").select("id,status,check_out,provider_account_ref,payment_provider,payment_status,confirmation_code").eq("id", reservationId).maybeSingle(),
      admin.from("reservation_security_deposits").select("id,status,amount_cents,currency,stripe_payment_intent_id").eq("reservation_id", reservationId).maybeSingle(),
    ]);
    if (!reservation || !deposit || reservation.status !== "CONFIRMED" || reservation.payment_provider !== "STRIPE")
      return NextResponse.json({ error: "No confirmed booking with an outstanding deposit." }, { status: 409 });
    if (reservation.check_out < new Date().toISOString().slice(0, 10))
      return NextResponse.json({ error: "This stay has ended. Contact the host about the deposit." }, { status: 409 });
    if (!String(reservation.provider_account_ref || "").startsWith("acct_"))
      return NextResponse.json({ error: "The host's Stripe connection is unavailable." }, { status: 409 });
    if (deposit.status === "PAID" || deposit.status === "REFUND_PENDING" || deposit.status === "REFUNDED")
      return NextResponse.json({ error: "The deposit has already been paid." }, { status: 409 });
    if (deposit.status === "CANCELLED") return NextResponse.json({ error: "The deposit is cancelled." }, { status: 409 });

    const stripe = getStripeClient();
    const account = reservation.provider_account_ref;
    const existingId = deposit.stripe_payment_intent_id;
    const intent = existingId
      ? await stripe.paymentIntents.retrieve(existingId, {}, { stripeAccount: account })
      : await stripe.paymentIntents.create({
          amount: deposit.amount_cents, currency: deposit.currency.toLowerCase(),
          payment_method_types: ["card"],
          description: `Refundable deposit · FAP booking ${reservation.confirmation_code}`,
          metadata: { kind: "FAP_SECURITY_DEPOSIT", deposit_id: deposit.id, reservation_id: reservationId },
        }, { stripeAccount: account, idempotencyKey: `fap-deposit-${deposit.id}-v1` });

    if (intent.amount !== deposit.amount_cents || intent.currency.toUpperCase() !== deposit.currency)
      throw new Error("Deposit amount and payment session do not match.");
    if (intent.status === "succeeded") return NextResponse.json({ status: "PAID" });
    if (!intent.client_secret) return NextResponse.json({ error: "Deposit session unavailable." }, { status: 409 });
    const { error: saveError } = await admin.from("reservation_security_deposits")
      .update({ stripe_account_id: account, stripe_payment_intent_id: intent.id, status: "PROCESSING", updated_at: new Date().toISOString() })
      .eq("id", deposit.id).in("status", ["PENDING", "PROCESSING", "FAILED"]);
    if (saveError) throw new Error(saveError.message);
    return NextResponse.json({ clientSecret: intent.client_secret, connectedAccountId: account, amountCents: deposit.amount_cents, currency: deposit.currency });
  } catch (error) {
    console.error("[deposit intent]", error);
    return NextResponse.json({ error: "Unable to start the security-deposit payment. Try again or contact the host." }, { status: 500 });
  }
}
