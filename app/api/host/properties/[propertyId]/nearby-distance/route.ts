import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectionsResponse = {
  routes?: Array<{
    distance?: number;
    duration?: number;
  }>;
  message?: string;
};

function coordinate(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const { propertyId } = await params;
  const body = (await request.json().catch(() => null)) as
    | { lat?: unknown; lng?: unknown }
    | null;
  const destinationLat = coordinate(body?.lat, -90, 90);
  const destinationLng = coordinate(body?.lng, -180, 180);

  if (!propertyId || destinationLat == null || destinationLng == null) {
    return NextResponse.json({ error: "The selected place location is invalid." }, { status: 400 });
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

  const originLat = coordinate(property?.latitude, -90, 90);
  const originLng = coordinate(property?.longitude, -180, 180);
  if (propertyError || originLat == null || originLng == null) {
    return NextResponse.json(
      { error: "Save the property's full address before calculating driving distance." },
      { status: 400 },
    );
  }

  const token =
    process.env.MAPBOX_GEOCODING_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    "";
  if (!token) {
    return NextResponse.json({ error: "Mapbox routing is not configured." }, { status: 503 });
  }

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destinationLng},${destinationLat}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => ({}))) as DirectionsResponse;
  const route = payload.routes?.[0];

  if (!response.ok || !route || typeof route.distance !== "number") {
    console.error("[nearby experience distance] Mapbox directions failed", {
      propertyId,
      status: response.status,
      message: payload.message,
    });
    return NextResponse.json(
      { error: payload.message || "Mapbox could not calculate a driving route." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
    driveMinutes:
      typeof route.duration === "number"
        ? Math.max(1, Math.round(route.duration / 60))
        : null,
  });
}
