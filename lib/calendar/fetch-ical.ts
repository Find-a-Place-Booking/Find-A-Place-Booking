import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_FEED_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 12_000;
const DNS_TIMEOUT_MS = 4_000;

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

function privateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}


async function lookupPublicAddresses(hostname: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Calendar host DNS lookup timed out.")), DNS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function normalizeIcalUrl(raw: string) {
  const trimmed = raw.trim();
  if (/^webcal:\/\//i.test(trimmed)) return `https://${trimmed.slice("webcal://".length)}`;
  return trimmed;
}


export async function readLimitedCalendarBody(response: Response, maxBytes = MAX_FEED_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("Calendar feed exceeded size limit.");
        throw new Error("The calendar feed is too large to import safely.");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

export async function assertSafeCalendarUrl(raw: string) {
  const normalized = normalizeIcalUrl(raw);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Enter a valid calendar feed URL.");
  }

  if (url.protocol !== "https:") throw new Error("Calendar feeds must use a secure HTTPS URL.");
  if (url.username || url.password) throw new Error("Calendar feed URLs cannot contain embedded usernames or passwords.");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("That calendar feed host is not allowed.");

  if (isIP(url.hostname)) {
    if (privateAddress(url.hostname)) throw new Error("Private or local network calendar URLs are not allowed.");
  } else {
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookupPublicAddresses(url.hostname);
    } catch {
      throw new Error("The calendar feed host could not be resolved.");
    }
    if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) {
      throw new Error("The calendar feed must resolve to a public internet address.");
    }
  }

  return url;
}

async function requestCalendar(url: URL, redirectCount: number): Promise<{ url: URL; body: string }> {
  if (redirectCount > MAX_REDIRECTS) throw new Error("The calendar feed redirected too many times.");
  await assertSafeCalendarUrl(url.toString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.1",
        "User-Agent": "Find-A-Place-Booking-Calendar/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The calendar feed returned an invalid redirect.");
      const next = new URL(location, url);
      await assertSafeCalendarUrl(next.toString());
      return requestCalendar(next, redirectCount + 1);
    }

    if (!response.ok) throw new Error(`The calendar feed returned HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_FEED_BYTES) throw new Error("The calendar feed is too large to import safely.");

    // Keep the abort timer active while streaming the body. This prevents a
    // server from sending headers promptly and then hanging or streaming an
    // unbounded response without Content-Length.
    const body = await readLimitedCalendarBody(response);
    if (!body.includes("BEGIN:VCALENDAR")) throw new Error("The URL did not return an iCalendar feed.");
    return { url, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The calendar feed timed out.");
    if (error instanceof Error && (error.message.startsWith("The calendar feed returned") || error.message.includes("too large") || error.message.includes("iCalendar feed"))) throw error;
    throw new Error("The calendar feed could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchIcalFeed(raw: string) {
  const url = await assertSafeCalendarUrl(raw);
  return requestCalendar(url, 0);
}
