"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";

export async function moderatePublicHostReview(formData: FormData) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect("/admin/host-reviews?error=unauthorized");
  }
  const reviewId = String(formData.get("reviewId") || "");
  const decision = String(formData.get("decision") || "");
  if (!/^[a-f0-9-]{36}$/i.test(reviewId) || !["PUBLISHED", "REJECTED"].includes(decision)) {
    redirect("/admin/host-reviews?error=invalid");
  }
  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin.from("public_host_reviews")
    .select("id,organization_id,status").eq("id",reviewId).maybeSingle();
  if (readError || !existing || existing.status !== "PENDING") {
    redirect("/admin/host-reviews?error=not-pending");
  }
  const { data, error } = await admin.from("public_host_reviews")
    .update({ status: decision, reviewed_by: context.profileId, reviewed_at: new Date().toISOString() })
    .eq("id", reviewId).eq("status", "PENDING")
    .select("id").maybeSingle();
  if (error || !data) {
    redirect("/admin/host-reviews?error=save-failed");
  }
  const { data: org } = await admin.from("organizations")
    .select("public_host_slug").eq("id", existing.organization_id).maybeSingle();
  if (org?.public_host_slug) revalidatePath(`/hosts/${org.public_host_slug}`);
  revalidatePath("/admin/host-reviews");
  redirect("/admin/host-reviews?saved=1");
}
