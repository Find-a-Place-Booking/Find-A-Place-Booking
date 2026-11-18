"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/payments/stripe-checkout";

export async function refundSecurityDeposit(form: FormData) {
  const id = String(form.get("depositId") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/host/security-deposits?error=invalid");
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/host/sign-in?next=%2Fhost%2Fsecurity-deposits");
  // The regular authenticated Supabase client uses RLS to verify membership.
  const { data: visibleDeposit, error: visibleError } = await client.from("reservation_security_deposits")
    .select("id,reservation_id,amount_cents,status,stripe_payment_intent_id,stripe_account_id")
    .eq("id", id).maybeSingle();
  if (visibleError || !visibleDeposit) redirect("/host/security-deposits?error=access");
  if (visibleDeposit.status === "REFUNDED") redirect("/host/security-deposits?result=refunded");
  if (visibleDeposit.status !== "PAID" || !visibleDeposit.stripe_payment_intent_id || !visibleDeposit.stripe_account_id)
    redirect("/host/security-deposits?error=not-paid");
  const admin = createAdminClient();
  const { data: reservation } = await admin.from("reservations").select("check_out").eq("id", visibleDeposit.reservation_id).maybeSingle();
  if (!reservation) redirect("/host/security-deposits?error=reservation");
  if (reservation.check_out > new Date().toISOString().slice(0, 10))
    redirect("/host/security-deposits?error=before-checkout");

  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(visibleDeposit.stripe_payment_intent_id, {}, { stripeAccount: visibleDeposit.stripe_account_id });
    if (intent.status !== "succeeded") throw new Error("Deposit payment has not settled at Stripe.");
    const refund = await stripe.refunds.create({
      payment_intent: intent.id,
      amount: visibleDeposit.amount_cents,
      reason: "requested_by_customer",
      metadata: { kind: "FAP_SECURITY_DEPOSIT_REFUND", deposit_id: id, reservation_id: visibleDeposit.reservation_id },
    }, {
      stripeAccount: visibleDeposit.stripe_account_id,
      idempotencyKey: `fap-deposit-refund-${id}-full-v1`,
    });
    const status = refund.status === "succeeded" ? "REFUNDED" : "REFUND_PENDING";
    const { error } = await admin.from("reservation_security_deposits")
      .update({ status, stripe_refund_id: refund.id, ...(status === "REFUNDED" ? { refunded_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "PAID");
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[host deposit refund]", error);
    redirect("/host/security-deposits?error=refund");
  }
  revalidatePath("/host/security-deposits");
  redirect("/host/security-deposits?result=refund-requested");
}
