export const CANONICAL_SITE_URL = (
  process.env.NEXT_PUBLIC_CANONICAL_SITE_URL?.trim() ||
  "https://findaplacebooking.com"
).replace(/\/+$/, "");

export const SITE_NAME = "Find A Place Booking";

export const DEFAULT_DESCRIPTION =
  "Find independent cabins, cottages, RV stays, lake stays and one-of-a-kind places near the trips you want to take.";

export function absoluteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_SITE_URL}${normalized}`;
}

export function seoDescription(value: string | null | undefined, fallback = DEFAULT_DESCRIPTION) {
  const clean = (value || fallback).replace(/\s+/g, " ").trim();
  if (clean.length <= 158) return clean;
  return `${clean.slice(0, 155).trimEnd()}…`;
}
