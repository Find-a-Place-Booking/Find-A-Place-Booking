/**
 * Public Supabase configuration used by browser and user-scoped server clients.
 *
 * Supabase now prefers publishable keys for new projects. The legacy anon-key
 * variable remains as a temporary fallback so the project can use either key
 * format without changing application code.
 */
export type SupabasePublicConfig = {
  url: string;
  key: string;
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  return { url, key };
}

export function isSupabaseConfigured() {
  return Boolean(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
        clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
  );
}
