import {stopPartnerMobileRenewal} from "@/lib/payments/host-mobile-billing";
import { redirect } from "next/navigation";

import { hostMobileAccessMode, type HostMobileAccessMode } from "@/lib/host/mobile-access-policy";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = { organization_id: string; role: string };
type Org = { id: string; name: string; status: string; partner_status: string };
type AccessRow = {
  organization_id: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_cancel_at_period_end: boolean;
};

export type HostMobileOrganization = {
  id: string;
  name: string;
  role: "OWNER" | "MANAGER";
  partnerStatus: string;
  mode: HostMobileAccessMode;
  entitled: boolean;
  trialAlreadyStarted: boolean;
  canStartTrial: boolean;
  trialExpiresAt: string | null;
  subscriptionExpiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
};

export async function getHostMobileOrganizations(): Promise<HostMobileOrganization[]> {
  const user = await createClient();
  const { data: claimsResult } = await user.auth.getClaims();
  const profileId = claimsResult?.claims?.sub;
  if (!profileId) redirect("/host/sign-in?next=%2Fhost%2Fmobile");

  // Authorization comes from the real membership table, never from Stripe
  // metadata, a user-editable profile field or a supplied organization ID.
  const { data: members, error: memberError } = await user
    .from("organization_members")
    .select("organization_id,role")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"]);
  if (memberError) throw new Error("Unable to verify your host organizations.");
  const memberships = (members ?? []) as Member[];
  if (!memberships.length) return [];

  const ids = memberships.map((membership) => membership.organization_id);
  const admin = createAdminClient();
  const [orgResult, accessResult] = await Promise.all([
    admin.from("organizations")
      .select("id,name,status,partner_status")
      .in("id", ids).neq("status", "ARCHIVED"),
    admin.from("host_mobile_access")
      .select("organization_id,trial_started_at,trial_expires_at,subscription_expires_at,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_cancel_at_period_end")
      .in("organization_id", ids),
  ]);
  if (orgResult.error || accessResult.error) {
    throw new Error("Unable to verify host mobile access.");
  }
  const accessByOrg = new Map(
    ((accessResult.data ?? []) as AccessRow[]).map((row) => [row.organization_id, row]),
  );
  const memberByOrg = new Map(memberships.map((member) => [member.organization_id, member]));
  for(const org of (orgResult.data??[]) as Org[]){const row=accessByOrg.get(org.id);if(org.partner_status==="VERIFIED"&&row?.stripe_customer_id){try{await stopPartnerMobileRenewal(org.id,row.stripe_customer_id,row.stripe_subscription_id)}catch{console.error("[host mobile] partner renewal reconciliation failed",org.id)}}}
  return ((orgResult.data ?? []) as Org[]).map((org) => {
    const access = accessByOrg.get(org.id);
    const mode = hostMobileAccessMode({
      partnerStatus: org.partner_status,
      trialExpiresAt: access?.trial_expires_at ?? null,
      subscriptionExpiresAt: access?.subscription_expires_at ?? null,
      stripeSubscriptionStatus: access?.stripe_subscription_status ?? null,
    });
    return {
      id: org.id,
      name: org.name,
      role: memberByOrg.get(org.id)?.role === "OWNER" ? "OWNER" as const : "MANAGER" as const,
      partnerStatus: org.partner_status,
      mode,
      entitled: mode !== "LOCKED",
      trialAlreadyStarted: Boolean(access?.trial_started_at),
      canStartTrial: memberByOrg.get(org.id)?.role === "OWNER" && mode === "LOCKED" && !access?.trial_started_at && !access?.stripe_subscription_id,
      trialExpiresAt: access?.trial_expires_at ?? null,
      subscriptionExpiresAt: access?.subscription_expires_at ?? null,
      cancelAtPeriodEnd: Boolean(access?.stripe_cancel_at_period_end),
      hasStripeCustomer: Boolean(access?.stripe_customer_id),
      hasStripeSubscription: Boolean(access?.stripe_subscription_id),
    };
  });
}

export async function requireMobileOrgOwner(organizationId: string) {
  const organizations = await getHostMobileOrganizations();
  const org = organizations.find((row) => row.id === organizationId);
  if (!org || org.role !== "OWNER") throw new Error("Active organization owner required.");
  const user = await createClient();
  const { data: claims } = await user.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (!profileId) throw new Error("Host sign in required.");
  return { organization: org, profileId };
}
