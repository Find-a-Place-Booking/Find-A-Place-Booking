"use server";

import { redirect } from "next/navigation";

/**
 * Legacy hosted-onboarding action retained only so an old form submission cannot
 * recreate the previous payout-account flow. Current Stripe connection is handled
 * by the embedded merchant/direct-charge account-session routes on /host/payments.
 */
export async function startStripeOnboarding(_formData?: FormData) {
  redirect("/host/payments");
}
