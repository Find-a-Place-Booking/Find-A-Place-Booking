import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { estimateAirbnbDifference, TYPICAL_AIRBNB_HOST_FEE_BPS } from "@/lib/bookings/airbnb-savings-estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = "USD";
const TTL_MS = 2 * 60 * 60 * 1000;

type JsonObj = Record<string, unknown>;

type SavedPrice = {
  listing_id: string | null;
  total_cents: number | null;
  currency: string;
  observed_at: string | null;
  price_basis: string;
};

function obj(value: unknown): JsonObj {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObj : {};
}

function dateIsValid(value: string) {
  if (!DATE_RE.test(value)) return false;
  const actual = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(actual.getTime()) && actual.toISOString().slice(0, 10) === value;
}

function empty() {
  return NextResponse.json({ available: false }, { headers: NO_STORE });
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function nonnegativeSafeCents(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}


/**
 * Reads the configured Apify Actor's exact-date, exact-listing price quote.
 * A quotation is deliberately rejected when its listing, dates, currency or
 * availability do not match. Airbnb's US visitor price basis is pre-tax;
 * taxes/optional extras must not be quietly compared with an all-in FAP total.
 * Never trust a nightly rate as a total for the whole trip.
 */
function parseActorQuote(
  raw: unknown, listingId: string, from: string, to: string, guests: number,
) {
  if (!Array.isArray(raw)) return null;
  for (const item of raw.slice(0, 10)) {
    const record = obj(item);
    const price = obj(record.price);
    const url = String(record.url ?? record.listing_url ?? "");
    const matchId = url.match(/airbnb\.com\/rooms\/(\d+)/)?.[1];
    const returnedId = String(record.listing_id ?? record.airbnb_id ?? record.id ?? matchId ?? "");
    if (returnedId !== listingId) continue;
    // Do not show "verified savings" unless the provider explicitly reports
    // that the amount is for our exact dates and guest count.
    const reportedIn = record.checkIn ?? record.check_in ?? price.checkIn ?? price.check_in;
    const reportedOut = record.checkOut ?? record.check_out ?? price.checkOut ?? price.check_out;
    const reportedGuests = record.adults ?? record.guests ?? price.adults ?? price.guests;
    if (reportedIn !== from || reportedOut !== to || Number(reportedGuests) !== guests) continue;
    if (price.is_available === false || record.available === false || record.is_available === false) continue;
    if (price.taxes_included === true || record.taxes_included === true) continue;
    // Accept only a specifically labeled total BEFORE taxes; an unqualified
    // 'total' might include taxes or represent a per-night amount.
    const dollars = numberOrNull(record.total_before_taxes ?? price.total_before_taxes);
    const currency = String(record.currency ?? price.currency ?? CURRENCY).toUpperCase();
    if (!dollars || currency !== CURRENCY || dollars > 100_000) continue;
    const cents = Math.round(dollars * 100);
    if (cents <= 0 || !Number.isSafeInteger(cents)) continue;
    return { cents, checkedAt: new Date().toISOString() };
  }
  return null;
}

async function fetchAirbnbQuote(
  token: string, listingId: string, checkIn: string, checkOut: string, guests: number,
) {
  // The Apify actor has a date/guest-specific public pricing-data interface.
  // Its availability and data formatting must be tested with a real API token
  // before this comparison should be treated as production-ready.
  const response = await fetch(
    "https://api.apify.com/v2/acts/thelastscraper~airbnb-scraper/run-sync-get-dataset-items",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        where: [`https://www.airbnb.com/rooms/${listingId}`],
        checkIn, checkOut, adults: guests, children: 0, infants: 0, pets: 0,
        currency: CURRENCY, proxyCountry: "US", maxListings: 1,
        dataLevel: "details", outputFormat: "spreadsheet", marketReport: "off",
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`Airbnb pricing provider returned ${response.status}`);
  const payload = await response.json();
  return parseActorQuote(payload, listingId, checkIn, checkOut, guests);
}

function clientPayload(saved: SavedPrice, comparisonTotalCents: number, listingId: string, checkIn: string, checkOut: string, guests: number) {
  return NextResponse.json({
    available: true,
    comparisonType: "VERIFIED",
    airbnbTotalCents: saved.total_cents,
    findAPlaceTotalCents: comparisonTotalCents,
    savingsCents: Number(saved.total_cents) - comparisonTotalCents,
    currency: CURRENCY,
    priceBasis: "BEFORE_TAXES",
    observedAt: saved.observed_at,
    airbnbListingUrl: `https://www.airbnb.com/rooms/${listingId}?check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}&adults=${guests}`,
  }, { headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  // The browser never supplies a comparison number. Each side is looked up
  // on the server from the authenticated database/OTA source.
  const q = request.nextUrl.searchParams;
  const unitId = q.get("unitId") || "";
  const checkIn = q.get("checkIn") || "";
  const checkOut = q.get("checkOut") || "";
  const guests = Number(q.get("guests"));
  if (!UUID_RE.test(unitId) || !dateIsValid(checkIn) || !dateIsValid(checkOut) ||
      !Number.isInteger(guests) || guests < 1 || guests > 16) return empty();

  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;
  const today = new Date().toISOString().slice(0, 10);
  const oneYear = new Date(Date.parse(`${today}T00:00:00Z`) + 365 * 86_400_000).toISOString().slice(0, 10);
  if (nights < 1 || nights > 28 || checkIn < today || checkIn > oneYear) return empty();

  try {
    const admin = createAdminClient();
    const { data: unit } = await admin.from("property_units")
      .select("id,property_id,is_active")
      .eq("id", unitId).eq("is_active", true).maybeSingle();
    if (!unit) return empty();
    const { data: property } = await admin.from("properties")
      .select("status,organization_id")
      .eq("id", unit.property_id).eq("status", "PUBLISHED").maybeSingle();
    if (!property) return empty();

    // The iCal connection is used ONLY to identify the same Airbnb listing.
    // Its secret URL never goes to the browser or to logs. A missing connection
    // leads to an explicitly labeled fee-model estimate, never a fake OTA quote.
    const { data: connection, error: connectionError } = await admin.from("calendar_connections")
      .select("feed_url")
      .eq("unit_id", unitId).eq("is_active", true).eq("provider", "AIRBNB")
      .limit(1).maybeSingle();
    // A database lookup failure must not turn a connected Airbnb listing into
    // an "unlinked" listing with modeled savings.
    if (connectionError) return empty();
    const listingId = connection
      ? String(connection.feed_url || "").match(/\/ical\/(\d+)\.ics/i)?.[1]
      : null;

    // Server-calculated guest subtotal, same dates and guests on FAP. Never
    // accept a browser-supplied price or strip a mandatory service fee.
    const { data: fapQuote, error: quoteError } = await admin.rpc(
      "fap_quote_guest_checkout_estimate_v2", {
        target_unit_id: unitId,
        check_in_date: checkIn,
        check_out_date: checkOut,
        guest_count: guests,
        pet_count: 0,
        selected_add_on_ids: [],
        promotion_code: null,
        requested_payment_environment: stripeEnvironment(),
      },
    );
    if (quoteError) return empty();
    const pricing = obj(obj(fapQuote).quote);
    if (String(pricing.currency ?? CURRENCY).toUpperCase() !== CURRENCY) return empty();
    const comparisonTotalCents = numberOrNull(pricing.pre_tax_total_cents);
    if (!comparisonTotalCents || !Number.isSafeInteger(comparisonTotalCents)) return empty();

    if (!connection) {
      const lodgingBaseCents = nonnegativeSafeCents(pricing.commission_base_cents);
      const guestServiceFeeCents = nonnegativeSafeCents(pricing.guest_service_fee_cents ?? 0);
      const feePayer = pricing.fee_payer === "GUEST" ? "GUEST" : "HOST";
      if (lodgingBaseCents === null || guestServiceFeeCents === null || !property.organization_id) return empty();

      const { data: organization, error: tierError } = await admin.from("organizations")
        .select("commission_tier")
        .eq("id", property.organization_id).maybeSingle();
      if (tierError || !organization) return empty();
      const rateBps = organization.commission_tier === "PARTNER_5" ? 500 : 700;
      const estimate = estimateAirbnbDifference({
        fapPreTaxTotalCents: comparisonTotalCents,
        lodgingBaseCents,
        guestServiceFeeCents,
        fapHostCommissionBps: rateBps,
        feePayer,
      });
      if (!estimate) return empty();

      return NextResponse.json({
        available: true,
        comparisonType: "ESTIMATED",
        airbnbTotalCents: estimate.airbnbEquivalentTotalCents,
        findAPlaceTotalCents: comparisonTotalCents,
        savingsCents: estimate.estimatedSavingsCents,
        currency: CURRENCY,
        priceBasis: "BEFORE_TAXES",
        airbnbHostFeeAssumptionBps: TYPICAL_AIRBNB_HOST_FEE_BPS,
        assumptions: estimate.assumptions,
      }, { headers: NO_STORE });
    }
    // An Airbnb integration exists: never disguise a missing verified quote
    // with an estimate. Prices remain unavailable until the real provider works.
    if (!listingId) return empty();

    const lookup = () => admin.from("airbnb_price_comparisons")
      .select("listing_id,total_cents,currency,observed_at,price_basis")
      .eq("unit_id", unitId).eq("check_in", checkIn)
      .eq("check_out", checkOut).eq("guests", guests)
      .maybeSingle();
    const cached = await lookup();
    const value = cached.data as SavedPrice | null;
    const fresh = value?.observed_at && Date.now() - Date.parse(value.observed_at) < TTL_MS;
    if (fresh && value?.listing_id === listingId && value.currency === CURRENCY &&
        value.price_basis === "BEFORE_TAXES" && value.total_cents && value.total_cents > 0) {
      return clientPayload(value, comparisonTotalCents, listingId, checkIn, checkOut, guests);
    }

    // No paid provider is contacted until a server-side token is configured.
    // No guest-provided number, fee guess, or stale price is shown instead.
    const token = process.env.APIFY_API_TOKEN?.trim();
    if (!token) return empty();

    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_airbnb_price_comparison", {
        target_unit_id: unitId, target_check_in: checkIn,
        target_check_out: checkOut, target_guests: guests,
      },
    );
    if (claimError || claimed !== true) return empty();

    let foundPrice: Awaited<ReturnType<typeof fetchAirbnbQuote>> = null;
    try {
      foundPrice = await fetchAirbnbQuote(token, listingId, checkIn, checkOut, guests);
    } catch (error) {
      console.warn("[airbnb comparison] provider lookup unavailable", {
        unitId, reason: error instanceof Error ? error.name : "unknown",
      });
    }

    if (!foundPrice) return empty();
    const { error: persistError } = await admin.from("airbnb_price_comparisons")
      .upsert({
        unit_id: unitId, check_in: checkIn, check_out: checkOut,
        guests, listing_id: listingId, currency: CURRENCY,
        total_cents: foundPrice.cents,
        price_basis: "BEFORE_TAXES", source: "APIFY",
        observed_at: foundPrice.checkedAt, updated_at: new Date().toISOString(),
      }, { onConflict: "unit_id,check_in,check_out,guests" });
    if (persistError) return empty();

    return clientPayload({
      listing_id: listingId, total_cents: foundPrice.cents,
      currency: CURRENCY, observed_at: foundPrice.checkedAt,
      price_basis: "BEFORE_TAXES",
    }, comparisonTotalCents, listingId, checkIn, checkOut, guests);
  } catch (error) {
    console.warn("[airbnb comparison] quote temporarily unavailable", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return empty();
  }
}
