import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

type PublicListingIndexRow = {
  slug?: string | null;
};

export async function getPublishedSitemapSlugs() {
  try {
    const { url, key } = getSupabasePublicConfig();
    const supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.rpc("public_listing_index");

    if (error) {
      console.error("[sitemap] public listing index unavailable", {
        code: error.code,
        message: error.message,
      });
      return [];
    }

    return ((data ?? []) as PublicListingIndexRow[])
      .map((row) => row.slug?.trim() || "")
      .filter(Boolean);
  } catch (error) {
    console.error("[sitemap] unable to load published listings", error);
    return [];
  }
}
