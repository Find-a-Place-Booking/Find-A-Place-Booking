import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only run Supabase session/authorization work on routes that actually need
  // authentication. Public marketplace pages should never wait on an auth
  // network call just to render.
  matcher: ["/host/:path*", "/admin/:path*"],
};
