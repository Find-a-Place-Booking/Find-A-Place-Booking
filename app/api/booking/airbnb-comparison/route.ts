import { NextRequest, NextResponse } from "next/server";

import { fetchInHouseAirbnbQuote } from "@/lib/bookings/airbnb-direct-pricing";
import {
  estimateAirbnbDifference,
  TYPICAL_AIRBNB_HOST_FEE_BPS,
} from "@/lib/bookings/airbnb-savings-estimate";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TTL_MS = 2 * 60 * 60 * 1000;
const USD = "USD";

type Data = Record<string, unknown>;
type StoredQuote = {
  listing_id: string | null;
  total_cents: number | null;
  currency: string;
  observed_at: string | null;
  price_basis: string;
  source: string | null;
};

type Breakdown = {
  lodgingCents: number;
  cleaningCents: number;
  extraGuestCents: number;
  guestServiceFeeCents: number;
  includedOtherCents: number;
  preTaxTotalCents: number;
};

function data(v: unknown): Data {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
}
function cents(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function positiveCents(v: unknown): number | null {
  const n = cents(v);
  return n !== null && n > 0 ? n : null;
}
function validDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const date = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
function unavailable() {
  return NextResponse.json({ available: false }, { headers: NO_STORE });
}
function breakdownFromQuote(pricing: Data, preTax: number): Breakdown | null {
  const lodging = cents(pricing.lodging_subtotal_cents);
  const cleaning = cents(pricing.cleaning_fee_cents ?? 0);
  const extra = cents(pricing.extra_guest_fee_cents ?? 0);
  const guestService = cents(pricing.guest_service_fee_cents ?? 0);
  if ([lodging, cleaning, extra, guestService].some(n => n === null)) return null;
  const includedOther = preTax - lodging! - cleaning! - extra! - guestService!;
  if (includedOther < 0) return null;
  return {
    lodgingCents: lodging!, cleaningCents: cleaning!,
    extraGuestCents: extra!, guestServiceFeeCents: guestService!,
    includedOtherCents: includedOther, preTaxTotalCents: preTax,
  };
}

function verifiedResponse(input: {
  quote: StoredQuote;
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  fapCents: number;
  breakdown: Breakdown | null;
}) {
  const { quote, listingId, checkIn, checkOut, guests, fapCents, breakdown } = input;
  return NextResponse.json({
    available: true,
    comparisonType: "VERIFIED",
    airbnbTotalCents: quote.total_cents,
    findAPlaceTotalCents: fapCents,
    savingsCents: Number(quote.total_cents) - fapCents,
    currency: USD,
    priceBasis: "BEFORE_TAXES",
    observedAt: quote.observed_at,
    airbnbListingUrl: `https://www.airbnb.com/rooms/${listingId}?check_in=${checkIn}&check_out=${checkOut}&adults=${guests}`,
    breakdown,
  }, { headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const unitId = q.get("unitId") ?? "";
  const checkIn = q.get("checkIn") ?? "";
  const checkOut = q.get("checkOut") ?? "";
  const guests = Number(q.get("guests"));
  if (!UUID_RE.test(unitId) || !validDate(checkIn) || !validDate(checkOut)
    || !Number.isInteger(guests) || guests < 1 || guests > 16) return unavailable();
  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;
  const today = new Date().toISOString().slice(0, 10);
  const lastAllowed = new Date(Date.parse(`${today}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
  if (nights < 1 || nights > 28 || checkIn < today || checkIn > lastAllowed) return unavailable();

  try {
    const admin = createAdminClient();
    const { data: unit, error: unitError } = await admin
      .from("property_units").select("id,property_id,is_active")
      .eq("id", unitId).eq("is_active", true).maybeSingle();
    if (unitError || !unit) return unavailable();
    const { data: property, error: propertyError } = await admin
      .from("properties").select("status,organization_id")
      .eq("id", unit.property_id).eq("status", "PUBLISHED").maybeSingle();
    if (propertyError || !property) return unavailable();

    const [{ data: connected, error: connectionError }, { data: quoteResult, error: quoteError }] = await Promise.all([
      admin.from("calendar_connections").select("feed_url")
        .eq("unit_id", unitId).eq("provider", "AIRBNB")
        .eq("is_active", true).limit(1).maybeSingle(),
      admin.rpc("fap_quote_guest_checkout_estimate_v2", {
        target_unit_id: unitId,
        check_in_date: checkIn,
        check_out_date: checkOut,
        guest_count: guests,
        pet_count: 0,
        selected_add_on_ids: [],
        promotion_code: null,
        requested_payment_environment: stripeEnvironment(),
      }),
    ]);
    // Never silently treat an Airbnb-linked property as unlinked if the lookup fails.
    if (connectionError || quoteError) return unavailable();
    const price = data(data(quoteResult).quote);
    if (String(price.currency || USD).toUpperCase() !== USD) return unavailable();
    const fapCents = positiveCents(price.pre_tax_total_cents);
    if (!fapCents) return unavailable();
    const breakdown = breakdownFromQuote(price, fapCents);

    if (!connected) {
      // A model for a comparable booking cost; not an Airbnb listing quote.
      const lodgingBase = cents(price.commission_base_cents);
      const guestFee = cents(price.guest_service_fee_cents ?? 0);
      const feePayer = price.fee_payer === "GUEST" ? "GUEST" : "HOST";
      if (lodgingBase === null || guestFee === null) return unavailable();
      const { data: host, error: hostError } = await admin.from("organizations")
        .select("commission_tier")
        .eq("id", property.organization_id).maybeSingle();
      if (hostError || !host) return unavailable();
      const feeBps = host.commission_tier === "PARTNER_5" ? 500 : 700;
      const model = estimateAirbnbDifference({
        fapPreTaxTotalCents: fapCents,
        lodgingBaseCents: lodgingBase,
        guestServiceFeeCents: guestFee,
        fapHostCommissionBps: feeBps,
        feePayer,
      });
      if (!model) return unavailable();
      return NextResponse.json({
        available: true,
        comparisonType: "ESTIMATED",
        airbnbTotalCents: model.airbnbEquivalentTotalCents,
        findAPlaceTotalCents: fapCents,
        savingsCents: model.estimatedSavingsCents,
        currency: USD,
        priceBasis: "BEFORE_TAXES",
        assumptions: model.assumptions,
        airbnbHostFeeAssumptionBps: TYPICAL_AIRBNB_HOST_FEE_BPS,
        fapHostFeeAssumptionBps: feeBps,
        hostFeeComparison: {
          fapHostCommissionCents: feePayer === "HOST"
            ? Math.round(lodgingBase * feeBps / 10_000) : 0,
          modeledAirbnbHostFeeCents: Math.round(
            model.airbnbEquivalentTotalCents * TYPICAL_AIRBNB_HOST_FEE_BPS / 10_000,
          ),
        },
        breakdown,
      }, { headers: NO_STORE });
    }

    // A connected Airbnb calendar identifies the same listing, but includes no prices.
    const listingId = String(connected.feed_url ?? "").match(/\/ical\/(\d{5,25})\.ics/i)?.[1];
    if (!listingId) return unavailable();
    const loadCached = () => admin.from("airbnb_price_comparisons")
      .select("listing_id,total_cents,currency,observed_at,price_basis,source")
      .eq("unit_id", unitId).eq("check_in", checkIn)
      .eq("check_out", checkOut).eq("guests", guests).maybeSingle();

    const { data: cached, error: cacheError } = await loadCached();
    if (cacheError) return unavailable();
    const previous = cached as StoredQuote | null;
    const isFresh = previous?.observed_at &&
      Date.now() - Date.parse(previous.observed_at) >= 0 &&
      Date.now() - Date.parse(previous.observed_at) < TTL_MS;
    if (isFresh && previous?.listing_id === listingId && previous.currency === USD &&
      previous.price_basis === "BEFORE_TAXES" && positiveCents(previous.total_cents)) {
      return verifiedResponse({ quote: previous, listingId, checkIn, checkOut, guests, fapCents, breakdown });
    }

    // Existing DB throttles: 30 minute cooldown per dates/party combination,
    // 6 new lookups per unit per hour, 120 platform-wide per hour.
    const { data: claimed, error: claimError } = await admin.rpc("claim_airbnb_price_comparison", {
      target_unit_id: unitId, target_check_in: checkIn,
      target_check_out: checkOut, target_guests: guests,
    });
    if (claimError || claimed !== true) return unavailable();

    const quote = await fetchInHouseAirbnbQuote({ listingId, checkIn, checkOut, guests });
    if (!quote) return unavailable();
    const now = new Date().toISOString();
    const { error: saveError } = await admin.from("airbnb_price_comparisons").upsert({
      unit_id: unitId, check_in: checkIn, check_out: checkOut, guests,
      listing_id: listingId, total_cents: quote.cents, currency: USD,
      price_basis: "BEFORE_TAXES", source: quote.source,
      observed_at: quote.observedAt, updated_at: now,
    }, { onConflict: "unit_id,check_in,check_out,guests" });
    if (saveError) return unavailable();
    return verifiedResponse({
      quote: { listing_id: listingId, total_cents: quote.cents, currency: USD,
        observed_at: quote.observedAt, price_basis: "BEFORE_TAXES", source: quote.source },
      listingId, checkIn, checkOut, guests, fapCents, breakdown,
    });
  } catch (error) {
    console.warn("[direct booking comparison] price unavailable", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    // Price comparisons never block or change a real checkout.
    return unavailable();
  }
}
