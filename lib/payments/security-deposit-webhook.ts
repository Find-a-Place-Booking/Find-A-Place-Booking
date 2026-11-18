import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Called only AFTER the standard webhook's Stripe signature, environment and
// processor-event replay checks. This path intentionally never touches the
// bookings, payments, tax, platform commission or lodging refund tables.
export async function processFapDepositStripeEvent(
  event: Stripe.Event, admin: SupabaseClient, connectedAccountId: string | null,
): Promise<boolean> {
  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.kind !== "FAP_SECURITY_DEPOSIT") return false;
    const id = intent.metadata.deposit_id;
    const { data: deposit, error } = await admin.from("reservation_security_deposits")
      .select("id,stripe_account_id,stripe_payment_intent_id,amount_cents,status")
      .eq("id", id).maybeSingle();
    if (error || !deposit || !connectedAccountId || deposit.stripe_account_id !== connectedAccountId ||
      deposit.stripe_payment_intent_id !== intent.id || deposit.amount_cents !== intent.amount)
      throw new Error("Verified deposit event does not match a recorded connected charge.");
    if (deposit.status === "REFUNDED" || deposit.status === "REFUND_PENDING") return true;
    const status = event.type === "payment_intent.succeeded" ? "PAID" : "FAILED";
    const { error: saveError } = await admin.from("reservation_security_deposits")
      .update({ status, ...(status === "PAID" ? { paid_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (saveError) throw new Error(saveError.message);
    return true;
  }
  if (event.type.startsWith("refund.")) {
    const refund = event.data.object as Stripe.Refund;
    if (refund.metadata?.kind !== "FAP_SECURITY_DEPOSIT_REFUND") return false;
    const id = refund.metadata.deposit_id;
    const { data: deposit, error } = await admin.from("reservation_security_deposits")
      .select("id,stripe_account_id,stripe_payment_intent_id,amount_cents,status")
      .eq("id", id).maybeSingle();
    const pi = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    if (error || !deposit || !connectedAccountId || deposit.stripe_account_id !== connectedAccountId ||
      deposit.stripe_payment_intent_id !== pi || deposit.amount_cents !== refund.amount)
      throw new Error("Deposit refund event is not linked to this connected payment.");
    const status = refund.status === "succeeded" ? "REFUNDED" : refund.status === "failed" ? "PAID" : "REFUND_PENDING";
    const { error: saveError } = await admin.from("reservation_security_deposits")
      .update({ status, stripe_refund_id: refund.id,
        ...(status === "REFUNDED" ? { refunded_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString() }).eq("id", id);
    if (saveError) throw new Error(saveError.message);
    return true;
  }
  if (event.type.startsWith("charge.dispute.")) {
    const dispute = event.data.object as Stripe.Dispute;
    const intentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    if (!intentId) return false;
    const { data: deposit } = await admin.from("reservation_security_deposits")
      .select("id,stripe_account_id").eq("stripe_payment_intent_id", intentId).maybeSingle();
    if (!deposit) return false;
    if (!connectedAccountId || deposit.stripe_account_id !== connectedAccountId)
      throw new Error("Deposit dispute is not linked to its original connected account.");
    const { error } = await admin.from("reservation_security_deposits")
      .update({ status: "DISPUTED", updated_at: new Date().toISOString() }).eq("id", deposit.id);
    if (error) throw new Error(error.message);
    return true;
  }
  return false;
}
