import {
  geocodePermanentPropertyAddress,
  hasGeocodableAddress,
  propertyMapAddressKey,
  publicMapCoordinates,
  type PropertyMapAddress,
} from "@/lib/maps/mapbox";
import { createAdminClient } from "@/lib/supabase/admin";

export async function syncOnboardingPropertyMapLocation(
  propertyId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: property, error } = await admin
    .from("properties")
    .select(
      "id,street_address,city,region_code,postal_code,country_code,latitude,longitude,exact_address_public,geocoded_address_key,public_map_latitude,public_map_longitude",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error || !property) {
    throw new Error("The completed onboarding property could not be loaded.");
  }

  const address: PropertyMapAddress = {
    streetAddress: property.street_address,
    city: property.city,
    regionCode: property.region_code,
    postalCode: property.postal_code,
    countryCode: property.country_code || "US",
  };

  if (!hasGeocodableAddress(address)) {
    await admin
      .from("properties")
      .update({
        latitude: null,
        longitude: null,
        public_map_latitude: null,
        public_map_longitude: null,
        geocoded_address_key: null,
        geocoded_at: null,
      })
      .eq("id", propertyId);
    return;
  }

  const addressKey = propertyMapAddressKey(address);
  let latitude = Number(property.latitude);
  let longitude = Number(property.longitude);
  const storedPointMatches =
    property.geocoded_address_key === addressKey &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  let newlyGeocoded = false;

  if (!storedPointMatches) {
    const result = await geocodePermanentPropertyAddress(address);
    latitude = result.latitude;
    longitude = result.longitude;
    newlyGeocoded = true;
  }

  const publicPoint = publicMapCoordinates({
    propertyId,
    latitude,
    longitude,
    exactAddressPublic: Boolean(property.exact_address_public),
  });

  const update: Record<string, string | number | null> = {
    latitude,
    longitude,
    public_map_latitude: publicPoint.latitude,
    public_map_longitude: publicPoint.longitude,
    geocoded_address_key: addressKey,
  };

  if (newlyGeocoded) {
    update.geocoded_at = new Date().toISOString();
  }

  const { error: updateError } = await admin
    .from("properties")
    .update(update)
    .eq("id", propertyId);

  if (updateError) throw updateError;
}
