"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function safeText(form: FormData, name: string, limit: number) {
  return String(form.get(name) || "").trim().slice(0, limit);
}
async function requireEditor() {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) redirect("/admin/content?error=Not+authorized");
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/admin/sign-in");
  return { client, userId: auth.user.id };
}

export async function saveContentDraft(form: FormData) {
  const { client, userId } = await requireEditor();
  const key = safeText(form, "key", 120);
  const title = safeText(form, "title", 500);
  const eyebrow = safeText(form, "eyebrow", 200);
  const body = safeText(form, "body", 20000);
  if (!key || !title) redirect("/admin/content/drafts?error=invalid");
  const { data: block } = await client.from("site_content_blocks")
    .select("key,admin_editable").eq("key", key).maybeSingle();
  if (!block?.admin_editable) redirect("/admin/content/drafts?error=not-editable");
  const { error } = await client.from("site_copy_drafts").upsert({
    key, title, eyebrow: eyebrow || null, body: body || null,
    updated_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) redirect("/admin/content/drafts?error=save");
  revalidatePath("/admin/content/drafts");
  redirect(`/admin/content/drafts?saved=1#${encodeURIComponent(key)}`);
}

export async function publishContentDraft(form: FormData) {
  const { client } = await requireEditor();
  const key = safeText(form, "key", 120);
  if (!key || form.get("publishConfirmed") !== "on") redirect("/admin/content/drafts?error=review-first");
  const { data: draft, error: loadError } = await client.from("site_copy_drafts")
    .select("key,title,body,eyebrow").eq("key", key).maybeSingle();
  if (loadError || !draft) redirect("/admin/content/drafts?error=draft-missing");
  // Existing audited RPC checks the admin role, publishes and advances policy versions.
  const { error } = await client.rpc("admin_update_managed_copy", {
    content_key: draft.key, content_eyebrow: draft.eyebrow,
    content_title: draft.title, content_body: draft.body,
  });
  if (error) redirect("/admin/content/drafts?error=publish");
  await client.from("site_copy_drafts").delete().eq("key", key);
  for (const path of ["/", "/hosts", "/terms", "/host-agreement", "/cancellation-policy", "/privacy", "/admin/content", "/admin/content/drafts"]) revalidatePath(path);
  redirect("/admin/content/drafts?published=1");
}
