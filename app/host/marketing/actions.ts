"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function saveHostMarketingPreferences(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/host/sign-in?next=/host/marketing");

  const organizationId = String(formData.get("organization_id") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    redirect("/host/marketing?error=Invalid%20host%20account");
  }

  const { error } = await supabase.rpc("set_host_marketing_preferences", {
    target_organization_id: organizationId,
    offer_three_discounted_stays: formData.get("three_stays") === "on",
    request_social_advertising: formData.get("extra_social") === "on",
    details: String(formData.get("notes") || "").trim().slice(0, 1000),
  });
  if (error) {
    redirect(`/host/marketing?error=${encodeURIComponent(error.message.slice(0, 200))}`);
  }
  revalidatePath("/host/marketing");
  revalidatePath("/admin/publishing");
  redirect("/host/marketing?saved=1");
}
