import { notFound, redirect } from "next/navigation";

import { getHostProperties, getHostPropertyBySlug } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

export type PricingRule = {
  id: string;
  label: string;
  kind: "SPECIAL" | "SEASONAL" | "CUSTOM";
  start_date: string;
  end_date: string;
  nightly_cents: number;
  weekend_cents: number | null;
  priority: number;
  is_public_special: boolean;
  special_badge: string | null;
  is_active: boolean;
};

export type StayRule = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  minimum_nights: number;
  priority: number;
  is_active: boolean;
};

export type UnitAddOn = {
  id: string;
  name: string;
  description: string | null;
  amount_cents: number;
  calculation: "FLAT_PER_STAY" | "PER_NIGHT" | "PER_PERSON" | "PER_PERSON_PER_NIGHT";
  guest_visible: boolean;
  is_active: boolean;
  sort_order: number;
  tax_category: string | null;
};

export type PromotionCode = {
  id: string;
  unit_id: string | null;
  code: string;
  label: string;
  scope: "PROPERTY" | "ORGANIZATION";
  discount_type: "PERCENT" | "FIXED";
  percent_bps: number | null;
  amount_cents: number | null;
  currency: string;
  eligible_check_in_start: string | null;
  eligible_check_in_end: string | null;
  minimum_nights: number | null;
  minimum_lodging_cents: number | null;
  max_redemptions: number | null;
  redemption_count: number;
  is_active: boolean;
};

export type PricingQuote = {
  currency: string;
  check_in: string;
  check_out: string;
  nights: number;
  guest_count: number;
  pet_count: number;
  minimum_stay_nights: number;
  lodging_lines: Array<{ date: string; amount_cents: number; source: string; rate_rule_id: string | null; special_label: string | null }>;
  lodging_subtotal_before_discount_cents: number;
  promotion: null | {
    id: string;
    code: string;
    label: string;
    discount_type: "PERCENT" | "FIXED";
    percent_bps: number | null;
    amount_cents: number | null;
    discount_cents: number;
    scope: "PROPERTY" | "ORGANIZATION";
    max_redemptions: number | null;
    redemption_count: number;
  };
  discount_cents: number;
  lodging_subtotal_cents: number;
  fee_lines: Array<{ id: string; type: string; label: string; amount_cents: number }>;
  cleaning_fee_cents: number;
  pet_fee_cents: number;
  extra_guest_fee_cents: number;
  add_on_lines: Array<{ id: string; name: string; calculation: string; amount_cents: number; tax_category: string | null }>;
  add_on_subtotal_cents: number;
  pre_tax_total_cents: number;
  commission_base_cents: number;
  availability_checked: false;
  taxes_calculated: false;
  payment_processor_quoted: false;
  promotion_redemption_reserved: false;
  quote_is_bookable: false;
};

export type PricingBundle = {
  base: {
    currency: string;
    weeknight_cents: number | null;
    weekend_cents: number | null;
    included_guests: number | null;
    minimum_stay_nights: number;
  };
  fees: Array<{
    id: string;
    fee_type: "CLEANING" | "PET" | "EXTRA_GUEST" | "OTHER";
    label: string;
    amount_cents: number;
    calculation: string;
  }>;
  rate_rules: PricingRule[];
  stay_rules: StayRule[];
  add_ons: UnitAddOn[];
  promotion_codes: PromotionCode[];
};

export type PricingIndexItem = Awaited<ReturnType<typeof getHostProperties>>[number] & {
  weekendCents: number | null;
  includedGuests: number | null;
  rateRuleCount: number;
  stayRuleCount: number;
  addOnCount: number;
  promotionCount: number;
};

function emptyBundle(): PricingBundle {
  return {
    base: { currency: "USD", weeknight_cents: null, weekend_cents: null, included_guests: null, minimum_stay_nights: 1 },
    fees: [],
    rate_rules: [],
    stay_rules: [],
    add_ons: [],
    promotion_codes: [],
  };
}

export function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function calculationLabel(value: UnitAddOn["calculation"]) {
  if (value === "PER_NIGHT") return "per night";
  if (value === "PER_PERSON") return "per person";
  if (value === "PER_PERSON_PER_NIGHT") return "per person / night";
  return "per stay";
}

