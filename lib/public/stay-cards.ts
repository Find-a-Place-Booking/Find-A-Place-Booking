import type { NearbyExperiencePreview, Property } from "@/data/catalog";
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

type PublicNearbyPreviewRow = {
  property_id: string;
  title: string;
  category: string;
  distance_miles: number | string | null;
  drive_minutes: number | null;
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

async function buildCards(rows: PublicIndexRow[]): Promise<Property[]> {
  if (!rows.length) return [];

  const supabase = await createClient();
  const admin = createAdminClient();
  const propertyIds = rows.map((row) => row.property_id);

  const coverPaths = rows.map((row) => row.image_paths?.[0] ?? null);

  const [signedCovers, reviewResult, nearbyResult] = await Promise.all([
    createSignedUrlMap(
      supabase,
      "property-images",
      coverPaths,
      3600,
    ),
    admin
      .from("reservation_reviews")
      .select("property_id,rating")
      .in("property_id", propertyIds)
      .eq("status", "PUBLISHED"),
    admin
      .from("property_nearby_experiences")
      .select(
        "property_id,title,category,distance_miles,drive_minutes,sort_order,created_at",
      )
      .in("property_id", propertyIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const reviewStats = new Map<
    string,
    { total: number; count: number }
  >();

  for (const review of reviewResult.data ?? []) {
    const propertyId = review.property_id as string;
    const current = reviewStats.get(propertyId) ?? {
      total: 0,
      count: 0,
    };
    current.total += Number(review.rating || 0);
    current.count += 1;
    reviewStats.set(propertyId, current);
  }

  const nearbyByProperty = new Map<
    string,
    { count: number; items: NearbyExperiencePreview[] }
  >();

  for (const row of (nearbyResult.data ?? []) as PublicNearbyPreviewRow[]) {
    const current = nearbyByProperty.get(row.property_id) ?? {
      count: 0,
      items: [],
    };

    current.count += 1;

    if (current.items.length < 3) {
      const miles = Number(row.distance_miles);
      current.items.push({
        title: row.title,
        category: row.category,
        distanceMiles: Number.isFinite(miles) ? miles : null,
        driveMinutes:
          typeof row.drive_minutes === "number" && row.drive_minutes >= 0
            ? row.drive_minutes
            : null,
      });
    }

    nearbyByProperty.set(row.property_id, current);
  }

  return rows.map((row): Property => {
    const coverPath = row.image_paths?.[0] ?? null;
    const reviews = reviewStats.get(row.property_id);
    const nearby = nearbyByProperty.get(row.property_id);

    return {
      slug: row.slug,
      name: row.name,
      location:
        row.public_area ||
        [row.city, row.region_code].filter(Boolean).join(", ") ||
        "Regional stay",
      city: row.city ?? "",
      state: row.region_code ?? "",
      region: regionName(row.region_code),
      type: row.property_type || "Stay",
      sleeps: row.max_guests ?? 1,
      bedrooms: row.bedrooms ?? 0,
      baths: Number(row.bathrooms ?? 0),
      price: Math.round((row.weeknight_cents ?? 0) / 100),
      rating: reviews?.count
        ? Math.round((reviews.total / reviews.count) * 10) / 10
        : 0,
      reviews: reviews?.count ?? 0,
      image: coverPath ? signedCovers.get(coverPath) ?? "" : "",
      image2: "",
      image3: "",
      tags: row.amenity_labels ?? [],
      blurb:
        row.description ||
        "Independent stay listed with Find A Place Booking.",
      hostName: row.host_name || "Find A Place host",
      instantBook: false,
      lat: 0,
      lng: 0,
      nearbyExperienceCount: nearby?.count ?? 0,
      nearbyExperiences: nearby?.items ?? [],
    };
  });
}

async function publicIndexRows() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_listing_index");

  if (error) {
    console.error("[stay cards] public listing index unavailable", {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []) as PublicIndexRow[];
}

export async function getPublishedStayCardsBySlugs(
  requestedSlugs: string[],
): Promise<Property[]> {
  const slugs = [
    ...new Set(requestedSlugs.map((slug) => slug.trim()).filter(Boolean)),
  ];
  if (!slugs.length) return [];

  const wanted = new Set(slugs);
  const rows = (await publicIndexRows()).filter((row) =>
    wanted.has(row.slug),
  );
  const cards = await buildCards(rows);
  const bySlug = new Map(cards.map((property) => [property.slug, property]));

  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((property): property is Property => Boolean(property));
}

export async function getPublishedStayCardsByPropertyIds(
  requestedPropertyIds: string[],
): Promise<Property[]> {
  const propertyIds = [
    ...new Set(
      requestedPropertyIds.map((id) => id.trim()).filter(Boolean),
    ),
  ];
  if (!propertyIds.length) return [];

  const wanted = new Set(propertyIds);
  const rows = (await publicIndexRows()).filter((row) =>
    wanted.has(row.property_id),
  );

  const cards = await buildCards(rows);
  const byPropertyId = new Map(
    rows.map((row) => [row.property_id, row.slug]),
  );
  const bySlug = new Map(cards.map((property) => [property.slug, property]));

  return propertyIds
    .map((propertyId) => byPropertyId.get(propertyId))
    .map((slug) => (slug ? bySlug.get(slug) : undefined))
    .filter((property): property is Property => Boolean(property));
}
