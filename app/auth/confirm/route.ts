import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeInternalPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

function authRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"), "/host/onboarding");
  const redirectTo = request.nextUrl.clone();
  const nextUrl = new URL(next, request.nextUrl.origin);

  redirectTo.pathname = nextUrl.pathname;
  redirectTo.search = nextUrl.search;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) return authRedirect(redirectTo);
  }

  redirectTo.pathname = nextUrl.searchParams.get("portal") === "admin"
    ? "/admin/sign-in"
    : "/host/sign-in";
  redirectTo.search = "";
  redirectTo.searchParams.set("error", "That confirmation link is invalid or has expired. Try signing in or create the account again.");
  return authRedirect(redirectTo);
}
