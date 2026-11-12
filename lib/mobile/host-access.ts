import { authenticateHostIdentity } from "@/lib/mobile/identity";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type MobileHostAccess = {
  allowed: boolean;
  reason: "FREE" | "PARTNER" | "ADMIN" | "TRIAL" | "SUBSCRIPTION" | "PAYWALL" | "BILLING_UNAVAILABLE";
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

/**
 * All host organization owners/managers receive free app access.
 * Authorization still comes from a verified Supabase session and active
 * organization membership — never a client-supplied organization ID alone.
 */
export async function authenticateMobileHost(
  request: NextRequest,
  _options: { forceRefresh?: boolean } = {},
): Promise<HostAuthResult> {
  if (process.env.HOST_MOBILE_APP_ENABLED === "false") {
    return { ok: false, status: 503, message: "The host app is temporarily unavailable." };
  }

  const identity = await authenticateHostIdentity(request);
  if (!identity.ok) return identity;
  const { admin, userId } = identity;
  const { data: memberships, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id,role")
    .eq("profile_id", userId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"])
    .order("created_at", { ascending: true });

  if (membershipError) {
    return { ok: false, status: 503, message: "Unable to verify host membership." };
  }

  const requestedId = request.headers.get("x-fap-organization");
  const member = requestedId
    ? memberships?.find((row) => row.organization_id === requestedId)
    : memberships?.[0];
  if (!member) {
    return { ok: false, status: 403, message: "No active host organization found." };
  }

  const { data: org, error: organizationError } = await admin
    .from("organizations")
    .select("id,name,partner_status,status")
    .eq("id", member.organization_id)
    .neq("status", "ARCHIVED")
    .maybeSingle();
  if (organizationError || !org) {
    return { ok: false, status: 503, message: "Host organization could not be verified." };
  }

  return {
    ok: true,
    admin,
    access: {
      allowed: true,
      reason: org.partner_status === "VERIFIED" ? "PARTNER" : "FREE",
      organizationId: org.id,
      organizationName: org.name,
      userId,
      isOwner: member.role === "OWNER",
      canStartTrial: false,
      trialExpiresAt: null,
      subscriptionExpiresAt: null,
    },
  };
}
