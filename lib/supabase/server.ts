import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Safely retries ONLY read-only requests sent by the user-scoped Supabase
 * server client. A transient edge timeout previously returned HTTP 555 on
 * otherwise healthy SELECTs and caused a host reservation page to crash.
 *
 * Mutating methods (POST/PATCH/PUT/DELETE) are never retried here, including
 * booking, payment, calendar and RPC actions. No operation is replayed more
 * than once. No secrets, URLs, or guest details are written to the logs.
 */
const TRANSIENT_READ_HTTP_STATUSES = new Set([
  408, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 555,
]);

async function resilientReadFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const isReadOnly = method === "GET" || method === "HEAD";

  if (!isReadOnly) {
    return fetch(input, init);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(input, init);
      if (
        attempt === 0 &&
        TRANSIENT_READ_HTTP_STATUSES.has(response.status) &&
        !init?.signal?.aborted
      ) {
        console.warn("[supabase-read] Transient upstream response; retrying read once", {
          method,
          status: response.status,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt !== 0 || init?.signal?.aborted) throw error;
      console.warn("[supabase-read] Network error; retrying read once", {
        method,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
  }

  // The loop always returns or throws by the second attempt.
  throw new Error("Supabase read unavailable after retry.");
}

/**
 * User-scoped server Supabase client for Server Components, Server Actions and
 * Route Handlers. Auth refresh/proxy behavior is intentionally deferred to the
 * dedicated authentication milestone.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabasePublicConfig();

  return createServerClient(url, key, {
    global: { fetch: resilientReadFetch },
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
