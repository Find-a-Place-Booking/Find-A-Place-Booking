"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  geocodePermanentPropertyAddress,
  hasGeocodableAddress,
  propertyMapAddressKey,
  publicMapCoordinates,
  type PropertyMapAddress,
} from "@/lib/maps/mapbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SavePropertyPayload = {
  propertyId: string;
  form: Record<string, string>;
  amenities: string[];
  policies: string[];
};

export type SavePropertyResult = {
  ok: boolean;
  message: string;
  slug?: string;
  status?: string;
  savedAt?: string;
};

function compact(value: unknown, max = 10000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizeForm(form: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, compact(value)]),
  );
}

function sanitizeSelection(values: string[], limit = 100) {
  return [
    ...new Set(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
    .slice(0, limit)
    .map((value) => value.slice(0, 160));
}

function revalidateMarketplace(slug?: string | null) {
  revalidatePath("/");
  revalidatePath("/stays");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/stays/${slug}`);
}

async function syncStoredPropertyMapLocation(
  propertyId: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data: property, error } = await admin
    .from("properties")
    .select(
      "id,street_address,city,region_code,postal_code,country_code,latitude,longitude,exact_address_public,geocoded_address_key,public_map_latitude,public_map_longitude",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error || !property) {
    throw new Error("The saved property location could not be loaded.");
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

    return "Property saved. Add a full street address, city and state so this stay can appear on the map.";
  }

  const addressKey = propertyMapAddressKey(address);
  let latitude = Number(property.latitude);
  let longitude = Number(property.longitude);
  const hasStoredExactPoint =
    property.geocoded_address_key === addressKey &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  let newlyGeocoded = false;

  if (!hasStoredExactPoint) {
    try {
      const result = await geocodePermanentPropertyAddress(address);
      latitude = result.latitude;
      longitude = result.longitude;
      newlyGeocoded = true;
    } catch (geocodeError) {
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
      throw geocodeError;
    }
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
  if (newlyGeocoded) update.geocoded_at = new Date().toISOString();

  const { error: updateError } = await admin
    .from("properties")
    .update(update)
    .eq("id", propertyId);

  if (updateError) throw updateError;

  return newlyGeocoded
    ? "Property saved and its map location was updated."
    : "Property saved.";
}

async function requireHostSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

export async function createPropertyFromOnboarding(formData: FormData) {
  const organizationId = compact(formData.get("organizationId"), 100);
  if (!organizationId) {
    redirect("/host/properties?error=missing-organization");
  }

  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc(
    "create_property_from_onboarding",
    { target_organization_id: organizationId },
  );

  if (error) {
    console.error("[createPropertyFromOnboarding] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    redirect(
      `/host/properties?error=${encodeURIComponent(
        error.message || "create-failed",
      )}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.slug) redirect("/host/properties?error=create-failed");

  if (row?.property_id) {
    try {
      await syncStoredPropertyMapLocation(row.property_id);
    } catch (mapError) {
      console.error(
        "[createPropertyFromOnboarding] map geocode failed",
        mapError,
      );
    }
  }

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  redirect(`/host/properties/${row.slug}?created=1`);
}

export async function createBlankProperty(formData: FormData) {
  const organizationId = compact(formData.get("organizationId"), 100);
  const name = compact(formData.get("name"), 180).trim();
  const propertyType = compact(formData.get("propertyType"), 80).trim();
  const publicArea = compact(formData.get("publicArea"), 180).trim();

  if (!organizationId || !name) {
    redirect("/host/properties/new?error=missing-required");
  }

  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc("create_blank_property", {
    target_organization_id: organizationId,
    property_name: name,
    property_type: propertyType || null,
    public_area: publicArea || null,
  });

  if (error) {
    console.error("[createBlankProperty] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    redirect(
      `/host/properties/new?error=${encodeURIComponent(
        error.message || "create-failed",
      )}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.slug) redirect("/host/properties/new?error=create-failed");

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  redirect(`/host/properties/${row.slug}?created=1`);
}

export async function savePropertyListing(
  payload: SavePropertyPayload,
): Promise<SavePropertyResult> {
  if (!payload?.propertyId) {
    return {
      ok: false,
      message: "Property ID is missing. Refresh and try again.",
    };
  }

  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc("save_property_setup", {
    target_property_id: payload.propertyId,
    listing_data: sanitizeForm(payload.form ?? {}),
    selected_amenities: sanitizeSelection(payload.amenities ?? []),
    selected_policies: sanitizeSelection(payload.policies ?? []),
  });

  if (error) {
    console.error("[savePropertyListing] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    const duplicateSlug = error.message?.includes(
      "listing URL is already in use",
    );
    const reservedSlug = error.message?.includes(
      "listing URL is reserved",
    );
    const stateLocked = error.message?.includes(
      "locked while under review",
    );

    return {
      ok: false,
      message: duplicateSlug
        ? "That booking URL is already in use. Choose another."
        : reservedSlug
          ? "That booking URL is reserved. Choose another."
          : stateLocked
            ? "This listing is temporarily locked in its current lifecycle state."
            : error.message?.includes("Published listings must remain booking-ready")
              ? error.message
              : "We couldn't save this property. Your changes are still on screen; try again before leaving.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  let mapMessage = "Property saved.";

  if (row?.property_id) {
    try {
      mapMessage = await syncStoredPropertyMapLocation(row.property_id);
    } catch (mapError) {
      console.error("[savePropertyListing] map geocode failed", mapError);
      mapMessage =
        "Property saved, but the address could not be placed on the map. Check the address and save again.";
    }
  }

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath(
    `/host/properties/${row?.slug ?? payload.form.slug ?? ""}`,
  );
  revalidatePath("/admin");
  revalidatePath("/admin/properties");

  if (row?.property_id) {
    revalidatePath(`/admin/properties/${row.property_id}`);
  }

  if (row?.status === "PUBLISHED") {
    revalidateMarketplace(row?.slug ?? payload.form.slug ?? null);
    mapMessage =
      mapMessage === "Property saved."
        ? "Live property updated."
        : mapMessage.replace(/^Property saved/, "Live property updated");
  }

  return {
    ok: true,
    message: mapMessage,
    slug: row?.slug,
    status: row?.status,
    savedAt: row?.saved_at,
  };
}

export async function publishPropertyListing(formData: FormData) {
  const propertyId = compact(formData.get("propertyId"), 100);
  const slug = compact(formData.get("slug"), 120);

  if (!propertyId || !slug) {
    redirect("/host/properties?error=missing-property");
  }

  const allowMissingCancellation =
    compact(formData.get("allowMissingCancellation"), 10) === "true";

  const supabase = await requireHostSession();
  const { data, error } = await supabase.rpc(
    "host_publish_property_acknowledged",
    {
      target_property_id: propertyId,
      allow_missing_cancellation: allowMissingCancellation,
    },
  );

  if (error) {
    console.error("[publishPropertyListing] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    const message =
      error.message?.replace(
        /^Property is not ready to publish:\s*/i,
        "Finish these items before publishing: ",
      ) ||
      "The property could not be published.";

    redirect(
      `/host/properties/${encodeURIComponent(
        slug,
      )}?publish_error=${encodeURIComponent(message)}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const publicSlug = row?.slug || slug;

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${publicSlug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidateMarketplace(publicSlug);

  redirect(
    `/host/properties/${encodeURIComponent(publicSlug)}?published=1`,
  );
}


export async function setPropertyMarketplaceVisibility(
  formData: FormData,
) {
  const propertyId = compact(formData.get("propertyId"), 100);
  const slug = compact(formData.get("slug"), 120);
  const intent = compact(formData.get("intent"), 20).toUpperCase();
  const returnTo = compact(formData.get("returnTo"), 20);

  const listDestination = "/host/properties";
  const detailDestination = slug
    ? `/host/properties/${encodeURIComponent(slug)}`
    : listDestination;
  const destination =
    returnTo === "detail" ? detailDestination : listDestination;

  if (
    !propertyId ||
    !slug ||
    !["ENABLE", "DISABLE"].includes(intent)
  ) {
    redirect(
      `${destination}?marketplace_error=${encodeURIComponent(
        "The marketplace action was incomplete. Refresh and try again.",
      )}`,
    );
  }

  const allowMissingCancellation =
    compact(formData.get("allowMissingCancellation"), 10) === "true";

  const supabase = await requireHostSession();

  const { data, error } =
    intent === "DISABLE"
      ? await supabase.rpc("host_pause_property", {
          target_property_id: propertyId,
        })
      : await supabase.rpc("host_publish_property_acknowledged", {
          target_property_id: propertyId,
          allow_missing_cancellation: allowMissingCancellation,
        });

  if (error) {
    console.error("[setPropertyMarketplaceVisibility] RPC failed", {
      intent,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    const message =
      intent === "ENABLE"
        ? error.message?.replace(
            /^Property is not ready to publish:\s*/i,
            "Finish these items before enabling the listing: ",
          ) || "The listing could not be enabled."
        : error.message || "The listing could not be disabled.";

    redirect(
      `${destination}?marketplace_error=${encodeURIComponent(message)}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  const publicSlug = row?.slug || slug;

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath(`/host/properties/${publicSlug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidateMarketplace(publicSlug);

  const result = intent === "DISABLE" ? "disabled" : "enabled";

  redirect(
    returnTo === "detail"
      ? `/host/properties/${encodeURIComponent(
          publicSlug,
        )}?marketplace=${result}`
      : `/host/properties?marketplace=${result}`,
  );
}


export async function archiveProperty(formData: FormData) {
  const propertyId = compact(formData.get("propertyId"), 100);
  if (!propertyId) {
    redirect("/host/properties?error=missing-property");
  }

  const supabase = await requireHostSession();
  const { error } = await supabase.rpc("archive_property", {
    target_property_id: propertyId,
  });

  if (error) {
    console.error("[archiveProperty] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    redirect(
      `/host/properties?error=${encodeURIComponent(
        error.message || "archive-failed",
      )}`,
    );
  }

  revalidatePath("/host");
  revalidatePath("/host/properties");
  revalidatePath("/admin");
  revalidatePath("/admin/properties");
  revalidateMarketplace();
  redirect("/host/properties?archived=1");
}
