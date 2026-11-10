import Stripe from "stripe";
import { getStripeClient } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";
function asCustomerId(
  customer: Stripe.Subscription["customer"],
): string | null {
  return typeof customer === "string" ? customer : (customer?.id ?? null);
}

function periodEndSeconds(subscription: Stripe.Subscription): number | null {
  // Stripe has versions that express current_period_end on subscription items
  // rather than on the parent subscription. Support both shapes.
  const itemEnds = (subscription.items?.data || []).map((item) =>
    Number(
      (item as Stripe.SubscriptionItem & { current_period_end?: number })
        .current_period_end || 0,
    ),
  );
  const topLevel = Number(
    (subscription as Stripe.Subscription & { current_period_end?: number })
      .current_period_end || 0,
  );
  const latest = Math.max(0, topLevel, ...itemEnds);
  return latest > 0 ? latest : null;
}

export async function reconcileHostAppSubscription(subscriptionId: string) {
  // Fetch canonical Stripe state rather than applying possibly out-of-order
  // webhook payload snapshots; retries become naturally idempotent.
  const checkedAt = new Date().toISOString();
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata?.fap_product !== "HOST_MOBILE")
    return "ignored" as const;
  const organizationId = subscription.metadata?.organization_id;
  const customerId = asCustomerId(subscription.customer);
  if (!organizationId || !customerId)
    throw new Error("Host mobile subscription metadata missing.");

  const admin = createAdminClient();
  const { data: stored, error } = await admin
    .from("host_mobile_access")
    .select(
      "organization_id,stripe_subscription_id,stripe_subscription_status,subscription_expires_at",
    )
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!stored || stored.organization_id !== organizationId) {
    // A payment must never grant access to an arbitrary host ID. Retry if the
    // customer record has not become visible yet.
    throw new Error(
      "Stripe customer does not match a registered host organization.",
    );
  }
  if (
    stored.stripe_subscription_id &&
    stored.stripe_subscription_id !== subscription.id
  ) {
    const tracked = await stripe.subscriptions.retrieve(
      stored.stripe_subscription_id,
    );
    const trackedEnd = periodEndSeconds(tracked);
    if (
      ["active", "trialing"].includes(tracked.status) &&
      trackedEnd &&
      trackedEnd * 1000 > Date.now()
    )
      return "ignored" as const;
  }

  const isPaid =
    subscription.status === "active" || subscription.status === "trialing";
  const periodEnd = periodEndSeconds(subscription);
  if (isPaid && !periodEnd)
    throw new Error("Stripe subscription has no confirmed billing period.");
  const expiration =
    isPaid && periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
  const { error: updateError } = await admin
    .from("host_mobile_access")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_subscription_status: subscription.status,
      stripe_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      subscription_expires_at: expiration,
      subscription_checked_at: checkedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("stripe_customer_id", customerId)
    .or(
      `subscription_checked_at.is.null,subscription_checked_at.lte.${checkedAt}`,
    );
  if (updateError) throw updateError;
  return "processed" as const;
}

function id(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}
export async function handleHostAppStripeEvent(event: Stripe.Event) {
  if (event.account) return "ignored" as const;
  const object = event.data.object;
  let subscriptionId: string | null = null;
  let risk = false;
  if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  )
    subscriptionId = (object as Stripe.Subscription).id;
  else if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    const session = object as Stripe.Checkout.Session;
    if (session.mode === "subscription")
      subscriptionId = id(session.subscription);
  } else if (
    [
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.payment_action_required",
    ].includes(event.type)
  ) {
    subscriptionId = id(
      (object as Stripe.Invoice).parent?.subscription_details?.subscription,
    );
  } else if (
    [
      "charge.refunded",
      "charge.dispute.created",
      "radar.early_fraud_warning.created",
    ].includes(event.type)
  ) {
    risk = true;
    const stripe = getStripeClient();
    const charge =
      event.type === "charge.refunded"
        ? (object as Stripe.Charge)
        : await stripe.charges.retrieve(
            id((object as { charge: string | Stripe.Charge }).charge)!,
          );
    const intent = id(charge.payment_intent);
    if (intent) {
      const links = await stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: intent },
        limit: 10,
      });
      for (const link of links.data) {
        const invoice =
          typeof link.invoice === "string"
            ? await stripe.invoices.retrieve(link.invoice)
            : link.invoice;
        if ("deleted" in invoice && invoice.deleted) continue;
        subscriptionId = id(
          (invoice as Stripe.Invoice).parent?.subscription_details
            ?.subscription,
        );
        if (subscriptionId) break;
      }
    }
  }
  if (!subscriptionId) return "ignored" as const;
  const result = await reconcileHostAppSubscription(subscriptionId);
  if (risk && result === "processed") {
    // Risk signals are recorded for admin review; never change lodging reservations.
    const sub = await getStripeClient().subscriptions.retrieve(subscriptionId);
    const admin = createAdminClient();
    const customer = id(sub.customer);
    const org = await admin
      .from("host_mobile_access")
      .select("organization_id")
      .eq("stripe_customer_id", customer!)
      .maybeSingle();
    if (org.error) throw org.error;
    if (org.data) {
      const audit = await admin
        .from("audit_logs")
        .insert({
          actor_profile_id: null,
          action: "host_webapp.billing_review_required",
          entity_type: "organization",
          entity_id: org.data.organization_id,
          reason: event.type,
          metadata: {
            stripe_event_id: event.id,
            stripe_subscription_id: subscriptionId,
          },
        });
      if (audit.error) throw audit.error;
    }
  }
  return result;
}
