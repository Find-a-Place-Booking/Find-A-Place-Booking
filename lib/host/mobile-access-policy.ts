/**
 * The host web app is free for all verified organization owners/managers.
 * Partner designation remains separate and does not control app entitlement.
 * Legacy modes are retained in the type to keep historical billing records safe.
 */
export type HostMobileAccessMode =
  | "FREE"
  | "PARTNER"
  | "SUBSCRIBED"
  | "TRIAL"
  | "LOCKED";

export function hostMobileAccessMode(input: {
  partnerStatus: string | null | undefined;
  trialExpiresAt: string | null | undefined;
  subscriptionExpiresAt: string | null | undefined;
  stripeSubscriptionStatus: string | null | undefined;
  now?: number;
}): HostMobileAccessMode {
  return input.partnerStatus === "VERIFIED" ? "PARTNER" : "FREE";
}
