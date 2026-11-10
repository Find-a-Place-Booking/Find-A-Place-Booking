import {authenticateHostIdentity} from "@/lib/mobile/identity";
import {stopPartnerMobileRenewal} from "@/lib/payments/host-mobile-billing";
import { hostMobileAccessMode } from "@/lib/host/mobile-access-policy";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type AccessRow = {
  organization_id: string;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  subscription_owner_profile_id: string | null;
  subscription_expires_at: string | null;
  subscription_checked_at: string | null;
};

export type MobileHostAccess = {
  allowed: boolean;
  reason: "PARTNER" | "ADMIN" | "TRIAL" | "SUBSCRIPTION" | "PAYWALL" | "BILLING_UNAVAILABLE";
  organizationId: string;
  organizationName: string;
  userId: string;
  isOwner: boolean;
  canStartTrial: boolean;
  trialExpiresAt: string | null;
  subscriptionExpiresAt: string | null;
};

export type HostAuthResult =
  | { ok: true; admin: Admin; access: MobileHostAccess }
  | { ok: false; status: number; message: string };

export async function authenticateMobileHost(request: NextRequest, _options: { forceRefresh?: boolean } = {}): Promise<HostAuthResult> {
  if(process.env.HOST_MOBILE_APP_ENABLED==="false")return {ok:false,status:503,message:"The host app has not launched yet."};
  const identity=await authenticateHostIdentity(request);
  if(!identity.ok)return identity;
  const {admin,userId}=identity;
  const { data: memberships, error: memberError } = await admin.from("organization_members")
    .select("organization_id,role").eq("profile_id",userId).eq("status","ACTIVE")
    .in("role",["OWNER","MANAGER"]).order("created_at",{ascending:true});
  if(memberError) return {ok:false,status:503,message:"Unable to verify host membership."};
  const requested = request.headers.get("x-fap-organization");
  const member = requested ? memberships?.find(m=>m.organization_id===requested) : memberships?.[0];
  if(!member) return {ok:false,status:403,message:"No active host organization found."};
  const [orgResult,accessResult,adminResult] = await Promise.all([
    admin.from("organizations").select("id,name,partner_status,status").eq("id",member.organization_id).neq("status","ARCHIVED").maybeSingle(),
    admin.from("host_mobile_access").select("trial_started_at,trial_expires_at,subscription_expires_at,stripe_subscription_status,stripe_customer_id,stripe_subscription_id").eq("organization_id",member.organization_id).maybeSingle(),
    admin.from("admin_users").select("profile_id").eq("profile_id",userId).eq("status","ACTIVE").maybeSingle(),
  ]);
  if(orgResult.error||!orgResult.data||accessResult.error||adminResult.error)
    return {ok:false,status:503,message:"Host app access could not be verified."};
  const org=orgResult.data, row=accessResult.data;
  const mode=hostMobileAccessMode({partnerStatus:org.partner_status,trialExpiresAt:row?.trial_expires_at,
    subscriptionExpiresAt:row?.subscription_expires_at,stripeSubscriptionStatus:row?.stripe_subscription_status});
  const isAdmin=Boolean(adminResult.data);
  if(mode==="PARTNER"&&row?.stripe_customer_id){
    try{await stopPartnerMobileRenewal(org.id,row.stripe_customer_id,row.stripe_subscription_id)}catch{console.error("[host mobile] partner renewal reconciliation failed",org.id)}
  }
  return {ok:true,admin,access:{allowed:isAdmin||mode!=="LOCKED",reason:isAdmin?"ADMIN":mode==="SUBSCRIBED"?"SUBSCRIPTION":mode==="LOCKED"?"PAYWALL":mode,
    organizationId:org.id,organizationName:org.name,userId,isOwner:member.role==="OWNER",
    canStartTrial:member.role==="OWNER"&&!row?.trial_started_at&&!row?.stripe_subscription_id&&mode==="LOCKED"&&!isAdmin,
    trialExpiresAt:row?.trial_expires_at||null,subscriptionExpiresAt:row?.subscription_expires_at||null}};
}
