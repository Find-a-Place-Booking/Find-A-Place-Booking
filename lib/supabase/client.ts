"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Browser Supabase client.
 *
 * Do not create this client at module import time. Keeping creation lazy means
 * the existing production shell can still build before local Supabase variables
 * are configured, and only code that actually uses Supabase requires them.
 */
export function createClient() {
  const { url, key } = getSupabasePublicConfig();
  return createBrowserClient(url, key);
}
