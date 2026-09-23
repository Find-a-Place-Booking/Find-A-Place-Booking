import { redirect } from "next/navigation";

import type { Property } from "@/data/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
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

type PublicMapCoordinateRow = {
  property_id: string;
  map_latitude: number | string | null;
  map_longitude: number | string | null;
};

type PublicMapListingRow = {
  property_id: string;
  slug: string;
  name: string;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  weeknight_cents: number | null;
  map_latitude: number | string | null;
  map_longitude: number | string | null;
};

export type PublicMapStay = {
  slug: string;
  name: string;
  location: string;
  price: number;
  lat: number;
  lng: number;
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

export type PublishedReview = {
  id: string;
  rating: number;
  body: string | null;
  guestName: string;
  hostResponse: string | null;
  createdAt: string;
};

export type PublicGuestAddOn = {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  calculation: string;
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
  addOns: PublicGuestAddOn[];
  customAmenities: string | null;
  customPolicies: string | null;
  images: string[];
  rating: number;
  reviewCount: number;
  reviews: PublishedReview[];
  policyDocument: {
    name: string;
    version: number;
    url: string;
  } | null;
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

function reviewStats(
  rows: Array<{ property_id: string; rating: number }>,
) {
  const byProperty = new Map<
    string,
    { total: number; count: number; rating: number }
  >();

  for (const row of rows) {
    const current = byProperty.get(row.property_id) ?? {
      total: 0,
      count: 0,
      rating: 0,
    };
    current.total += Number(row.rating);
    current.count += 1;
    current.rating = current.total / current.count;
    byProperty.set(row.property_id, current);
  }

  return byProperty;
}

type PublishedPropertySearch = {
  limit?: number;
  checkIn?: string;
  checkOut?: string;
  featuredPriority?: boolean;
};

async function orderHomepageFeaturedRows(rows: PublicIndexRow[]) {
  if (rows.length < 2) return rows;

  const admin = createAdminClient();
  const propertyIds = rows.map((row) => row.property_id);

  const { data, error } = await admin
    .from("properties")
    .select("id,homepage_feature_priority")
    .in("id", propertyIds);

  if (error) {
    console.error("[getPublishedProperties] homepage feature priority unavailable", error);
    return rows;
  }

  const priorityByProperty = new Map(
    (data ?? []).map((row) => [
      row.id as string,
      Number(row.homepage_feature_priority || 3),
    ]),
  );

  // Keep the existing public-listing order inside each priority band. The
  // only ranking rule added here is 1 before 2 before 3.
  return rows
    .map((row, originalIndex) => ({
      row,
      originalIndex,
      priority: priorityByProperty.get(row.property_id) ?? 3,
    }))
    .sort((a, b) => {
      const priorityDifference = a.priority - b.priority;
      return priorityDifference || a.originalIndex - b.originalIndex;
    })
    .map(({ row }) => row);
}

export async function getPublishedProperties(
  input?: number | PublishedPropertySearch,
): Promise<Property[]> {
  const numericFeaturedRequest = typeof input === "number";
  const options =
    numericFeaturedRequest
      ? { limit: input, featuredPriority: true }
      : input ?? {};

  const supabase = await createClient();
  const [listingResult, coordinateResult] = await Promise.all([
    supabase.rpc("public_listing_index"),
    supabase.rpc("public_listing_map_coordinates"),
  ]);
  const { data, error } = listingResult;

  if (error) {
    console.error("[getPublishedProperties] public_listing_index failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  const mapCoordinateByProperty = new Map<string, PublicMapCoordinateRow>();
  if (coordinateResult.error) {
    console.error(
      "[getPublishedProperties] public_listing_map_coordinates failed",
      coordinateResult.error,
    );
  } else {
    for (const row of (coordinateResult.data ?? []) as PublicMapCoordinateRow[]) {
      mapCoordinateByProperty.set(row.property_id, row);
    }
  }

  let allRows = (data ?? []) as PublicIndexRow[];
  const validDateRange =
    /^\d{4}-\d{2}-\d{2}$/.test(options.checkIn || "") &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.checkOut || "") &&
    options.checkOut! > options.checkIn!;

  if (validDateRange && allRows.length) {
    const admin = createAdminClient();
    const { data: blocks, error: blockError } = await admin
      .from("availability_blocks")
      .select("unit_id,block_type,expires_at")
      .in("unit_id", allRows.map((row) => row.unit_id))
      .eq("state", "ACTIVE")
      .lt("start_date", options.checkOut!)
      .gt("end_date", options.checkIn!);

    if (blockError) {
      console.error("[getPublishedProperties] availability filter failed", blockError);
    } else {
      const now = Date.now();
      const blockedUnits = new Set(
        (blocks ?? [])
          .filter(
            (block) =>
              block.block_type !== "INTERNAL_HOLD" ||
              !block.expires_at ||
              new Date(block.expires_at).getTime() > now,
          )
          .map((block) => block.unit_id),
      );
      allRows = allRows.filter((row) => !blockedUnits.has(row.unit_id));
    }
  }

  if (options.featuredPriority) {
    allRows = await orderHomepageFeaturedRows(allRows);
  }

  const rows =
    typeof options.limit === "number" && options.limit >= 0
      ? allRows.slice(0, options.limit)
      : allRows;

  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);
  const signedCovers = await createSignedUrlMap(
    supabase,
    "property-images",
    coverPaths,
    3600,
  );

  let stats = new Map<
    string,
    { total: number; count: number; rating: number }
  >();

  try {
    const propertyIds = rows.map((row) => row.property_id);
    if (propertyIds.length) {
      const admin = createAdminClient();
      const { data: reviewRows } = await admin
        .from("reservation_reviews")
        .select("property_id,rating")
        .in("property_id", propertyIds)
        .eq("status", "PUBLISHED");

      stats = reviewStats(
        (reviewRows ?? []) as Array<{
          property_id: string;
          rating: number;
        }>,
      );
    }
  } catch (reviewError) {
    console.error("[getPublishedProperties] reviews unavailable", reviewError);
  }

  return rows.map((row) => {
    const coverPath = row.image_paths?.[0] ?? null;
    const cover = coverPath ? signedCovers.get(coverPath) ?? "" : "";
    const location =
      row.public_area ||
      [row.city, row.region_code].filter(Boolean).join(", ") ||
      "Regional stay";
    const price = Math.round((row.weeknight_cents ?? 0) / 100);
    const propertyReviews = stats.get(row.property_id);
    const mapCoordinates = mapCoordinateByProperty.get(row.property_id);
    const mapLatitude = Number(mapCoordinates?.map_latitude);
    const mapLongitude = Number(mapCoordinates?.map_longitude);

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
      rating: propertyReviews
        ? Math.round(propertyReviews.rating * 10) / 10
        : 0,
      reviews: propertyReviews?.count ?? 0,
      image: cover,
      image2: cover,
      image3: cover,
      tags: row.amenity_labels ?? [],
      blurb:
        row.description ||
        "Independent stay listed with Find A Place Booking.",
      hostName: row.host_name || "Find A Place host",
      instantBook: false,
      lat: Number.isFinite(mapLatitude) ? mapLatitude : 0,
      lng: Number.isFinite(mapLongitude) ? mapLongitude : 0,
    } satisfies Property;
  });
}

export async function getPublishedMapStays(): Promise<PublicMapStay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_map_listing_index");

  if (error) {
    console.error("[getPublishedMapStays] public_map_listing_index failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return ((data ?? []) as PublicMapListingRow[]).flatMap((row) => {
    const lat = Number(row.map_latitude);
    const lng = Number(row.map_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    return [{
      slug: row.slug,
      name: row.name,
      location:
        row.public_area ||
        [row.city, row.region_code].filter(Boolean).join(", ") ||
        "Regional stay",
      price: Math.round((row.weeknight_cents ?? 0) / 100),
      lat,
      lng,
    } satisfies PublicMapStay];
  });
}

export async function getPublishedListingBySlug(
  requestedSlug: string,
): Promise<PublishedListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_listing_detail", {
    requested_slug: requestedSlug,
  });

  if (error) {
    console.error("[getPublishedListingBySlug] public_listing_detail failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | PublicDetailRow
    | undefined;

  if (!row) return null;

  if (
    row.requested_is_history &&
    row.canonical_slug &&
    row.canonical_slug !== requestedSlug
  ) {
    redirect(`/stays/${row.canonical_slug}`);
  }

  const imagePaths = (row.image_paths ?? []).slice(0, 12);
  const signedImages = await createSignedUrlMap(
    supabase,
    "property-images",
    imagePaths,
    3600,
  );
  const images = imagePaths
    .map((path) => signedImages.get(path))
    .filter((value): value is string => Boolean(value));

  let reviews: PublishedReview[] = [];
  let addOns: PublicGuestAddOn[] = [];
  let policyDocument: PublishedListingDetail["policyDocument"] = null;

  try {
    const admin = createAdminClient();

    const [reviewsResult, policyResult, addOnResult] = await Promise.all([
      admin
        .from("reservation_reviews")
        .select(
          "id,rating,body,guest_name_snapshot,host_response,created_at",
        )
        .eq("property_id", row.property_id)
        .eq("status", "PUBLISHED")
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("property_policy_documents")
        .select("storage_path,original_name,version")
        .eq("property_id", row.property_id)
        .eq("is_current", true)
        .maybeSingle(),
      admin
        .from("unit_add_ons")
        .select("id,name,description,amount_cents,calculation")
        .eq("unit_id", row.unit_id)
        .eq("is_active", true)
        .eq("guest_visible", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    reviews = (reviewsResult.data ?? []).map((review) => ({
      id: review.id,
      rating: Number(review.rating),
      body: review.body,
      guestName: review.guest_name_snapshot || "Verified guest",
      hostResponse: review.host_response,
      createdAt: review.created_at,
    }));

    if (addOnResult.error) {
      console.error("[getPublishedListingBySlug] add-ons unavailable", addOnResult.error);
    } else {
      addOns = (addOnResult.data ?? []).map((addOn) => ({
        id: addOn.id,
        name: addOn.name,
        description: addOn.description,
        amountCents: Number(addOn.amount_cents || 0),
        calculation: addOn.calculation,
      }));
    }

    if (policyResult.data) {
      const { data: signed } = await admin.storage
        .from("property-documents")
        .createSignedUrl(policyResult.data.storage_path, 3600);

      if (signed?.signedUrl) {
        policyDocument = {
          name: policyResult.data.original_name,
          version: policyResult.data.version,
          url: signed.signedUrl,
        };
      }
    }
  } catch (extraError) {
    console.error("[getPublishedListingBySlug] extras unavailable", extraError);
  }

  const rating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) /
      reviews.length
    : 0;

  return {
    propertyId: row.property_id,
    unitId: row.unit_id,
    slug: row.canonical_slug,
    name: row.name,
    description:
      row.description ||
      "Independent stay listed with Find A Place Booking.",
    type: row.property_type || "Stay",
    location:
      row.public_address ||
      row.public_area ||
      [row.city, row.region_code].filter(Boolean).join(", ") ||
      "Regional stay",
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
    weekendPrice:
      row.weekend_cents == null
        ? null
        : Math.round(row.weekend_cents / 100),
    hostName: row.host_name || "Find A Place host",
    amenities: row.amenity_labels ?? [],
    policies: row.policy_labels ?? [],
    addOns,
    customAmenities: row.custom_amenities,
    customPolicies: row.custom_policies,
    images,
    rating: Math.round(rating * 10) / 10,
    reviewCount: reviews.length,
    reviews,
    policyDocument,
  };
}
