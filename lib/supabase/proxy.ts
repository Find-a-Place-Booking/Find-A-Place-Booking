import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

const hostPublicPaths = new Set([
  "/host/sign-in",
  "/host/sign-up",
  "/host/sign-up/check-email",
]);

function isSupabaseAuthCookie(name: string) {
  return (
    name.startsWith("sb-") &&
    (name.includes("-auth-token") ||
      name.includes("-code-verifier"))
  );
}

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthCookie(cookie.name)) continue;

    request.cookies.delete(cookie.name);
    response.cookies.set(cookie.name, "", {
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return response;
}

function copyResponseCookies(
  source: NextResponse,
  target: NextResponse,
) {
  source.cookies
    .getAll()
    .forEach((cookie) => target.cookies.set(cookie));

  return target;
}

function loginRedirect(
  request: NextRequest,
  response: NextResponse,
  destination: string,
  next?: string,
  error?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";

  if (next) url.searchParams.set("next", next);
  if (error) url.searchParams.set("error", error);

  return copyResponseCookies(
    response,
    NextResponse.redirect(url),
  );
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isPublicAuthRoute =
    hostPublicPaths.has(pathname) ||
    pathname === "/admin/sign-in";

  /*
   * Public sign-in/sign-up routes must be passive.
   *
   * Do NOT call Supabase auth here and, critically, do NOT clear cookies here.
   * Next.js may prefetch these links in the background. Mutating cookies in a
   * prefetched auth response can destroy a perfectly valid host/admin session.
   *
   * Stale-cookie cleanup is handled by the explicit sign-in action and by
   * protected-route auth failure below.
   */
  if (isPublicAuthRoute) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, key } = getSupabasePublicConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(
          ({ name, value, options }) => {
            response.cookies.set(name, value, options);
          },
        );
      },
    },
  });

  let user = null;

  try {
    const {
      data,
      error,
    } = await supabase.auth.getUser();

    if (error) {
      response = clearSupabaseAuthCookies(
        request,
        response,
      );
    } else {
      user = data.user;
    }
  } catch {
    response = clearSupabaseAuthCookies(
      request,
      response,
    );
    user = null;
  }

  const isHostRoute =
    pathname === "/host" ||
    pathname.startsWith("/host/");

  if (isHostRoute && !user) {
    return loginRedirect(
      request,
      response,
      "/host/sign-in",
      `${pathname}${request.nextUrl.search}`,
      "Your session expired. Sign in again.",
    );
  }

  const isAdminRoute =
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (isAdminRoute) {
    if (!user) {
      return loginRedirect(
        request,
        response,
        "/admin/sign-in",
        undefined,
        "Your session expired. Sign in again.",
      );
    }

    const {
      data: isAdmin,
      error: adminError,
    } = await supabase.rpc("is_active_admin");

    if (adminError || isAdmin !== true) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Local cookie cleanup below is the authoritative fallback.
      }

      response = clearSupabaseAuthCookies(
        request,
        response,
      );

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
