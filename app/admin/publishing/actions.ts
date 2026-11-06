"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStripePaymentAccount } from "@/lib/payments/sync-stripe-account";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";

function value(formData: FormData, name: string, max = 5000) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry.trim().slice(0, max) : "";
}

function checkedAdminRole(roles: string[]) {
  return roles.includes("SUPER_ADMIN") || roles.includes("OPERATIONS_ADMIN");
}

function returnPath(propertyId: string, key: "saved" | "error", message: string) {
  return `/admin/publishing/${encodeURIComponent(propertyId)}?${key}=${encodeURIComponent(message.slice(0, 400))}`;
}

async function authorize() {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) {
    redirect("/admin?error=Operations%20admin%20access%20required");
  }
  return context;
}

function fieldWasUnchanged(data: FormData, key: string, current: string) {
  const original = data.get(`original_${key}`);
  return typeof original === "string" && original.trim() === current;
}

function priceInCents(raw: string): number | null {
  if (!raw) return null;
  if (!/^(?:\d{1,6})(?:\.\d{1,2})?$/.test(raw)) return null;
  const dollars = Number(raw);
  const cents = Math.round(dollars * 100);
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= 10_000_000 ? cents : null;
}

export async function saveAdminListingSetup(formData: FormData) {
  await authorize();
  const propertyId = value(formData, "property_id", 90);
  if (!propertyId) redirect("/admin/publishing?error=Missing%20property");

  const fields = ["name", "description", "property_type", "public_area",
    "street_address", "city", "region_code", "postal_code",
    "calendar_preference", "cancellation_policy"] as const;
  const details: Record<string, string | number> = {};
  for (const field of fields) {
    // A blank text box preserves the original value; explicit changes are audited.
    const text = value(formData, field, field === "description" ? 10000 : 5000);
    if (text && !fieldWasUnchanged(formData, field, text)) details[field] = text;
  }

  const maxGuests = value(formData, "max_guests", 5);
  if (maxGuests && !fieldWasUnchanged(formData, "max_guests", maxGuests)) {
    const n = Number(maxGuests);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      redirect(returnPath(propertyId, "error", "Maximum guests must be between 1 and 100."));
    }
    details.max_guests = n;
  }

  for (const field of ["weeknight_price", "weekend_price"] as const) {
    const raw = value(formData, field, 15);
    if (!raw || fieldWasUnchanged(formData, field, raw)) continue;
    const cents = priceInCents(raw);
    if (cents == null) {
      redirect(returnPath(propertyId, "error", "Nightly rates must be positive dollar amounts with no more than two decimals."));
    }
    details[field === "weeknight_price" ? "weeknight_cents" : "weekend_cents"] = cents;
  }

  if (!Object.keys(details).length) {
    redirect(returnPath(propertyId, "error", "No changes were made. Edit a value, then save."));
  }
  const reason = value(formData, "reason", 500);
  if (reason.length < 8) {
    redirect(returnPath(propertyId, "error", "Explain what you changed and why (at least eight characters)."));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_listing_prep", {
    target_property_id: propertyId, details, reason,
  });
  if (error) {
    redirect(returnPath(propertyId, "error", error.message || "Unable to save changes."));
  }
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${propertyId}`);
  revalidatePath(`/admin/properties/${propertyId}`);
  redirect(returnPath(propertyId, "saved", "Listing details saved and audited. Check remaining publication requirements."));
}

export async function toggleAdminListingCheckout(formData: FormData) {
  await authorize();
  const propertyId = value(formData, "property_id", 90);
  const enabled = value(formData, "enabled", 10) === "true";
  const reason = value(formData, "reason", 500);
  if (!propertyId) redirect("/admin/publishing?error=Missing%20property");
  if (!reason) redirect(returnPath(propertyId, "error", "Enter a reason for changing live checkout access."));

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_property_live_checkout", {
    target_property_id: propertyId, enabled, change_reason: reason,
  });
  if (error) redirect(returnPath(propertyId, "error", error.message || "Unable to update checkout status."));
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${propertyId}`);
  revalidatePath(`/admin/properties/${propertyId}`);
  redirect(returnPath(propertyId, "saved", enabled ? "Live checkout enabled for this listing." : "Live checkout disabled for this listing."));
}

export async function finishAndPublishAdminListing(formData: FormData) {
  await authorize();
  const propertyId = value(formData, "property_id", 90);
  const reason = value(formData, "reason", 500);
  if (!propertyId) redirect("/admin/publishing?error=Missing%20property");
  if (!reason) redirect(returnPath(propertyId, "error", "Add a brief internal review reason before publishing."));
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_finish_and_publish_listing", {
    target_property_id: propertyId,
    completion_note: reason,
  });
  if (error) redirect(returnPath(propertyId, "error", error.message || "Listing could not be published."));
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${propertyId}`);
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/stays");
  redirect(returnPath(propertyId, "saved", "Listing approved and published. No checkout or calendar safeguards were bypassed."));
}


/**
 * Re-read live Stripe Connect V2 merchant capability status using the SAME
 * sync helper already used by the host's Stripe setup. This never creates a
 * Stripe account, rewrites payouts, or marks an account ready by hand.
 * Limited to Operations/Super Admin and the LIVE/TEST environment in use.
 */
export async function refreshAdminListingStripe(formData: FormData) {
  await authorize();
  const propertyId = value(formData, "property_id", 90);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId)) {
    redirect("/admin/publishing?error=Invalid%20property");
  }

  const admin = createAdminClient();
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("organization_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError || !property) {
    redirect(returnPath(propertyId, "error", "Property not found."));
  }

  const environment = stripeEnvironment();
  const { data: account, error: accountError } = await admin
    .from("payment_accounts")
    .select("id,provider_account_id,status")
    .eq("organization_id", property.organization_id)
    .eq("provider", "STRIPE")
    .eq("environment", environment)
    .eq("is_default", true)
    .neq("status", "DISABLED")
    .limit(1)
    .maybeSingle();
  if (accountError || !account?.provider_account_id) {
    redirect(returnPath(propertyId, "error", "No connected Stripe account is available for this listing. The host needs to connect Stripe."));
  }

  let status: "READY" | "RESTRICTED" | "PENDING";
  try {
    const refreshed = await syncStripePaymentAccount(
      admin, account.id, account.provider_account_id,
    );
    status = refreshed.status;
  } catch (error) {
    console.error("[admin stripe refresh] sync failed", error);
    redirect(returnPath(propertyId, "error", "Stripe status could not be refreshed. No account flags were changed. Check Stripe permissions or retry."));
  }

  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${propertyId}`);
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath("/host/payments");
  redirect(returnPath(propertyId, "saved", status === "READY"
    ? "Stripe now confirms live card payments are active. Review the listing and publish when ready."
    : `Stripe was contacted, but card payments are still ${status.toLowerCase()}. The host needs to finish Stripe's listed requirements.`));
}
