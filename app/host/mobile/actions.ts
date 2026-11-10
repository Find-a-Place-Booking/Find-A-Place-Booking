"use server";

import { redirect } from "next/navigation";

import { requireMobileOrgOwner } from "@/lib/host/mobile-access";
import {
  resolveHostMobilePrice, mobileAppEnabled, mobileBillingEnabled,
  mobileBillingReturnUrl, type HostMobilePlan,
} from "@/lib/payments/host-mobile-billing";
import { getStripeClient } from "@/lib/payments/stripe-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

function input(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim().slice(0, 120);
}

// Explicitly opted-in free trial; no charge and no Stripe subscription.
export async function activateMobileTrial(form: FormData) {
  const organizationId = input(form, "organizationId");
  const { organization, profileId } = await requireMobileOrgOwner(organizationId);
  if (!mobileAppEnabled()) redirect("/host/mobile?billing=not-launched");
  if (organization.mode === "PARTNER" || organization.mode === "SUBSCRIBED") {
    redirect("/host/mobile");
  }
  if (!organization.canStartTrial) redirect("/host/mobile?billing=trial-used");
  const admin = createAdminClient();
  const { error } = await admin.rpc("start_host_mobile_trial", {
    target_organization_id: organizationId,
    target_profile_id: profileId,
  });
  if (error) {
    console.error("[host mobile] trial unavailable", { code: error.code });
    redirect("/host/mobile?billing=trial-unavailable");
  }
  redirect("/host/mobile?billing=trial-started");
}

export async function startMobileSubscription(form: FormData) {
  const organizationId = input(form, "organizationId");
  const plan = input(form, "plan") as HostMobilePlan;
  const { organization, profileId } = await requireMobileOrgOwner(organizationId);
  if (!mobileBillingEnabled()) redirect("/host/mobile?billing=not-launched");
  if (organization.partnerStatus === "VERIFIED" || organization.mode === "SUBSCRIBED") {
    redirect("/host/mobile");
  }
  if (plan !== "monthly" && plan !== "yearly") redirect("/host/mobile?billing=invalid-plan");


  let checkoutUrl: string | null = null;
  try {
    const stripe = getStripeClient();
    const price = await resolveHostMobilePrice(plan);
    const priceId = price.id;
    if (!price.active || price.type !== "recurring" || !price.recurring ||
        price.recurring.interval !== (plan === "monthly" ? "month" : "year")) {
      throw new Error("Configured Stripe price is not an active recurring plan.");
    }

    const admin = createAdminClient();
    const { data: access, error: lookupError } = await admin
      .from("host_mobile_access")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    let customerId = access?.stripe_customer_id as string | undefined;
    if (!customerId) {
      // Stable Stripe idempotency prevents two requests for the same owner/org
      // from creating duplicate customer records.
      const { data: profile } = await admin.from("profiles")
        .select("email").eq("id", profileId).maybeSingle();
      const customer = await stripe.customers.create({
        email: profile?.email || undefined,
        name: organization.name,
        metadata: { fap_product: "HOST_MOBILE", organization_id: organizationId },
      }, { idempotencyKey: `fap-host-mobile-customer-${organizationId}` });
      customerId = customer.id;
      const { error: savedError } = await admin.from("host_mobile_access")
        .upsert({
          organization_id: organizationId,
          stripe_customer_id: customerId,
        }, { onConflict: "organization_id" });
      if (savedError) throw savedError;
    }

    // Never create a second checkout while Stripe already has an ongoing
    // subscription for this organization (including incomplete/past_due).
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (subs.data.some(sub => ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(sub.status))) {
      redirect("/host/mobile?billing=existing-subscription");
    }

    // One open host-mobile Checkout per organization. A host might click twice,
    // reopen the page, or return from Stripe without completing payment.
    // Reuse the existing session rather than opening multiple payment paths.
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 100 });
    const mobileSessions = sessions.data.filter((session) =>
      session.mode === "subscription" &&
      session.metadata?.fap_product === "HOST_MOBILE" &&
      session.metadata?.organization_id === organizationId,
    );
    const openSession = mobileSessions.find((session) =>
      session.status === "open" &&
      typeof session.url === "string" &&
      Number(session.expires_at || 0) * 1000 > Date.now(),
    );
    if (openSession) {
      if (openSession.metadata?.plan !== plan) {
        redirect("/host/mobile?billing=checkout-already-open");
      }
      checkoutUrl = openSession.url;
    } else {
      // Idempotency is tied to the previous checkout session, not a random
      // UUID. Concurrent requests with the same starting state cannot create
      // separate sessions. After an expired checkout is cleared, a new key
      // allows a fresh attempt without waiting 24 hours.
      const previousSessionId = mobileSessions[0]?.id || "initial";
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        integration_identifier: "fap_host_webapp_qzmpxjra",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: mobileBillingReturnUrl("success"),
        cancel_url: mobileBillingReturnUrl("cancel"),
        client_reference_id: organizationId,
        metadata: {
          fap_product: "HOST_MOBILE", organization_id: organizationId, plan,
        },
        subscription_data: {
          metadata: { fap_product: "HOST_MOBILE", organization_id: organizationId },
        },
      }, {
        idempotencyKey: `fap-host-mobile-checkout-${organizationId}-${previousSessionId}`,
      });
      checkoutUrl = session.url;
    }
  } catch (error) {
    // Next.js redirect() throws; it must not be swallowed as a billing error.
    if (error && typeof error === "object" && "digest" in error &&
        String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("[host mobile] subscription checkout error", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    redirect("/host/mobile?billing=unavailable");
  }
  if (!checkoutUrl) redirect("/host/mobile?billing=unavailable");
  redirect(checkoutUrl);
}

export async function manageMobileSubscription(form: FormData) {
  const organizationId = input(form, "organizationId");
  await requireMobileOrgOwner(organizationId);
  // Existing customers must be able to cancel even if new signups are paused.
  let portalUrl: string | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("host_mobile_access")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId).maybeSingle();
    if (error || !data?.stripe_customer_id) throw new Error("Billing customer not found.");
    const portal = await getStripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: mobileBillingReturnUrl("portal"),
    });
    portalUrl = portal.url;
  } catch (error) {
    console.error("[host mobile] customer portal error", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    redirect("/host/mobile?billing=unavailable");
  }
  if (!portalUrl) redirect("/host/mobile?billing=unavailable");
  redirect(portalUrl);
}

// A canceled Checkout session remains "open" at Stripe. Let the account
// owner explicitly expire it before switching monthly/annual plans.
export async function resetMobileSubscriptionCheckout(form: FormData) {
  const organizationId = input(form, "organizationId");
  await requireMobileOrgOwner(organizationId);
  try {
    const admin = createAdminClient();
    const { data: row, error } = await admin.from("host_mobile_access")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId).maybeSingle();
    if (error) throw error;
    if (row?.stripe_customer_id) {
      const stripe = getStripeClient();
      const sessions = await stripe.checkout.sessions.list({
        customer: row.stripe_customer_id, limit: 100,
      });
      const candidates = sessions.data.filter((session) =>
        session.status === "open" && session.mode === "subscription" &&
        session.metadata?.fap_product === "HOST_MOBILE" &&
        session.metadata?.organization_id === organizationId,
      );
      for (const session of candidates) {
        await stripe.checkout.sessions.expire(session.id);
      }
    }
  } catch (error) {
    console.error("[host mobile] checkout reset failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    redirect("/host/mobile?billing=unavailable");
  }
  redirect("/host/mobile?billing=checkout-cleared");
}
