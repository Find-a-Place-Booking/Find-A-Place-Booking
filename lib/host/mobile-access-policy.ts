/** Server-authoritative access rules, deliberately independent of booking commission. */
export type HostMobileAccessMode = "PARTNER" | "SUBSCRIBED" | "TRIAL" | "LOCKED";

function future(value: string | null | undefined, now: number) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

export function hostMobileAccessMode(input: {
  partnerStatus: string | null | undefined;
  trialExpiresAt: string | null | undefined;
  subscriptionExpiresAt: string | null | undefined;
  stripeSubscriptionStatus: string | null | undefined;
  now?: number;
}): HostMobileAccessMode {
  const now = input.now ?? Date.now();
  // A verified partner ALWAYS receives included access, irrespective of the
  // organization's 7% booking fee. This is recalculated on each request.
  if (input.partnerStatus === "VERIFIED") return "PARTNER";
  if (
    (input.stripeSubscriptionStatus === "active" ||
      input.stripeSubscriptionStatus === "trialing") &&
    future(input.subscriptionExpiresAt, now)
  ) return "SUBSCRIBED";
  if (future(input.trialExpiresAt, now)) return "TRIAL";
  return "LOCKED";
}
