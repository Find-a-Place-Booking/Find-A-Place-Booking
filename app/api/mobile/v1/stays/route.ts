import { NextRequest } from "next/server";
import { getPublishedProperties } from "@/lib/public/listings";
import { normalizeSearchRadiusMiles, searchPublishedStaysNearby } from "@/lib/public/nearby-destination-search";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const location = (q.get("where") || "").trim().slice(0, 100);
  const radius = normalizeSearchRadiusMiles(q.get("radius") || undefined);
  const checkIn = q.get("checkIn") || "";
  const checkOut = q.get("checkOut") || "";
  const guests = Math.min(Math.max(Number.parseInt(q.get("guests") || "1", 10) || 1, 1), 20);
  const savedSlugs = q.has("slugs")
    ? new Set((q.get("slugs") || "").split(",").map(s=>s.trim().toLowerCase())
        .filter(s=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)).slice(0,50))
    : null;
  try {
    const stays = await getPublishedProperties(savedSlugs ? undefined : {
      checkIn: /^\d{4}-\d{2}-\d{2}$/.test(checkIn) ? checkIn : "",
      checkOut: /^\d{4}-\d{2}-\d{2}$/.test(checkOut) ? checkOut : "",
    });
    const nearby = savedSlugs ? stays : (await searchPublishedStaysNearby(stays, location, radius)).properties;
    const filtered = nearby.filter(stay => savedSlugs
      ? savedSlugs.has(stay.slug)
      : stay.sleeps >= guests);
    return mobileJson(request, { stays: filtered.slice(0, 200).map(stay => ({
      slug: stay.slug, name: stay.name, location: stay.location, lat: stay.lat, lng: stay.lng,
      city: stay.city, region: stay.region, type: stay.type,
      sleeps: stay.sleeps, bedrooms: stay.bedrooms, baths: stay.baths,
      startingNightlyUsd: stay.price, cover: stay.image, tags: stay.tags,
      rating: stay.rating, reviewCount: stay.reviews,
    })), checkedAt: new Date().toISOString(),
    note: "Starting nightly rates. Date availability is confirmed again before payment." });
  } catch {
    return mobileJson(request, { error: "Stays are temporarily unavailable." }, 503);
  }
}
