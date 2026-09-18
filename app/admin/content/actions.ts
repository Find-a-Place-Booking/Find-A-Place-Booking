"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function saveSiteContentBlock(formData: FormData) {
  const context = await getAdminContext();

  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect("/admin/content?error=Your+admin+role+cannot+edit+public+site+content.");
  }

  const key = field(formData, "key", 120);
  const title = field(formData, "title", 500);

  if (!key || !title) {
    redirect("/admin/content?error=Content+key+and+title+are+required.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_site_content", {
    content_key: key,
    content_eyebrow: field(formData, "eyebrow", 200) || null,
    content_title: title,
    content_body: field(formData, "body", 12000) || null,
    content_cta_label: field(formData, "cta_label", 240) || null,
    content_cta_href: field(formData, "cta_href", 500) || null,
    content_image_url: field(formData, "image_url", 1200) || null,
  });

  if (error) {
    console.error("[saveSiteContentBlock]", error);
    redirect(`/admin/content?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/admin/content");

  redirect(`/admin/content?saved=${encodeURIComponent(`${key} saved.`)}#${encodeURIComponent(key)}`);
}
