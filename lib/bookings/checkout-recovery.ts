import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cancelDirectPaymentIntent,
  retrievePaymentIntent,
} from "@/lib/payments/stripe-checkout";

const CANCELLABLE_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

export async function closeUnfinishedReservationPayments(input: {
  admin: SupabaseClient;
  reservationId: string;
  connectedAccountId: string | null;
}) {
  const { data: payments, error } = await input.admin
    .from("payments")
    .select("id,status,provider_payment_id")
    .eq("reservation_id", input.reservationId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to inspect checkout payment: ${error.message}`);
  }

  let closed = 0;

  for (const payment of payments ?? []) {
    const localStatus = String(payment.status || "");

    if (localStatus === "SUCCEEDED" || localStatus === "PROCESSING") {
      throw new Error("Payment is already processing for this reservation.");
    }

    if (payment.provider_payment_id) {
      if (!input.connectedAccountId) {
        throw new Error("Connected Stripe account is missing for this payment.");
      }

      const intent = await retrievePaymentIntent(
        payment.provider_payment_id,
        input.connectedAccountId,
      );

      if (intent.status === "succeeded" || intent.status === "processing") {
        throw new Error("Payment is already processing for this reservation.");
      }

      if (intent.status !== "canceled") {
        if (!CANCELLABLE_INTENT_STATUSES.has(intent.status)) {
          throw new Error(
            `Stripe payment cannot be safely closed from status ${intent.status}.`,
          );
        }

        await cancelDirectPaymentIntent(
          payment.provider_payment_id,
          input.connectedAccountId,
        );
      }
    }

    const { error: updateError } = await input.admin
      .from("payments")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .neq("status", "SUCCEEDED");

    if (updateError) {
      throw new Error(
        `Unable to close the old payment attempt: ${updateError.message}`,
      );
    }

    closed += 1;
  }

  return closed;
}
