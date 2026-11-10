import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) {
  return mobileOptions(request);
}
export async function GET(request: NextRequest) {
  const result = await authenticateMobileHost(request, {
    forceRefresh: request.nextUrl.searchParams.get("refresh") === "1",
  });
  if (!result.ok)
    return mobileJson(request, { error: result.message }, result.status);
  return mobileJson(request, { access: result.access });
}
