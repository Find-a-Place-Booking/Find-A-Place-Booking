import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type HostPropertySummary = {
  id: string;
  organizationId: string;
  name: string;
  propertyType: string | null;
  publicArea: string | null;
  city: string | null;
  state: string | null;
  status: string;
  slug: string;
  unitId: string;
  maxGuests: number | null;
  weeknightCents: number | null;
  imageCount: number;
  coverImageUrl: string | null;
  updatedAt: string;
};

export type PropertyImageRecord = {
  id: string;
  storagePath: string;
  originalName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
  altText: string | null;
  signedUrl: string | null;
};

export type PropertyEditorRecord = {
  propertyId: string;
  organizationId: string;
  unitId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  reviewNote: string | null;
  submissionIssues: string[];
  form: Record<string, string>;
  amenities: string[];
  policies: string[];
  images: PropertyImageRecord[];
  oldSlugs: string[];
};

type ManagedOrganization = {
  id: string;
  name: string;
  status: string;
  contact_email: string | null;
};

type PropertySummaryRow = {
  id: string;
  organization_id: string;
  name: string;
  property_type: string | null;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  status: string;
  updated_at: string;
};

type UnitSummaryRow = {
  id: string;
  property_id: string;
  slug: string;
  max_guests: number | null;
};

type RateSummaryRow = { unit_id: string; weeknight_cents: number | null };
type ImageSummaryRow = { id: string; unit_id: string; storage_path: string; sort_order: number; created_at: string };

type EditableUnitRow = {
  id: string;
  property_id: string;
  name: string;
  slug: string;
  max_guests: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  minimum_stay_nights: number;
  check_in: string | null;
  checkout: string | null;
  cancellation_policy: string | null;
};

async function requireHostProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");
  return { supabase, profileId };
}

export async function getManagedOrganizations(): Promise<ManagedOrganization[]> {
  const { supabase, profileId } = await requireHostProfile();
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"]);

  if (error) throw new Error("Unable to load host organizations.");
  const ids = (data ?? []).map((row: { organization_id: string }) => row.organization_id);
  if (!ids.length) return [];

  const { data: organizations, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name,status,contact_email")
    .in("id", ids)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: true });
  if (organizationError) throw new Error("Unable to load host organizations.");
  return (organizations ?? []) as ManagedOrganization[];
}

export async function getPropertyCreationState() {
  const organizations = await getManagedOrganizations();
  if (!organizations.length) return { organizations, readyDraft: null };
  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);
  const { data: drafts } = await supabase
    .from("host_onboarding_drafts")
    .select("organization_id,status,authority_confirmed,created_property_id,form_data,updated_at")
    .in("organization_id", organizationIds)
    .order("updated_at", { ascending: false });

  const readyDraft = (drafts ?? []).find((draft: { status: string; authority_confirmed: boolean }) => draft.status === "READY_FOR_PROPERTY" && draft.authority_confirmed) ?? null;
  return { organizations, readyDraft };
}

