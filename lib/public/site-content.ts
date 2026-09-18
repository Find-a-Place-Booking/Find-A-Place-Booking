import { createClient } from "@/lib/supabase/server";

export type SiteContentBlock = {
  key: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  image_url: string | null;
};

export async function getSiteContentBlocks(keys: string[]) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("site_content_blocks")
    .select("key,eyebrow,title,body,cta_label,cta_href,image_url")
    .in("key", keys)
    .eq("is_public", true);

  if (error) {
    console.error("[site content]", error);
    return new Map<string, SiteContentBlock>();
  }

  return new Map(
    ((data ?? []) as SiteContentBlock[]).map((block) => [block.key, block]),
  );
}
