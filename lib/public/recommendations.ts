import type { Property } from "@/data/catalog";
import { getPublishedStayCardsByPropertyIds } from "@/lib/public/stay-cards";
import { createAdminClient } from "@/lib/supabase/admin";

type RecommendationInput = {
  propertyId: string;
  slug: string;
  city: string;
  state: string;
  type: string;
  location: string;
  price: number;
};

export type StayRecommendationGroups = {
  sameHost: Property[];
  nearby: Property[];
};

type CandidateRow = {
  id: string;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  property_type: string | null;
};

type MapCoordinateRow = {
  property_id: string;
  map_latitude: number | string | null;
  map_longitude: number | string | null;
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function candidateLocation(row: CandidateRow) {
  return (
    row.public_area ||
    [row.city, row.region_code].filter(Boolean).join(", ")
  );
}

function milesBetween(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = radians(right.lat - left.lat);
  const dLng = radians(right.lng - left.lng);
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) ** 2;

  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

function nearbyScore(row: CandidateRow, current: RecommendationInput) {
  let score = 0;

  if (
    current.city &&
    row.city &&
    normalize(row.city) === normalize(current.city)
  ) {
    score += 10;
  }

  if (
    current.location &&
    candidateLocation(row) &&
    normalize(candidateLocation(row)) === normalize(current.location)
  ) {
    score += 8;
  }

  if (
    current.type &&
    row.property_type &&
    normalize(row.property_type) === normalize(current.type)
  ) {
    score += 4;
  }

  return score;
}

export async function getStayRecommendations(
  current: RecommendationInput,
): Promise<StayRecommendationGroups> {
  const admin = createAdminClient();

  const { data: sourceProperty } = await admin
    .from("properties")
    .select("organization_id")
    .eq("id", current.propertyId)
    .maybeSingle();

  const organizationId =
    (sourceProperty?.organization_id as string | null) || null;

  let sameHostIds: string[] = [];
  let allSameHostIds: string[] = [];

  if (organizationId) {
    const { data: sameHostRows } = await admin
      .from("properties")
      .select("id,public_area,city,region_code,property_type")
      .eq("organization_id", organizationId)
      .eq("status", "PUBLISHED")
      .neq("id", current.propertyId)
      .limit(100);

    const rankedSameHost = ((sameHostRows ?? []) as CandidateRow[])
      .map((property) => ({
        id: property.id,
        score: nearbyScore(property, current),
      }))
      .sort((a, b) => b.score - a.score);

    allSameHostIds = rankedSameHost.map((property) => property.id);
    sameHostIds = allSameHostIds.slice(0, 3);
  }

  let nearbyQuery = admin
    .from("properties")
    .select("id,public_area,city,region_code,property_type")
    .eq("status", "PUBLISHED")
    .neq("id", current.propertyId);

  if (current.state) {
    nearbyQuery = nearbyQuery.eq(
      "region_code",
      current.state.toUpperCase(),
    );
  }

  const [{ data: nearbyRows }, { data: coordinateRows }] =
    await Promise.all([
      nearbyQuery.limit(60),
      admin.rpc("public_listing_map_coordinates"),
    ]);

  const sameHostIdSet = new Set(allSameHostIds);

  const coordinates = new Map<
    string,
    { lat: number; lng: number }
  >();

  for (const row of (coordinateRows ?? []) as MapCoordinateRow[]) {
    const lat = Number(row.map_latitude);
    const lng = Number(row.map_longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      coordinates.set(row.property_id, { lat, lng });
    }
  }

  const currentCoordinates = coordinates.get(current.propertyId);

  const nearbyIds = ((nearbyRows ?? []) as CandidateRow[])
    .filter((row) => !sameHostIdSet.has(row.id))
    .map((row) => {
      const sameCity =
        Boolean(current.city && row.city) &&
        normalize(row.city) === normalize(current.city);
      const samePublicArea =
        Boolean(current.location && candidateLocation(row)) &&
        normalize(candidateLocation(row)) === normalize(current.location);

      const candidateCoordinates = coordinates.get(row.id);
      const distanceMiles =
        currentCoordinates && candidateCoordinates
          ? milesBetween(currentCoordinates, candidateCoordinates)
          : null;

      const geographicallyRelevant =
        typeof distanceMiles === "number"
          ? distanceMiles <= 75
          : sameCity || samePublicArea;

      const distanceScore =
        typeof distanceMiles === "number"
          ? Math.max(0, 12 - distanceMiles / 7.5)
          : 0;

      return {
        id: row.id,
        geographicallyRelevant,
        score: nearbyScore(row, current) + distanceScore,
      };
    })
    .filter((row) => row.geographicallyRelevant)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.id);

  const [sameHost, nearby] = await Promise.all([
    sameHostIds.length
      ? getPublishedStayCardsByPropertyIds(sameHostIds)
      : Promise.resolve([]),
    nearbyIds.length
      ? getPublishedStayCardsByPropertyIds(nearbyIds)
      : Promise.resolve([]),
  ]);

  return { sameHost, nearby };
}
