import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * User-scoped server Supabase client for Server Components, Server Actions and
 * Route Handlers. Auth refresh/proxy behavior is intentionally deferred to the
 * dedicated authentication milestone.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabasePublicConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies. The auth milestone
          // will add the request proxy that owns session refresh writes.
        }
      },
    },
  });
}
