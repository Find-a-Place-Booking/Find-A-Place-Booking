"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SavePropertyPayload = {
  propertyId: string;
  form: Record<string, string>;
  amenities: string[];
  policies: string[];
};

export type SavePropertyResult = {
  ok: boolean;
  message: string;
  slug?: string;
  status?: string;
  savedAt?: string;
};

function compact(value: unknown, max = 10000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizeForm(form: Record<string, string>) {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, compact(value)]));
}

function sanitizeSelection(values: string[], limit = 100) {
  return [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    .slice(0, limit)
    .map((value) => value.slice(0, 160));
}

async function requireHostSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

export async function createPropertyFromOnboarding(formData: FormData) {
  const organizationId = compact(formData.get("organizationId"), 100);
  if (!organizationId) redirect("/host/properties?error=missing-organization");
  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc("create_property_from_onboarding", { target_organization_id: organizationId });
  if (error) {
    console.error("[createPropertyFromOnboarding] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    redirect(`/host/properties?error=${encodeURIComponent(error.message || "create-failed")}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.slug) redirect("/host/properties?error=create-failed");
  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  redirect(`/host/properties/${row.slug}?created=1`);
}

export async function createBlankProperty(formData: FormData) {
  const organizationId = compact(formData.get("organizationId"), 100);
  const name = compact(formData.get("name"), 180).trim();
  const propertyType = compact(formData.get("propertyType"), 80).trim();
  const publicArea = compact(formData.get("publicArea"), 180).trim();
  if (!organizationId || !name) redirect("/host/properties/new?error=missing-required");

  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc("create_blank_property", {
    target_organization_id: organizationId,
    property_name: name,
    property_type: propertyType || null,
    public_area: publicArea || null,
  });
  if (error) {
    console.error("[createBlankProperty] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    redirect(`/host/properties/new?error=${encodeURIComponent(error.message || "create-failed")}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.slug) redirect("/host/properties/new?error=create-failed");
  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  redirect(`/host/properties/${row.slug}?created=1`);
}

export async function savePropertyListing(payload: SavePropertyPayload): Promise<SavePropertyResult> {
  if (!payload?.propertyId) return { ok: false, message: "Property ID is missing. Refresh and try again." };
  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc("save_property_listing", {
    target_property_id: payload.propertyId,
    listing_data: sanitizeForm(payload.form ?? {}),
    selected_amenities: sanitizeSelection(payload.amenities ?? []),
    selected_policies: sanitizeSelection(payload.policies ?? []),
  });

  if (error) {
    console.error("[savePropertyListing] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    const duplicateSlug = error.message?.includes("listing URL is already in use");
    const reservedSlug = error.message?.includes("listing URL is reserved");
    const reviewLocked = error.message?.includes("locked while under review");
    return {
      ok: false,
      message: duplicateSlug
        ? "That booking URL is already in use. Choose another."
        : reservedSlug
          ? "That booking URL is reserved. Choose another."
          : reviewLocked
            ? "This listing is locked while it is under review, approved or published."
            : "We couldn't save this property. Your changes are still on screen; try again before leaving.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${row?.slug ?? payload.form.slug ?? ""}`);
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  if (row?.property_id) revalidatePath(`/admin/properties/${row.property_id}`);

  return {
    ok: true,
    message: "Property saved.",
    slug: row?.slug,
    status: row?.status,
    savedAt: row?.saved_at,
  };
}

export async function submitPropertyForReview(formData: FormData) {
  const propertyId = compact(formData.get("propertyId"), 100);
  const slug = compact(formData.get("slug"), 120);
  if (!propertyId || !slug) redirect("/host/properties?error=missing-property");

  const supabase = await requireHostSession();
  const { error } = await supabase.rpc("submit_property_for_review", { target_property_id: propertyId });
  if (error) {
    console.error("[submitPropertyForReview] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    const message = error.message?.replace(/^Property is not ready for review:\s*/i, "Finish these items before submitting: ") || "The property could not be submitted for review.";
    redirect(`/host/properties/${encodeURIComponent(slug)}?review_error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  redirect(`/host/properties/${encodeURIComponent(slug)}?submitted=1`);
}

export async function archiveProperty(formData: FormData) {
  const propertyId = compact(formData.get("propertyId"), 100);
  if (!propertyId) redirect("/host/properties?error=missing-property");
  const supabase = await requireHostSession();
  const { error } = await supabase.rpc("archive_property", { target_property_id: propertyId });
  if (error) {
    console.error("[archiveProperty] RPC failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    redirect(`/host/properties?error=${encodeURIComponent(error.message || "archive-failed")}`);
  }
  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  redirect("/host/properties?archived=1");
}
