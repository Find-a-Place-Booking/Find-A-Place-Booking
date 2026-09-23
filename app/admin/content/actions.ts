"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

const REVALIDATE_PATHS = [
  "/",
  "/about",
  "/hosts",
  "/help",
  "/contact",
  "/stays",
  "/property-policies",
  "/terms",
  "/host-agreement",
  "/cancellation-policy",
  "/privacy",
  "/host/onboarding",
  "/admin/content",
];

export async function saveSiteContentBlock(formData: FormData) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect("/admin/content?error=Your+admin+role+cannot+edit+public+site+content.");
  }

  const key = field(formData, "key", 120);
  if (!key) redirect("/admin/content?error=Content+key+is+required.");

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("site_content_blocks")
    .select("key,eyebrow,title,body,admin_editable,editable_fields,content_group,policy_key")
    .eq("key", key)
    .maybeSingle();

  if (currentError || !current || !current.admin_editable) {
    redirect(`/admin/content?error=${encodeURIComponent("That content block is not available for admin editing.")}`);
  }

  const editableFields = new Set(
    Array.isArray(current.editable_fields)
      ? current.editable_fields.map(String)
      : ["eyebrow", "title", "body"],
  );

  const nextEyebrow = editableFields.has("eyebrow")
    ? field(formData, "eyebrow", 200) || null
    : current.eyebrow;
  const nextTitle = editableFields.has("title")
    ? field(formData, "title", 500)
    : current.title;
  const nextBody = editableFields.has("body")
    ? field(formData, "body", 20000) || null
    : current.body;

  if (!nextTitle) {
    redirect(`/admin/content?error=${encodeURIComponent("A heading is required for this content block.")}#${encodeURIComponent(key)}`);
  }

  const { error } = await supabase.rpc("admin_update_managed_copy", {
    content_key: key,
    content_eyebrow: nextEyebrow,
    content_title: nextTitle,
    content_body: nextBody,
  });

  if (error) {
    console.error("[saveSiteContentBlock]", error);
    redirect(`/admin/content?error=${encodeURIComponent(error.message)}#${encodeURIComponent(key)}`);
  }

  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  const policyNote = current.policy_key ? " Policy version advanced automatically." : "";
  redirect(`/admin/content?saved=${encodeURIComponent(`${current.content_group || "Content"} copy saved.${policyNote}`)}#${encodeURIComponent(key)}`);
}
