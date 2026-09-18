"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 5000) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
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

export async function reviewPropertyListing(formData: FormData) {
  const context = await getAdminContext();
  const propertyId = field(formData, "property_id");
  const decision = field(formData, "decision");
  const note = field(formData, "review_note");

  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect(`/admin/properties/${propertyId}?error=${encodeURIComponent("Your admin role cannot review listings.")}`);
  }
  if (!propertyId || !["request_changes", "approve", "reject"].includes(decision)) {
    redirect("/admin/properties?error=Invalid%20property%20review%20request.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_property", {
    target_property_id: propertyId,
    decision,
    review_note: note || null,
  });
  if (error) {
    console.error("[reviewPropertyListing] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    redirect(`/admin/properties/${propertyId}?error=${encodeURIComponent(error.message || "The review decision could not be saved.")}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/host/properties");
  redirect(`/admin/properties/${propertyId}?saved=${encodeURIComponent(decision === "approve" ? "Listing approved." : decision === "request_changes" ? "Changes requested from host." : "Listing rejected.")}`);
}

export async function setPropertyPublication(formData: FormData) {
  const context = await getAdminContext();
  const propertyId = field(formData, "property_id");
  const action = field(formData, "publication_action");
  const note = field(formData, "publication_note");

  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect(`/admin/properties/${propertyId}?error=${encodeURIComponent("Your admin role cannot publish listings.")}`);
  }
  if (!propertyId || !["publish", "pause"].includes(action)) {
    redirect("/admin/properties?error=Invalid%20publication%20request.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_property_publication", {
    target_property_id: propertyId,
    publish: action === "publish",
    publication_note: note || null,
  });
  if (error) {
    console.error("[setPropertyPublication] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    redirect(`/admin/properties/${propertyId}?error=${encodeURIComponent(error.message || "The publication change could not be saved.")}`);
  }

  revalidatePath("/");
  revalidatePath("/stays");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/host/properties");
  redirect(`/admin/properties/${propertyId}?saved=${encodeURIComponent(action === "publish" ? "Listing published to the marketplace." : "Listing paused and removed from the public marketplace.")}`);
}

export async function setPropertyLiveCheckout(formData: FormData) {
  const context = await getAdminContext();
  const propertyId = field(formData, "property_id", 100);
  const enabled = field(formData, "live_checkout_enabled", 10) === "true";
  const reason = field(formData, "live_checkout_reason", 500);

  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect(`/admin/properties/${encodeURIComponent(propertyId)}?error=${encodeURIComponent("Your admin role cannot change the live checkout gate.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_property_live_checkout", {
    target_property_id: propertyId,
    enabled,
    change_reason: reason || null,
  });

  if (error) {
    redirect(`/admin/properties/${encodeURIComponent(propertyId)}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  redirect(`/admin/properties/${encodeURIComponent(propertyId)}?saved=${encodeURIComponent(enabled ? "Live checkout enabled for this pilot property." : "Live checkout disabled.")}`);
}
