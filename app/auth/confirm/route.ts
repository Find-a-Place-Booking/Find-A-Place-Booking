import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeInternalPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

function authRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const next = safeInternalPath(
    searchParams.get("next"),
    "/host/onboarding",
  );

  const redirectTo = request.nextUrl.clone();
  const nextUrl = new URL(next, request.nextUrl.origin);
  const portal =
    nextUrl.searchParams.get("portal") === "admin"
      ? "admin"
      : "host";

  redirectTo.pathname = nextUrl.pathname;
  redirectTo.search = nextUrl.search;
  redirectTo.hash = "";

  const supabase = await createClient();

  // resetPasswordForEmail uses the PKCE flow in SSR. Supabase first verifies
  // the one-time recovery token on its /verify endpoint, then redirects back
  // to this route with an authorization code. Exchange that code for the
  // recovery session cookie before opening the update-password page.
  if (code) {
    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return authRedirect(redirectTo);
    }

    console.error(
      "[auth confirm] unable to exchange PKCE auth code",
      error,
    );
  }

  // Keep supporting direct token-hash confirmation links used by custom
  // Supabase email templates and signup confirmation flows.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      return authRedirect(redirectTo);
    }

    console.error(
      "[auth confirm] unable to verify token hash",
      error,
    );
  }

  const isRecovery =
    nextUrl.pathname === "/auth/update-password";

  if (isRecovery) {
    redirectTo.pathname = "/auth/password-reset";
    redirectTo.search = "";
    redirectTo.searchParams.set("portal", portal);
    redirectTo.searchParams.set(
      "error",
      "That recovery link is invalid, expired, or has already been used. Request a new password reset link.",
    );
    return authRedirect(redirectTo);
  }

  redirectTo.pathname =
    portal === "admin"
      ? "/admin/sign-in"
      : "/host/sign-in";
  redirectTo.search = "";
  redirectTo.searchParams.set(
    "error",
    "That confirmation link is invalid or has expired. Try signing in or request a new link.",
  );

  return authRedirect(redirectTo);
}
