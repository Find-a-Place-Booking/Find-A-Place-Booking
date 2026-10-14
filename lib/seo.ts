const configuredCanonical =
  process.env.NEXT_PUBLIC_CANONICAL_SITE_URL?.trim() ||
  "https://www.findaplacebooking.com";

function normalizeCanonicalSiteUrl(value: string) {
  const fallback = "https://www.findaplacebooking.com";

  try {
    const parsed = new URL(value);

    // Production redirects the apex domain to www. Keep every canonical,
    // og:url and absolute asset URL on the final public hostname so crawlers
    // do not have to follow a second redirect before reading the page/image.
    if (parsed.hostname === "findaplacebooking.com") {
      parsed.hostname = "www.findaplacebooking.com";
    }

    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export const CANONICAL_SITE_URL =
  normalizeCanonicalSiteUrl(configuredCanonical);

export const SITE_NAME = "Find A Place Booking";

export const DEFAULT_DESCRIPTION =
  "Find independent cabins, cottages, RV stays, lake stays and one-of-a-kind places near the trips you want to take.";

export function absoluteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_SITE_URL}${normalized}`;
}

export function seoDescription(
  value: string | null | undefined,
  fallback = DEFAULT_DESCRIPTION,
) {
  const clean = (value || fallback).replace(/\s+/g, " ").trim();
  if (clean.length <= 158) return clean;
  return `${clean.slice(0, 155).trimEnd()}…`;
}
