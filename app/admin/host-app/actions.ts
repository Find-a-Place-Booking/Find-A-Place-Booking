"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stopPartnerMobileRenewal } from "@/lib/payments/host-mobile-billing";
export async function setHostAppPartner(form: FormData) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "PARTNER_ADMIN"]))
    redirect("/admin/host-app?error=permission");
  const org = String(form.get("organizationId") || ""),
    decision = String(form.get("decision") || "");
  if (!/^[0-9a-f-]{36}$/i.test(org) || !["verify", "remove"].includes(decision))
    redirect("/admin/host-app?error=invalid");
  const user = await createClient();
  const saved = await user.rpc("admin_set_host_webapp_partner", {
    target_organization_id: org,
    verified: decision === "verify",
    verification_note: String(form.get("note") || "").slice(0, 1000),
  });
  if (saved.error) redirect("/admin/host-app?error=save");
  let renewalError = false;
  if (decision === "verify") {
    const admin = createAdminClient();
    const row = await admin
      .from("host_mobile_access")
      .select("stripe_customer_id,stripe_subscription_id")
      .eq("organization_id", org)
      .maybeSingle();
    if (row.error) renewalError = true;
    else if (row.data?.stripe_customer_id) {
      try {
        await stopPartnerMobileRenewal(
          org,
          row.data.stripe_customer_id,
          row.data.stripe_subscription_id,
        );
      } catch {
        renewalError = true;
      }
    }
  }
  revalidatePath("/admin/host-app");
  revalidatePath("/host/mobile");
  revalidatePath("/host/mobile/workspace");
  redirect(
    `/admin/host-app?saved=${decision}${renewalError ? "&warning=renewal" : ""}`,
  );
}
