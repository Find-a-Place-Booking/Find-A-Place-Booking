import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) {
  return mobileOptions(request);
}
export async function POST(request: NextRequest) {
  const result = await authenticateMobileHost(request);
  if (!result.ok)
    return mobileJson(request, { error: result.message }, result.status);
  const access = result.access;
  if (!access.isOwner)
    return mobileJson(
      request,
      { error: "Only the organization owner can start the trial." },
      403,
    );
  if (!access.canStartTrial)
    return mobileJson(
      request,
      { error: "This organization has already used its mobile trial." },
      409,
    );
  const { data, error } = await result.admin.rpc("start_host_mobile_trial", {
    target_organization_id: access.organizationId,
    target_profile_id: access.userId,
  });
  if (error || !data)
    return mobileJson(
      request,
      { error: "Unable to start the trial. Please retry." },
      409,
    );
  return mobileJson(request, { ok: true, trialExpiresAt: data });
}