export function promotionValueLabel(promotion: Pick<PromotionCode, "discount_type" | "percent_bps" | "amount_cents">) {
  if (promotion.discount_type === "PERCENT") return `${((promotion.percent_bps ?? 0) / 100).toFixed((promotion.percent_bps ?? 0) % 100 ? 2 : 0)}% off`;
  return `${money(promotion.amount_cents)} off`;
}

export async function getHostPricingIndex(): Promise<PricingIndexItem[]> {
  const properties = await getHostProperties();
  if (!properties.length) return [];
  const supabase = await createClient();
  const unitIds = properties.map((property) => property.unitId);

  const organizationIds = [...new Set(properties.map((property) => property.organizationId))];
  const [baseResult, rateResult, stayResult, addOnResult, promotionResult] = await Promise.all([
    supabase.from("unit_rate_settings").select("unit_id,weekend_cents,included_guests").in("unit_id", unitIds),
    supabase.from("unit_rate_rules").select("unit_id").in("unit_id", unitIds).eq("is_active", true),
    supabase.from("unit_stay_rules").select("unit_id").in("unit_id", unitIds).eq("is_active", true),
    supabase.from("unit_add_ons").select("unit_id").in("unit_id", unitIds).eq("is_active", true),
    supabase.from("promotion_codes").select("organization_id,unit_id").in("organization_id", organizationIds).eq("is_active", true),
  ]);

  const firstError = baseResult.error ?? rateResult.error ?? stayResult.error ?? addOnResult.error ?? promotionResult.error;
  if (firstError) throw new Error("Unable to load host pricing. Run the current pricing migrations and refresh.");

  const baseByUnit = new Map<string, { unit_id: string; weekend_cents: number | null; included_guests: number | null }>(
    ((baseResult.data ?? []) as Array<{ unit_id: string; weekend_cents: number | null; included_guests: number | null }>).map((row) => [row.unit_id, row]),
  );
  const count = (rows: Array<{ unit_id: string }> | null) => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) map.set(row.unit_id, (map.get(row.unit_id) ?? 0) + 1);
    return map;
  };
  const rates = count(rateResult.data as Array<{ unit_id: string }> | null);
  const stays = count(stayResult.data as Array<{ unit_id: string }> | null);
  const addons = count(addOnResult.data as Array<{ unit_id: string }> | null);
  const promotions = (promotionResult.data ?? []) as Array<{ organization_id: string; unit_id: string | null }>;

  return properties.map((property) => ({
    ...property,
    weekendCents: baseByUnit.get(property.unitId)?.weekend_cents ?? null,
    includedGuests: baseByUnit.get(property.unitId)?.included_guests ?? null,
    rateRuleCount: rates.get(property.unitId) ?? 0,
    stayRuleCount: stays.get(property.unitId) ?? 0,
    addOnCount: addons.get(property.unitId) ?? 0,
    promotionCount: promotions.filter((promo) => promo.organization_id === property.organizationId && (promo.unit_id === null || promo.unit_id === property.unitId)).length,
  }));
}

export async function getPricingWorkspaceBySlug(slug: string) {
  const property = await getHostPropertyBySlug(slug);
  if (!property) return notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("host_pricing_bundle", { target_unit_id: property.unitId });
  if (error) {
    console.error("[host_pricing_bundle]", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    throw new Error("Unable to load pricing workspace. Make sure the current Supabase pricing migrations have been applied.");
  }
  return { property, pricing: (data ?? emptyBundle()) as PricingBundle };
}

export async function requirePricingTarget(unitId: string, slug: string) {
  if (!unitId || !slug) redirect("/host/rates?error=missing-property");
  return { unitId, slug };
}

export async function getHostQuotePreview(input: {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  pets: number;
  addOnIds: string[];
  promotionCode?: string;
}): Promise<{ quote: PricingQuote | null; error: string | null }> {
  if (!input.checkIn || !input.checkOut) return { quote: null, error: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_unit_stay", {
    target_unit_id: input.unitId,
    check_in_date: input.checkIn,
    check_out_date: input.checkOut,
    guest_count: input.guests,
    pet_count: input.pets,
    selected_add_on_ids: input.addOnIds,
    promotion_code: input.promotionCode?.trim() || null,
  });
  if (error) return { quote: null, error: error.message };
  return { quote: data as PricingQuote, error: null };
}
