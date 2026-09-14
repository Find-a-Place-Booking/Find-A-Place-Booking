"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string, max = 500) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}
function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" ? "true" : "false";
}
function pricingRedirect(slug: string, result: string, detail?: string): never {
  const params = new URLSearchParams({ result });
  if (detail) params.set("detail", detail.slice(0, 220));
  redirect(`/host/rates/${encodeURIComponent(slug)}?${params.toString()}`);
}
async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  return error;
}
function refresh(slug: string) {
  revalidatePath("/host/rates");
  revalidatePath(`/host/rates/${slug}`);
  revalidatePath(`/host/properties/${slug}`);
  revalidatePath("/admin");
}

export async function saveBasePricing(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const error = await rpc("save_unit_base_pricing", {
    target_unit_id: unitId,
    pricing_data: {
      weeknight: text(formData, "weeknight", 40),
      weekend: text(formData, "weekend", 40),
      cleaning: text(formData, "cleaning", 40),
      pet: text(formData, "pet", 40),
      extraGuest: text(formData, "extraGuest", 40),
      includedGuests: text(formData, "includedGuests", 20),
      minimumStay: text(formData, "minimumStay", 20) || "1",
    },
  });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, "base-saved");
}

export async function saveRateRule(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const ruleId = text(formData, "ruleId", 100) || null;
  const error = await rpc("upsert_unit_rate_rule", {
    target_unit_id: unitId,
    target_rule_id: ruleId,
    rule_data: {
      label: text(formData, "label", 120),
      kind: text(formData, "kind", 20),
      startDate: text(formData, "startDate", 20),
      endDate: text(formData, "endDate", 20),
      nightly: text(formData, "nightly", 40),
      weekend: text(formData, "weekend", 40),
      priority: text(formData, "priority", 10) || "100",
      isPublicSpecial: checked(formData, "isPublicSpecial"),
      specialBadge: text(formData, "specialBadge", 80),
      isActive: checked(formData, "isActive"),
    },
  });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, ruleId ? "rate-updated" : "rate-created");
}

export async function deleteRateRule(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const ruleId = text(formData, "ruleId", 100);
  const error = await rpc("delete_unit_rate_rule", { target_unit_id: unitId, target_rule_id: ruleId });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, "rate-deleted");
}

export async function saveStayRule(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const ruleId = text(formData, "ruleId", 100) || null;
  const error = await rpc("upsert_unit_stay_rule", {
    target_unit_id: unitId,
    target_rule_id: ruleId,
    rule_data: {
      label: text(formData, "label", 120),
      startDate: text(formData, "startDate", 20),
      endDate: text(formData, "endDate", 20),
      minimumNights: text(formData, "minimumNights", 10),
      priority: text(formData, "priority", 10) || "100",
      isActive: checked(formData, "isActive"),
    },
  });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, ruleId ? "stay-updated" : "stay-created");
}

export async function deleteStayRule(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const ruleId = text(formData, "ruleId", 100);
  const error = await rpc("delete_unit_stay_rule", { target_unit_id: unitId, target_rule_id: ruleId });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, "stay-deleted");
}

export async function saveAddOn(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const addOnId = text(formData, "addOnId", 100) || null;
  const error = await rpc("upsert_unit_add_on", {
    target_unit_id: unitId,
    target_add_on_id: addOnId,
    add_on_data: {
      name: text(formData, "name", 120),
      description: text(formData, "description", 1000),
      amount: text(formData, "amount", 40),
      calculation: text(formData, "calculation", 40),
      guestVisible: checked(formData, "guestVisible"),
      isActive: checked(formData, "isActive"),
      sortOrder: text(formData, "sortOrder", 10) || "0",
    },
  });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, addOnId ? "addon-updated" : "addon-created");
}

export async function deleteAddOn(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const addOnId = text(formData, "addOnId", 100);
  const error = await rpc("delete_unit_add_on", { target_unit_id: unitId, target_add_on_id: addOnId });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, "addon-deleted");
}

export async function savePromotionCode(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const promotionId = text(formData, "promotionId", 100) || null;
  const error = await rpc("upsert_promotion_code", {
    target_unit_id: unitId,
    target_promotion_id: promotionId,
    promotion_data: {
      code: text(formData, "code", 40),
      label: text(formData, "label", 120),
      scope: text(formData, "scope", 20) || "PROPERTY",
      discountType: text(formData, "discountType", 20) || "PERCENT",
      discountValue: text(formData, "discountValue", 40),
      eligibleStart: text(formData, "eligibleStart", 20),
      eligibleEnd: text(formData, "eligibleEnd", 20),
      minimumNights: text(formData, "minimumNights", 10),
      minimumLodging: text(formData, "minimumLodging", 40),
      maxRedemptions: text(formData, "maxRedemptions", 10),
      allowWithPublicSpecial: checked(formData, "allowWithPublicSpecial"),
      isActive: checked(formData, "isActive"),
    },
  });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, promotionId ? "promo-updated" : "promo-created");
}

export async function deletePromotionCode(formData: FormData) {
  const unitId = text(formData, "unitId", 100);
  const slug = text(formData, "slug", 120);
  const promotionId = text(formData, "promotionId", 100);
  const error = await rpc("delete_promotion_code", { target_unit_id: unitId, target_promotion_id: promotionId });
  if (error) pricingRedirect(slug, "error", error.message);
  refresh(slug);
  pricingRedirect(slug, "promo-deleted");
}
