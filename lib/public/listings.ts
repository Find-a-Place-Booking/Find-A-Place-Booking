import { redirect } from "next/navigation";

import type { Property } from "@/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { createSignedUrlMap } from "@/lib/storage/signed-urls";

type PublicIndexRow = {
  property_id: string;
  unit_id: string;
  slug: string;
  name: string;
  description: string | null;
  property_type: string | null;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  max_guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  weeknight_cents: number | null;
  weekend_cents: number | null;
  host_name: string;
  amenity_labels: string[] | null;
  image_paths: string[] | null;
};

type PublicDetailRow = {
  property_id: string;
  unit_id: string;
  canonical_slug: string;
  requested_is_history: boolean;
  name: string;
  description: string | null;
  property_type: string | null;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  public_address: string | null;
  max_guests: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  minimum_stay_nights: number;
  check_in: string | null;
  checkout: string | null;
  cancellation_policy: string | null;
  weeknight_cents: number | null;
  weekend_cents: number | null;
  host_name: string;
  amenity_labels: string[] | null;
  policy_labels: string[] | null;
  custom_amenities: string | null;
  custom_policies: string | null;
  image_paths: string[] | null;
};

export type PublishedListingDetail = {
  propertyId: string;
  unitId: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  location: string;
  city: string;
  state: string;
  sleeps: number;
  bedrooms: number;
  beds: number;
  baths: number;
  minimumStayNights: number;
  checkIn: string | null;
  checkout: string | null;
  cancellationPolicy: string | null;
  price: number;
  weekendPrice: number | null;
  hostName: string;
  amenities: string[];
  policies: string[];
  customAmenities: string | null;
  customPolicies: string | null;
  images: string[];
};

function regionName(code: string | null) {
  if (!code) return "";
  const normalized = code.toUpperCase();
  if (normalized === "AR") return "Arkansas";
  if (normalized === "MO") return "Missouri";
  if (normalized === "TX") return "Texas";
  if (normalized === "OK") return "Oklahoma";
  if (normalized === "TN") return "Tennessee";
  return normalized;
}

export async function getPublishedProperties(limit?: number): Promise<Property[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_listing_index");
  if (error) {
    console.error("[getPublishedProperties] public_listing_index failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return [];
  }

  const allRows = (data ?? []) as PublicIndexRow[];
  const rows = typeof limit === "number" && limit >= 0 ? allRows.slice(0, limit) : allRows;
  // Listing cards render only the cover image. Sign all covers in bounded batch
  // requests instead of making 1-3 Storage signing calls per property.
  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);
  const signedCovers = await createSignedUrlMap(supabase, "property-images", coverPaths, 3600);

  return rows.map((row) => {
    const coverPath = row.image_paths?.[0] ?? null;
    const cover = coverPath ? signedCovers.get(coverPath) ?? "" : "";
    const location = row.public_area || [row.city, row.region_code].filter(Boolean).join(", ") || "Regional stay";
    const price = Math.round((row.weeknight_cents ?? 0) / 100);
    return {
      slug: row.slug,
      name: row.name,
      location,
      city: row.city ?? "",
      state: row.region_code ?? "",
      region: regionName(row.region_code),
      type: row.property_type || "Stay",
      sleeps: row.max_guests ?? 1,
      bedrooms: row.bedrooms ?? 0,
      baths: Number(row.bathrooms ?? 0),
      price,
      rating: 0,
      reviews: 0,
      image: cover,
      image2: cover,
      image3: cover,
      tags: row.amenity_labels ?? [],
      blurb: row.description || "Independent stay listed with Find A Place Booking.",
      hostName: row.host_name || "Find A Place host",
      instantBook: false,
      lat: 0,
      lng: 0,
    } satisfies Property;
  });
}

export async function getPublishedListingBySlug(requestedSlug: string): Promise<PublishedListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_listing_detail", { requested_slug: requestedSlug });
  if (error) {
    console.error("[getPublishedListingBySlug] public_listing_detail failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as PublicDetailRow | undefined;
  if (!row) return null;
  if (row.requested_is_history && row.canonical_slug && row.canonical_slug !== requestedSlug) redirect(`/stays/${row.canonical_slug}`);

  const imagePaths = (row.image_paths ?? []).slice(0, 12);
  const signedImages = await createSignedUrlMap(supabase, "property-images", imagePaths, 3600);
  const images = imagePaths.map((path) => signedImages.get(path)).filter((value): value is string => Boolean(value));
  return {
    propertyId: row.property_id,
    unitId: row.unit_id,
    slug: row.canonical_slug,
    name: row.name,
    description: row.description || "Independent stay listed with Find A Place Booking.",
    type: row.property_type || "Stay",
    location: row.public_address || row.public_area || [row.city, row.region_code].filter(Boolean).join(", ") || "Regional stay",
    city: row.city ?? "",
    state: row.region_code ?? "",
    sleeps: row.max_guests ?? 1,
    bedrooms: row.bedrooms ?? 0,
    beds: row.beds ?? 0,
    baths: Number(row.bathrooms ?? 0),
    minimumStayNights: row.minimum_stay_nights ?? 1,
    checkIn: row.check_in,
    checkout: row.checkout,
    cancellationPolicy: row.cancellation_policy,
    price: Math.round((row.weeknight_cents ?? 0) / 100),
    weekendPrice: row.weekend_cents == null ? null : Math.round(row.weekend_cents / 100),
    hostName: row.host_name || "Find A Place host",
    amenities: row.amenity_labels ?? [],
    policies: row.policy_labels ?? [],
    customAmenities: row.custom_amenities,
    customPolicies: row.custom_policies,
    images,
  };
}
