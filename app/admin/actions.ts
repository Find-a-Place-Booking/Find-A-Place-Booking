"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

export async function reviewPartnerVerification(formData: FormData) {
  const context = await getAdminContext();
  const organizationId = field(formData, "organization_id");
  const decision = field(formData, "decision");
  const note = field(formData, "verification_note");

  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "PARTNER_ADMIN"])) {
    redirect("/admin/partners?error=Your%20admin%20role%20cannot%20change%20partner%20commission%20tiers.");
  }

  if (!organizationId || (decision !== "approve" && decision !== "standard")) {
    redirect("/admin/partners?error=Invalid%20partner%20verification%20request.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_partner_verification", {
    target_organization_id: organizationId,
    approve: decision === "approve",
    verification_note: note || null,
  });

  if (error) {
    const params = new URLSearchParams({ error: "The partner verification could not be saved. Refresh and try again." });
    redirect(`/admin/partners?${params.toString()}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/hosts");

  const params = new URLSearchParams({
    saved: decision === "approve" ? "Partner approved at 5%." : "Organization kept at the standard 7% rate.",
  });
  redirect(`/admin/partners?${params.toString()}`);
}
