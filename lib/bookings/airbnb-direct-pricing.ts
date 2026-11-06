/**
 * Best-effort, FIRST-PARTY comparison collector. No third-party scraper service,
 * proxy rotation, login automation, CAPTCHA bypass, or fabricated prices.
 *
 * Airbnb does not provide prices in iCal feeds and does not offer a general
 * public pricing API. Direct public pages may not contain a complete guest
 * quote and may prohibit automated use; use only where collection is authorized.
 * The parser requires all quote dimensions to match and returns null otherwise.
 *
 * A host-authorized pricing data feed can be configured using the server-only
 * AIRBNB_PRICE_FEED_URL and AIRBNB_PRICE_FEED_TOKEN variables. It must return
 * exact guest totals (not nightly rates), with all matching identifiers.
 */

const LIMIT_BYTES = 4_000_000;
const TIMEOUT_MS = 10_000;
const SCRIPT_LIMIT = 110;
const MAX_NODES = 35_000;

type Data = Record<string, unknown>;

export type AirbnbDirectQuery = {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
};

export type AirbnbDirectQuote = {
  cents: number;
  currency: "USD";
  observedAt: string;
  source: "DIRECT_PUBLIC_PAGE" | "HOST_AUTHORIZED_FEED";
};

function object(input: unknown): Data | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Data)
    : null;
}

function first(...values: unknown[]): unknown {
  return values.find(v => v !== null && v !== undefined && v !== "");
}

function value(record: Data | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  return first(...keys.map(k => record[k]));
}

function normalizeDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function asInteger(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

function centsFromDollars(raw: unknown): number | null {
  const cleaned = typeof raw === "string" ? raw.replace(/^\s*\$/, "").replaceAll(",", "").trim() : raw;
  const n = typeof cleaned === "number" ? cleaned : typeof cleaned === "string" && cleaned ? Number(cleaned) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
  const cents = Math.round(n * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function identifiedListingId(record: Data | null): string | null {
  if (!record) return null;
  const direct = first(
    value(record, "listing_id", "listingId", "airbnb_id", "airbnbId", "room_id", "roomId"),
    value(object(record.listing), "listing_id", "listingId", "roomId"),
  );
  if (typeof direct === "string" || typeof direct === "number") {
    const id = String(direct).trim();
    if (/^\d{5,25}$/.test(id)) return id;
  }
  const url = value(record, "url", "listing_url", "listingUrl");
  return typeof url === "string" ? url.match(/airbnb\.com\/rooms\/(\d{5,25})/)?.[1] ?? null : null;
}

function explicitTotalCents(record: Data, price: Data | null): number | null {
  const cents = first(
    value(record, "total_before_taxes_cents", "totalBeforeTaxesCents", "guest_total_before_taxes_cents"),
    value(price, "total_before_taxes_cents", "totalBeforeTaxesCents", "guest_total_before_taxes_cents"),
  );
  if (cents !== undefined) {
    const n = asInteger(cents);
    return n !== null && n > 0 && n <= 10_000_000 ? n : null;
  }
  const dollars = first(
    value(record, "total_before_taxes", "totalBeforeTaxes", "guest_total_before_taxes", "guestTotalBeforeTaxes"),
    value(price, "total_before_taxes", "totalBeforeTaxes", "guest_total_before_taxes", "guestTotalBeforeTaxes"),
  );
  return centsFromDollars(dollars);
}

/** Never infer an all-in stay price from an Airbnb nightly rate or generic price. */
export function parseExactAirbnbQuote(payload: unknown, input: AirbnbDirectQuery): number | null {
  const seen = new Set<object>();
  let visited = 0;
  let found: number | null = null;
  type Context = { id: string | null; inDate: string | null; outDate: string | null; guests: number | null; currency: string | null; unavailable: boolean };
  const rootContext: Context = { id: null, inDate: null, outDate: null, guests: null, currency: null, unavailable: false };

  function walk(node: unknown, inherited: Context, depth: number): void {
    if (found !== null || depth > 18 || ++visited > MAX_NODES || !node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 250)) walk(item, inherited, depth + 1);
      return;
    }
    const row = object(node)!;
    const price = object(row.price) || object(row.priceBreakdown) || object(row.pricing);
    const dates = object(row.dates) || object(row.stayDates) || object(row.stay);
    const ctx: Context = {
      id: identifiedListingId(row) ?? inherited.id,
      inDate: normalizeDate(first(value(row, "check_in", "checkIn", "checkin", "start_date", "startDate"), value(dates, "check_in", "checkIn", "start_date", "startDate"))) ?? inherited.inDate,
      outDate: normalizeDate(first(value(row, "check_out", "checkOut", "checkout", "end_date", "endDate"), value(dates, "check_out", "checkOut", "end_date", "endDate"))) ?? inherited.outDate,
      guests: asInteger(first(value(row, "guests", "guest_count", "guestCount", "adults"), value(object(row.party), "guests", "adults"))) ?? inherited.guests,
      currency: typeof first(value(row, "currency", "currencyCode", "priceCurrency"), value(price, "currency", "currencyCode", "priceCurrency")) === "string"
        ? String(first(value(row, "currency", "currencyCode", "priceCurrency"), value(price, "currency", "currencyCode", "priceCurrency"))).toUpperCase()
        : inherited.currency,
      unavailable: inherited.unavailable || row.available === false || row.is_available === false || row.isAvailable === false,
    };
    const total = explicitTotalCents(row, price);
    if (total !== null && ctx.id === input.listingId && ctx.inDate === input.checkIn && ctx.outDate === input.checkOut && ctx.guests === input.guests && ctx.currency === "USD" && !ctx.unavailable) {
      found = total;
      return;
    }
    // Only quote/pricing children may inherit the enclosing listing and trip
    // identifiers. Recommended nearby listings elsewhere on the page MUST
    // provide their own IDs, otherwise a neighbor's price could be misread.
    const quoteKeys = new Set([
      "price", "priceBreakdown", "pricing", "quote", "guestQuote", "guest_quote",
      "bookingQuote", "reservationQuote", "stayPrice", "costBreakdown",
    ]);
    for (const [key, child] of Object.entries(row)) {
      if (child && typeof child === "object") {
        walk(child, quoteKeys.has(key) ? ctx : rootContext, depth + 1);
      }
    }
  }
  walk(payload, rootContext, 0);
  return found;
}

/** Parse strictly JSON-formatted script data; never accept a loose $ amount in page text. */
export function parsePublicPageQuote(html: string, input: AirbnbDirectQuery): number | null {
  if (html.length > LIMIT_BYTES) return null;
  let count = 0;
  const scripts = html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    if (++count > SCRIPT_LIMIT) break;
    const data = match[1].trim();
    if (data.length < 10 || data.length > 2_500_000 || !/^[\[{]/.test(data)) continue;
    try {
      const parsed = JSON.parse(data);
      const total = parseExactAirbnbQuote(parsed, input);
      if (total !== null) return total;
    } catch { /* Page scripts need not be JSON; ignore unparseable fragments. */ }
  }
  return null;
}

async function readLimited(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > LIMIT_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > LIMIT_BYTES) return null;
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function fromHostAuthorizedFeed(input: AirbnbDirectQuery): Promise<AirbnbDirectQuote | null> {
  const rawUrl = process.env.AIRBNB_PRICE_FEED_URL?.trim();
  if (!rawUrl) return null;
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== "https:") return null;
  url.searchParams.set("listingId", input.listingId);
  url.searchParams.set("checkIn", input.checkIn);
  url.searchParams.set("checkOut", input.checkOut);
  url.searchParams.set("guests", String(input.guests));
  const token = process.env.AIRBNB_PRICE_FEED_TOKEN?.trim();
  const response = await fetch(url, {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  const body = await readLimited(response);
  if (!body) return null;
  const cents = parseExactAirbnbQuote(JSON.parse(body), input);
  return cents === null ? null : { cents, currency: "USD", source: "HOST_AUTHORIZED_FEED", observedAt: new Date().toISOString() };
}

async function fromPublicPage(input: AirbnbDirectQuery): Promise<AirbnbDirectQuote | null> {
  const url = new URL(`https://www.airbnb.com/rooms/${input.listingId}`);
  url.searchParams.set("check_in", input.checkIn);
  url.searchParams.set("check_out", input.checkOut);
  url.searchParams.set("adults", String(input.guests));
  url.searchParams.set("currency", "USD");
  url.searchParams.set("locale", "en");
  const response = await fetch(url, {
    method: "GET", redirect: "manual", cache: "no-store",
    headers: { Accept: "text/html", "User-Agent": "FindAPlaceBooking-PriceComparison/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok || response.status >= 300) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("text/html")) return null;
  const body = await readLimited(response);
  if (!body) return null;
  const cents = parsePublicPageQuote(body, input);
  return cents === null ? null : { cents, currency: "USD", source: "DIRECT_PUBLIC_PAGE", observedAt: new Date().toISOString() };
}

export async function fetchInHouseAirbnbQuote(input: AirbnbDirectQuery): Promise<AirbnbDirectQuote | null> {
  if (!/^\d{5,25}$/.test(input.listingId)) return null;
  // The feed, if provided, is host-authorized and preferred over page inspection.
  try {
    const authorized = await fromHostAuthorizedFeed(input);
    if (authorized) return authorized;
  } catch { /* No comparison instead of a guessed price. */ }
  // Do not evade access restrictions, log in, rotate proxies or bypass challenges.
  // Disable with AIRBNB_PUBLIC_PAGE_LOOKUP=false if collection is not authorized.
  if (process.env.AIRBNB_PUBLIC_PAGE_LOOKUP === "false") return null;
  try { return await fromPublicPage(input); } catch { return null; }
}
