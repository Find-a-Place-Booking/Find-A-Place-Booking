import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

const hostPublicPaths = new Set([
  "/host/sign-in",
  "/host/sign-up",
  "/host/sign-up/check-email",
]);

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  ["cache-control", "expires", "pragma"].forEach((header) => {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  });
  return target;
}

function loginRedirect(request: NextRequest, response: NextResponse, destination: string, next?: string, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  if (error) url.searchParams.set("error", error);
  return copyCookies(response, NextResponse.redirect(url));
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Public auth screens must never run the protected-route auth checks. This
  // also prevents an authenticated/authorization disagreement from bouncing
  // between /admin and /admin/sign-in.
  if (hostPublicPaths.has(pathname) || pathname === "/admin/sign-in") {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, key } = getSupabasePublicConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authError ? null : authData.user;

  const isHostRoute = pathname === "/host" || pathname.startsWith("/host/");
  if (isHostRoute && !user) {
    return loginRedirect(request, response, "/host/sign-in", `${pathname}${request.nextUrl.search}`);
  }

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdminRoute) {
    if (!user) {
      return loginRedirect(request, response, "/admin/sign-in");
    }

    // Use the single database authorization helper everywhere. This keeps the
    // proxy, sign-in action and sign-in page from making subtly different
    // decisions about the same administrator.
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_active_admin");

    if (adminError || isAdmin !== true) {
      // Clear the authenticated session before returning to the admin sign-in
      // page. Without this, a transient authorization mismatch can create a
      // /admin <-> /admin/sign-in redirect loop and eventually an HTTP 431.
      await supabase.auth.signOut();
      return loginRedirect(
        request,
        response,
        "/admin/sign-in",
        undefined,
        "This account does not have active Find A Place admin access.",
      );
    }
  }

  return response;
}