export async function getHostProperties(): Promise<HostPropertySummary[]> {
  const organizations = await getManagedOrganizations();
  if (!organizations.length) return [];
  const supabase = await createClient();
  const organizationIds = organizations.map((organization) => organization.id);
  const { data: propertyData, error } = await supabase
    .from("properties")
    .select("id,organization_id,name,property_type,public_area,city,region_code,status,updated_at")
    .in("organization_id", organizationIds)
    .neq("status", "ARCHIVED")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Unable to load properties.");

  const properties = (propertyData ?? []) as PropertySummaryRow[];
  if (!properties.length) return [];
  const propertyIds = properties.map((property) => property.id);
  const { data: unitData } = await supabase.from("property_units").select("id,property_id,slug,max_guests").in("property_id", propertyIds).eq("is_primary", true);
  const units = (unitData ?? []) as UnitSummaryRow[];
  const unitIds = units.map((unit) => unit.id);

  let rates: RateSummaryRow[] = [];
  let images: ImageSummaryRow[] = [];
  if (unitIds.length) {
    const [{ data: rateData }, { data: imageData }] = await Promise.all([
      supabase.from("unit_rate_settings").select("unit_id,weeknight_cents").in("unit_id", unitIds),
      supabase.from("property_images").select("id,unit_id,storage_path,sort_order,created_at").in("unit_id", unitIds).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    rates = (rateData ?? []) as RateSummaryRow[];
    images = (imageData ?? []) as ImageSummaryRow[];
  }

  const unitByProperty = new Map<string, UnitSummaryRow>(units.map((unit) => [unit.property_id, unit]));
  const rateByUnit = new Map<string, RateSummaryRow>(rates.map((rate) => [rate.unit_id, rate]));
  const imageCountByUnit = new Map<string, number>();
  const firstImageByUnit = new Map<string, ImageSummaryRow>();
  for (const image of images) {
    imageCountByUnit.set(image.unit_id, (imageCountByUnit.get(image.unit_id) ?? 0) + 1);
    if (!firstImageByUnit.has(image.unit_id)) firstImageByUnit.set(image.unit_id, image);
  }

  const coverUrlByUnit = new Map<string, string | null>();
  await Promise.all(unitIds.map(async (unitId) => {
    const image = firstImageByUnit.get(unitId);
    if (!image) {
      coverUrlByUnit.set(unitId, null);
      return;
    }
    const { data: signed } = await supabase.storage.from("property-images").createSignedUrl(image.storage_path, 3600);
    coverUrlByUnit.set(unitId, signed?.signedUrl ?? null);
  }));

  return properties.flatMap((property) => {
    const unit = unitByProperty.get(property.id);
    if (!unit) return [];
    return [{
      id: property.id,
      organizationId: property.organization_id,
      name: property.name,
      propertyType: property.property_type,
      publicArea: property.public_area,
      city: property.city,
      state: property.region_code,
      status: property.status,
      slug: unit.slug,
      unitId: unit.id,
      maxGuests: unit.max_guests,
      weeknightCents: rateByUnit.get(unit.id)?.weeknight_cents ?? null,
      imageCount: imageCountByUnit.get(unit.id) ?? 0,
      coverImageUrl: coverUrlByUnit.get(unit.id) ?? null,
      updatedAt: property.updated_at,
    } satisfies HostPropertySummary];
  });
}

export async function getHostPropertyBySlug(requestedSlug: string): Promise<PropertyEditorRecord | null> {
  const { supabase } = await requireHostProfile();
  const unitSelect = "id,property_id,name,slug,max_guests,bedrooms,beds,bathrooms,minimum_stay_nights,check_in,checkout,cancellation_policy";
  let { data: rawUnit } = await supabase.from("property_units").select(unitSelect).eq("slug", requestedSlug).maybeSingle();
  let unit = rawUnit as EditableUnitRow | null;

  if (!unit) {
    const { data: history } = await supabase.from("listing_slug_history").select("unit_id").eq("slug", requestedSlug).maybeSingle();
    if (history?.unit_id) {
      const { data: currentUnit } = await supabase.from("property_units").select(unitSelect).eq("id", history.unit_id).maybeSingle();
      const typedCurrentUnit = currentUnit as EditableUnitRow | null;
      if (typedCurrentUnit?.slug) redirect(`/host/properties/${typedCurrentUnit.slug}`);
      unit = typedCurrentUnit;
    }
  }
  if (!unit) return null;

  const unitId = unit.id;
  const propertyId = unit.property_id;
  const [propertyResult, amenityResult, policyResult, rateResult, feeResult, imageResult, historyResult] = await Promise.all([
    supabase.from("properties").select("id,organization_id,name,description,property_type,status,public_area,street_address,city,region_code,postal_code,country_code,exact_address_public,notification_email,operations_email,calendar_preference,custom_amenities,custom_policies,submitted_at,reviewed_at,review_note,published_at,created_at,updated_at").eq("id", propertyId).maybeSingle(),
    supabase.from("unit_amenities").select("amenity_code").eq("unit_id", unitId),
    supabase.from("unit_policies").select("policy_code,configuration").eq("unit_id", unitId),
    supabase.from("unit_rate_settings").select("weeknight_cents,weekend_cents,currency").eq("unit_id", unitId).maybeSingle(),
    supabase.from("unit_fees").select("fee_type,amount_cents,calculation").eq("unit_id", unitId),
    supabase.from("property_images").select("id,storage_path,original_name,content_type,size_bytes,sort_order,alt_text").eq("unit_id", unitId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("listing_slug_history").select("slug").eq("unit_id", unitId).order("replaced_at", { ascending: false }),
  ]);

  const property = propertyResult.data;
  if (!property) return null;

  let submissionIssues: string[] = [];
  if (["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(property.status as string)) {
    const { data: issuesData, error: issuesError } = await supabase.rpc("property_submission_issues", { target_property_id: propertyId });
    if (!issuesError && Array.isArray(issuesData)) submissionIssues = issuesData.filter((item): item is string => typeof item === "string");
  }

  const amenityCodes = (amenityResult.data ?? []).map((row: { amenity_code: string }) => row.amenity_code);
  const policyRows = (policyResult.data ?? []) as { policy_code: string; configuration: Record<string, string> | null }[];
  const policyCodes = policyRows.map((row) => row.policy_code);
  let amenityCatalog: { code: string; label: string }[] = [];
  let policyCatalog: { code: string; label: string }[] = [];
  if (amenityCodes.length) {
    const { data } = await supabase.from("amenity_catalog").select("code,label").in("code", amenityCodes);
    amenityCatalog = (data ?? []) as { code: string; label: string }[];
  }
  if (policyCodes.length) {
    const { data } = await supabase.from("policy_catalog").select("code,label").in("code", policyCodes);
    policyCatalog = (data ?? []) as { code: string; label: string }[];
  }

  const amenityLabelByCode = new Map<string, string>(amenityCatalog.map((row) => [row.code, row.label]));
  const policyLabelByCode = new Map<string, string>(policyCatalog.map((row) => [row.code, row.label]));
  const policyConfiguration = new Map<string, Record<string, string>>(policyRows.map((row) => [row.policy_code, row.configuration ?? {}]));
  const fees = (feeResult.data ?? []) as { fee_type: string; amount_cents: number }[];
  const feeByType = new Map<string, { fee_type: string; amount_cents: number }>(fees.map((fee) => [fee.fee_type, fee]));
  const rate = rateResult.data as { weeknight_cents: number | null; weekend_cents: number | null } | null;

  const images: PropertyImageRecord[] = await Promise.all(((imageResult.data ?? []) as {
    id: string; storage_path: string; original_name: string | null; content_type: string | null; size_bytes: number | null; sort_order: number; alt_text: string | null;
  }[]).map(async (image) => {
    const { data: signed } = await supabase.storage.from("property-images").createSignedUrl(image.storage_path, 3600);
    return {
      id: image.id,
      storagePath: image.storage_path,
      originalName: image.original_name,
      contentType: image.content_type,
      sizeBytes: image.size_bytes,
      sortOrder: image.sort_order,
      altText: image.alt_text,
      signedUrl: signed?.signedUrl ?? null,
    };
  }));

  const centsToText = (value: number | null | undefined) => value == null ? "" : (value / 100).toFixed(value % 100 ? 2 : 0);
  const quietConfig = policyConfiguration.get("quiet-hours") ?? {};
  const petConfig = policyConfiguration.get("pets-allowed") ?? {};
  const ageConfig = policyConfiguration.get("minimum-booking-age") ?? {};

  return {
    propertyId,
    organizationId: property.organization_id as string,
    unitId,
    status: property.status as string,
    createdAt: property.created_at as string,
    updatedAt: property.updated_at as string,
    submittedAt: (property.submitted_at ?? null) as string | null,
    reviewedAt: (property.reviewed_at ?? null) as string | null,
    publishedAt: (property.published_at ?? null) as string | null,
    reviewNote: (property.review_note ?? null) as string | null,
    submissionIssues,
    form: {
      name: property.name as string,
      description: (property.description ?? "") as string,
      propertyType: (property.property_type ?? "") as string,
      publicArea: (property.public_area ?? "") as string,
      street: (property.street_address ?? "") as string,
      city: (property.city ?? "") as string,
      state: (property.region_code ?? "") as string,
      postal: (property.postal_code ?? "") as string,
      exactAddressPublic: property.exact_address_public ? "true" : "false",
      notificationEmail: (property.notification_email ?? "") as string,
      operationsEmail: (property.operations_email ?? "") as string,
      calendarPreference: (property.calendar_preference ?? "UNSET") as string,
      customAmenities: (property.custom_amenities ?? "") as string,
      customPolicies: (property.custom_policies ?? "") as string,
      slug: unit.slug,
      maxGuests: unit.max_guests?.toString() ?? "",
      bedrooms: unit.bedrooms?.toString() ?? "",
      beds: unit.beds?.toString() ?? "",
      bathrooms: unit.bathrooms?.toString() ?? "",
      minStay: unit.minimum_stay_nights?.toString() ?? "1",
      checkIn: typeof unit.check_in === "string" ? unit.check_in.slice(0, 5) : "",
      checkout: typeof unit.checkout === "string" ? unit.checkout.slice(0, 5) : "",
      cancellation: unit.cancellation_policy ?? "",
      weeknight: centsToText(rate?.weeknight_cents),
      weekend: centsToText(rate?.weekend_cents),
      cleaning: centsToText(feeByType.get("CLEANING")?.amount_cents),
      pet: centsToText(feeByType.get("PET")?.amount_cents),
      extraGuest: centsToText(feeByType.get("EXTRA_GUEST")?.amount_cents),
      quietStart: quietConfig.start ?? "22:00",
      quietEnd: quietConfig.end ?? "07:00",
      maxPets: petConfig.max_pets ?? "",
      minimumAge: ageConfig.minimum_age ?? "",
    },
    amenities: amenityCodes.map((code) => amenityLabelByCode.get(code)).filter((label): label is string => Boolean(label)),
    policies: policyCodes.map((code) => policyLabelByCode.get(code)).filter((label): label is string => Boolean(label)),
    images,
    oldSlugs: ((historyResult.data ?? []) as { slug: string }[]).map((row) => row.slug),
  };
}
