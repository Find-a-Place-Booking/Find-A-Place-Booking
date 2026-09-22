"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";

function field(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function taxRedirect(kind: "saved" | "error", message: string): never {
  redirect(`/admin/taxes?${kind}=${encodeURIComponent(message)}`);
}

async function requireFinanceAdmin() {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "FINANCE_ADMIN"])) {
    taxRedirect("error", "Finance-admin access is required for tax changes.");
  }
  return context;
}

function normalizeCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function percentToBps(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100);
}

export async function savePropertyTaxProfile(formData: FormData) {
  const context = await requireFinanceAdmin();
  const propertyId = field(formData, "propertyId", 100);
  const countyName = field(formData, "countyName", 120) || null;
  const localityName = field(formData, "localityName", 120) || null;
  const verificationNotes = field(formData, "verificationNotes", 2000) || null;
  const verified = checked(formData, "verified");
  const selectedRuleIds = [
    ...new Set(
      formData
        .getAll("taxRuleId")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];

  if (!propertyId) taxRedirect("error", "Property is required.");

  const admin = createAdminClient();
  const { error } = await admin.rpc("service_save_property_tax_profile", {
    target_property_id: propertyId,
    actor_profile_id: context.profileId,
    county_name_value: countyName,
    locality_name_value: localityName,
    verification_notes_value: verificationNotes,
    verified_value: verified,
    selected_rule_ids: selectedRuleIds,
  });

  if (error) taxRedirect("error", error.message);

  revalidatePath("/admin/taxes");
  taxRedirect(
    "saved",
    verified
      ? "Property tax jurisdiction verified."
      : "Property tax configuration saved as pending.",
  );
}

export async function createTaxAuthority(formData: FormData) {
  await requireFinanceAdmin();

  const code = normalizeCode(field(formData, "code", 80));
  const name = field(formData, "name", 180);
  const jurisdictionType = field(formData, "jurisdictionType", 40);
  const countryCode = (field(formData, "countryCode", 2) || "US").toUpperCase();
  const regionCode = field(formData, "regionCode", 40).toUpperCase() || null;
  const localityName = field(formData, "localityName", 120) || null;
  const remittanceAgency = field(formData, "remittanceAgency", 180);
  const sourceUrl = field(formData, "sourceUrl", 1000) || null;
  const allowedTypes = new Set([
    "STATE_SALES",
    "STATE_TOURISM",
    "COUNTY_SALES",
    "CITY_SALES",
    "LOCAL_LODGING",
    "OTHER",
  ]);

  if (!code || !name || !remittanceAgency || !allowedTypes.has(jurisdictionType)) {
    taxRedirect("error", "Complete the tax authority fields.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tax_authorities").insert({
    code,
    name,
    jurisdiction_type: jurisdictionType,
    country_code: countryCode,
    region_code: regionCode,
    locality_name: localityName,
    remittance_agency: remittanceAgency,
    source_url: sourceUrl,
    is_active: true,
  });

  if (error) taxRedirect("error", error.message);

  revalidatePath("/admin/taxes");
  taxRedirect("saved", "Tax authority created.");
}

export async function createTaxRule(formData: FormData) {
  await requireFinanceAdmin();

  const authorityId = field(formData, "authorityId", 100);
  const code = normalizeCode(field(formData, "code", 80));
  const label = field(formData, "label", 180);
  const rateBps = percentToBps(field(formData, "ratePercent", 20));
  const baseScope = field(formData, "baseScope", 40) || "ACCOMMODATION_TOTAL";
  const effectiveFrom = field(formData, "effectiveFrom", 20);
  const effectiveTo = field(formData, "effectiveTo", 20) || null;
  const maximumStayText = field(formData, "maximumStayNights", 10);
  const maximumStayNights = maximumStayText
    ? Number.parseInt(maximumStayText, 10)
    : null;
  const sourceUrl = field(formData, "sourceUrl", 1000) || null;

  if (
    !authorityId ||
    !code ||
    !label ||
    rateBps == null ||
    !effectiveFrom ||
    !["LODGING_ONLY", "ACCOMMODATION_TOTAL", "PRE_TAX_TOTAL"].includes(baseScope) ||
    (maximumStayNights != null &&
      (!Number.isInteger(maximumStayNights) || maximumStayNights < 1))
  ) {
    taxRedirect("error", "Complete the tax rule fields with a valid rate.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tax_rules").insert({
    authority_id: authorityId,
    code,
    label,
    rate_bps: rateBps,
    base_scope: baseScope,
    automatic_region: false,
    assignment_required: true,
    maximum_stay_nights: maximumStayNights,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    source_url: sourceUrl,
    is_active: true,
  });

  if (error) taxRedirect("error", error.message);

  revalidatePath("/admin/taxes");
  taxRedirect("saved", "Local tax rule created. Assign it to verified properties below.");
}
