"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getAdminContext,
  hasAnyAdminRole,
} from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 1000) {
  const raw = formData.get(key);
  return typeof raw === "string"
    ? raw.trim().slice(0, max)
    : "";
}

export async function setPartnerCommission(formData: FormData) {
  const context = await getAdminContext();

  if (
    !hasAnyAdminRole(context, [
      "SUPER_ADMIN",
      "PARTNER_ADMIN",
    ])
  ) {
    redirect(
      "/admin/partners?error=Your%20admin%20role%20cannot%20change%20commission%20rates.",
    );
  }

  const organizationId = field(
    formData,
    "organization_id",
    100,
  );
  const rate = field(formData, "rate", 20);
  const note = field(formData, "note", 1000);

  if (!organizationId || !["standard", "partner"].includes(rate)) {
    redirect(
      "/admin/partners?error=Invalid%20commission%20change.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "admin_set_partner_commission",
    {
      target_organization_id: organizationId,
      make_partner: rate === "partner",
      change_note: note || null,
    },
  );

  if (error) {
    console.error("[setPartnerCommission]", error);
    redirect(
      `/admin/partners?error=${encodeURIComponent(
        error.message ||
          "The commission rate could not be updated.",
      )}`,
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/partners");
  revalidatePath("/admin/hosts");
  revalidatePath("/host");
  revalidatePath("/host/payments");

  redirect(
    `/admin/partners?saved=${encodeURIComponent(
      rate === "partner"
        ? "Partner rate applied."
        : "Standard 7% rate applied.",
    )}`,
  );
}
