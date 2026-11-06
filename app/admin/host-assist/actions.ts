"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedFields = [
  "hostName", "contactName", "phone", "email", "businessLocation",
  "propertyName", "propertyType", "description", "street", "city",
  "state", "postal", "publicArea", "maxGuests", "weeknight", "weekend",
  "cancellation",
] as const;

function field(data: FormData, key: string, max = 5000) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function back(orgId: string, key: "saved" | "error", message: string) {
  return `/admin/host-assist/${encodeURIComponent(orgId)}?${key}=${encodeURIComponent(message.slice(0, 300))}`;
}
async function authorized() {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect("/admin");
  }
}

export async function saveHostDraftAssistance(data: FormData) {
  await authorized();
  const orgId = field(data, "organization_id", 90);
  if (!uuidPattern.test(orgId)) redirect("/admin/publishing?error=Invalid%20organization");
  const reason = field(data, "reason", 500);
  if (reason.length < 8) redirect(back(orgId, "error", "Enter a brief note explaining the assistance."));
  const patch: Record<string, string> = {};
  for (const name of allowedFields) {
    const value = field(data, name, name === "description" || name === "cancellation" ? 5000 : 250);
    // Empty fields are not submitted: this cannot accidentally erase a host's
    // previously saved data. Intentional blanking is left to host support.
    const previouslyShown = data.get(`original_${name}`);
    if (value && (typeof previouslyShown !== "string" || previouslyShown.trim() !== value)) patch[name] = value;
  }
  if (!Object.keys(patch).length) redirect(back(orgId, "error", "Nothing changed. Edit a value before saving."));
  const db = await createClient();
  const { error } = await db.rpc("admin_patch_host_onboarding_draft", {
    target_organization_id: orgId, patch, reason,
  });
  if (error) redirect(back(orgId, "error", error.message || "Unable to save assistance."));
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/host-assist/${orgId}`);
  redirect(back(orgId, "saved", "Draft facts saved. Host consent and legal acceptance are unchanged."));
}

export async function createAdminAssistedPropertyDraft(data: FormData) {
  await authorized();
  const orgId = field(data, "organization_id", 90);
  if (!uuidPattern.test(orgId)) redirect("/admin/publishing?error=Invalid%20organization");
  const reason = field(data, "reason", 500);
  if (reason.length < 8) redirect(back(orgId, "error", "Enter a reason for creating the draft."));
  const db = await createClient();
  const { data: result, error } = await db.rpc("admin_prepare_host_property_draft", {
    target_organization_id: orgId, reason,
  });
  if (error) redirect(back(orgId, "error", error.message || "Unable to create property draft."));
  const created = result as { property_id?: string } | null;
  if (!created?.property_id || !uuidPattern.test(created.property_id)) {
    redirect(back(orgId, "error", "Property draft was not returned. Recheck the host record."));
  }
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/host-assist/${orgId}`);
  revalidatePath("/admin/properties");
  redirect(`/admin/publishing/${encodeURIComponent(created.property_id)}?saved=${encodeURIComponent("Property draft prepared. Complete the remaining requirements before publishing.")}`);
}
