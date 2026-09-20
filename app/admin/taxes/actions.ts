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
  const selectedRuleIds = formData
    .getAll("taxRuleId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!propertyId) taxRedirect("error", "Property is required.");

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error: profileError } = await admin
    .from("property_tax_profiles")
    .upsert(
      {
        property_id: propertyId,
        verification_status: verified ? "VERIFIED" : "PENDING",
        county_name: countyName,
        locality_name: localityName,
        verification_notes: verificationNotes,
        verified_by: verified ? context.profileId : null,
        verified_at: verified ? now : null,
        last_rate_review_at: verified ? now : null,
        updated_at: now,
      },
      { onConflict: "property_id" },
    );

  if (profileError) taxRedirect("error", profileError.message);

  const { error: clearError } = await admin
    .from("property_tax_rule_assignments")
    .delete()
    .eq("property_id", propertyId);

  if (clearError) taxRedirect("error", clearError.message);

  if (selectedRuleIds.length) {
    const { data: validRules, error: ruleError } = await admin
      .from("tax_rules")
      .select("id")
      .in("id", selectedRuleIds)
      .eq("assignment_required", true)
      .eq("is_active", true);

    if (ruleError) taxRedirect("error", ruleError.message);

    if (validRules?.length) {
      const { error: assignmentError } = await admin
        .from("property_tax_rule_assignments")
        .insert(
          validRules.map((rule) => ({
            property_id: propertyId,
            tax_rule_id: rule.id,
            verified_by: context.profileId,
            verified_at: now,
          })),
        );

      if (assignmentError) taxRedirect("error", assignmentError.message);
    }
  }

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

export async function recordTaxRemittance(formData: FormData) {
  const context = await requireFinanceAdmin();

  const authorityId = field(formData, "authorityId", 100);
  const periodStart = field(formData, "periodStart", 20);
  const periodEnd = field(formData, "periodEnd", 20);
  const amount = Number.parseFloat(field(formData, "amount", 30));
  const amountCents = Math.round(amount * 100);
  const status = field(formData, "status", 20) === "PAID" ? "PAID" : "FILED";
  const confirmationReference = field(formData, "confirmationReference", 180) || null;
  const notes = field(formData, "notes", 2000) || null;

  if (
    !authorityId ||
    !periodStart ||
    !periodEnd ||
    !Number.isFinite(amountCents) ||
    amountCents < 0
  ) {
    taxRedirect("error", "Enter a valid remittance period and amount.");
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin.from("tax_remittances").insert({
    authority_id: authorityId,
    period_start: periodStart,
    period_end: periodEnd,
    amount_cents: amountCents,
    currency: "USD",
    status,
    confirmation_reference: confirmationReference,
    notes,
    created_by: context.profileId,
    filed_at: now,
    paid_at: status === "PAID" ? now : null,
  });

  if (error) taxRedirect("error", error.message);

  revalidatePath("/admin/taxes");
  taxRedirect("saved", status === "PAID" ? "Tax payment recorded." : "Tax filing recorded.");
}

export async function markTaxRemittancePaid(formData: FormData) {
  await requireFinanceAdmin();

  const remittanceId = field(formData, "remittanceId", 100);
  const confirmationReference = field(formData, "confirmationReference", 180) || null;
  if (!remittanceId) taxRedirect("error", "Remittance record is required.");

  const admin = createAdminClient();
  const update: Record<string, string> = {
    status: "PAID",
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (confirmationReference) update.confirmation_reference = confirmationReference;

  const { error } = await admin
    .from("tax_remittances")
    .update(update)
    .eq("id", remittanceId);

  if (error) taxRedirect("error", error.message);

  revalidatePath("/admin/taxes");
  taxRedirect("saved", "Tax remittance marked paid.");
}
