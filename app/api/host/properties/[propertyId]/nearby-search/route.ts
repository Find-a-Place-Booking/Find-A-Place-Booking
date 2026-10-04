import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown[];
  };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    poi_category?: string[];
  };
};

type SearchResponse = {
  features?: SearchFeature[];
  message?: string;
};

function numberCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function haversineMiles(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRadians(destinationLat - originLat);
  const dLng = toRadians(destinationLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(destinationLat)) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";

  if (!propertyId || q.length < 2 || q.length > 180) {
    return NextResponse.json(
      { error: "Enter at least two characters to search nearby places." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: allowed, error: accessError } = await supabase.rpc(
    "can_manage_property",
    { target_property_id: propertyId },
  );

  if (accessError || !allowed) {
    return NextResponse.json({ error: "Property access denied." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("latitude,longitude")
    .eq("id", propertyId)
    .maybeSingle();

  const latitude = numberCoordinate(property?.latitude);
  const longitude = numberCoordinate(property?.longitude);

  if (propertyError || latitude == null || longitude == null) {
    return NextResponse.json(
      {
        error:
          "Save the property's full street address first so Find A Place can calculate nearby distances.",
      },
      { status: 400 },
    );
  }

  const token =
    process.env.MAPBOX_GEOCODING_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    "";

  if (!token) {
    return NextResponse.json(
      { error: "Mapbox search is not configured." },
      { status: 503 },
    );
  }

  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward");
  url.searchParams.set("q", q);
  url.searchParams.set("access_token", token);
  url.searchParams.set("proximity", `${longitude},${latitude}`);
  url.searchParams.set("country", "US");
  url.searchParams.set("language", "en");
  url.searchParams.set("types", "poi,category,place,address");
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as SearchResponse;

  if (!response.ok) {
    console.error("[nearby experience search] Mapbox search failed", {
      propertyId,
      status: response.status,
      message: payload.message,
    });
    return NextResponse.json(
      { error: payload.message || "Mapbox could not search nearby places." },
      { status: 502 },
    );
  }

  const results = (payload.features ?? []).flatMap((feature, index) => {
    if (feature.geometry?.type !== "Point") return [];
    const lng = numberCoordinate(feature.geometry.coordinates?.[0]);
    const lat = numberCoordinate(feature.geometry.coordinates?.[1]);
    if (lat == null || lng == null) return [];

    const properties = feature.properties ?? {};
    const label = properties.name?.trim() || q;
    const secondary =
      properties.full_address?.trim() ||
      properties.place_formatted?.trim() ||
      "";
    const straightLineMiles = haversineMiles(latitude, longitude, lat, lng);

    return [
      {
        key: `${index}:${lng.toFixed(6)},${lat.toFixed(6)}`,
        label,
        secondary,
        category:
          properties.poi_category?.[0] || properties.feature_type || "Place",
        approximateMiles: Math.round(straightLineMiles * 10) / 10,
        // Coordinates are returned only for the current host search session so
        // the Directions endpoint can calculate a route. They are never stored.
        lat,
        lng,
      },
    ];
  });

  return NextResponse.json({ results });
}
