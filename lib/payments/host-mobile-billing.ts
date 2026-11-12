import type Stripe from "stripe";
import { getStripeClient } from "@/lib/payments/stripe-checkout";

export const mobileAppEnabled = () =>
  process.env.HOST_MOBILE_APP_ENABLED !== "false";
/** Host and guest web apps are free. No new subscription checkouts are offered. */
export const mobileBillingEnabled = () => false;

const priceEnv = {
  monthly: "STRIPE_HOST_MOBILE_MONTHLY_PRICE_ID",
  yearly: "STRIPE_HOST_MOBILE_YEARLY_PRICE_ID",
} as const;
export type HostMobilePlan = keyof typeof priceEnv;

export function hostMobilePriceId(plan: HostMobilePlan) {
  const value = process.env[priceEnv[plan]]?.trim() || "";
  return value.startsWith("price_") ? value : null;
}

export const HOST_WEBAPP_PLANS = {
  monthly: {
    amount: 499,
    interval: "month",
    lookupKey: "fap_host_webapp_monthly_v1",
  },
  yearly: {
    amount: 2999,
    interval: "year",
    lookupKey: "fap_host_webapp_yearly_v2",
  },
} as const;
export async function resolveHostMobilePrice(plan: HostMobilePlan) {
  const stripe = getStripeClient(),
    configured = hostMobilePriceId(plan),
    expected = HOST_WEBAPP_PLANS[plan];
  // Prefer the live lookup key over a possibly stale Vercel price-ID override.
  // An old $39.99 annual env value must not shadow the new $29.99 rate.
  const lookup = await stripe.prices.list({
    lookup_keys: [expected.lookupKey],
    active: true,
    limit: 1,
  });
  const price = lookup.data[0] ??
    (configured ? await stripe.prices.retrieve(configured) : null);
  if (
    !price ||
    !price.active ||
    price.type !== "recurring" ||
    price.currency !== "usd" ||
    price.unit_amount !== expected.amount ||
    price.recurring?.interval !== expected.interval ||
    price.recurring.interval_count !== 1
  )
    throw new Error(
      "Host app price configuration does not match the displayed plan.",
    );
  return price;
}
export async function getHostMobilePrices() {
  if (!mobileBillingEnabled()) return [];
  const prices: Array<{
    plan: HostMobilePlan;
    priceId: string;
    label: string;
  }> = [];
  for (const plan of ["monthly", "yearly"] as const) {
    try {
      const price = await resolveHostMobilePrice(plan);
      prices.push({
        plan,
        priceId: price.id,
        label: `$${(price.unit_amount! / 100).toFixed(2)} / ${plan === "monthly" ? "month" : "year"}`,
      });
    } catch {
      console.error("[host web app] price unavailable", plan);
    }
  }
  return prices;
}

export function mobileBillingReturnUrl(kind: "success" | "cancel" | "portal") {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.findaplacebooking.com";
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Mobile subscription return URL must be HTTPS.");
  }
  url.pathname = "/host/mobile";
  url.search = kind === "portal" ? "" : `?billing=${kind}`;
  url.hash = "";
  return url.toString();
}

/** Becoming a verified partner stops future app charges without refunding past periods. */
export async function stopPartnerMobileRenewal(
  organizationId: string,
  customerId: string | null,
  subscriptionId: string | null,
) {
  if (!customerId) return;
  const stripe = getStripeClient();
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    if (
      customer !== customerId ||
      subscription.metadata?.organization_id !== organizationId ||
      subscription.metadata?.fap_product !== "HOST_MOBILE"
    )
      throw new Error("Partner subscription ownership mismatch.");
    if (
      !["canceled", "incomplete_expired"].includes(subscription.status) &&
      !subscription.cancel_at_period_end
    )
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
  }
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 100,
  });
  for (const session of sessions.data) {
    if (
      session.metadata?.fap_product === "HOST_MOBILE" &&
      session.metadata?.organization_id === organizationId
    )
      await stripe.checkout.sessions.expire(session.id);
  }
}

/** Reusing a checkout must never reuse a different/previously advertised price. */
export async function reusableHostMobileCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  priceId: string,
) {
  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 2,
  });
  if (
    items.data.length === 1 &&
    !items.has_more &&
    items.data[0].quantity === 1 &&
    items.data[0].price?.id === priceId
  )
    return session.url;
  await stripe.checkout.sessions.expire(session.id);
  return null;
}

/** Converting an existing free trial must not charge away its remaining time. */
export function hostMobileTrialSettings(
  expiresAt: string | null,
  now = Date.now(),
):
  | { trial_end: number }
  | { trial_period_days: number }
  | Record<string, never> {
  const end = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(end) || end <= now) return {};
  // Checkout requires at least 48 hours for a trial_end. Keep shorter remaining
  // trials by providing a stable two-day trial rather than charging immediately.
  return end - now >= 48 * 60 * 60 * 1000 + 5 * 60 * 1000
    ? { trial_end: Math.floor(end / 1000) }
    : { trial_period_days: 2 };
}
