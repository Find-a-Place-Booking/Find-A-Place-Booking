import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedUrlMap } from "@/lib/storage/signed-urls";

export type PublicHostProfile = {
  organizationId: string;
  publicSlug: string | null;
  name: string;
  contactName: string | null;
  businessLocation: string | null;
  publicBio: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  avatarUrl: string | null;
};

export type PublicHostStay = {
  propertyId: string;
  slug: string;
  name: string;
  description: string;
  location: string;
  type: string;
  sleeps: number;
  bedrooms: number;
  baths: number;
  price: number;
  image: string | null;
  rating: number;
  reviewCount: number;
};

export type PublicHostReview = {
  id: string;
  propertyId: string;
  propertyName: string;
  propertySlug: string;
  guestName: string;
  rating: number;
  body: string | null;
  hostResponse: string | null;
  createdAt: string;
};

export type PublicHostPage = {
  organizationId: string;
  slug: string;
  name: string;
  publicBio: string | null;
  avatarUrl: string | null;
  stays: PublicHostStay[];
  reviews: PublicHostReview[];
  rating: number;
  reviewCount: number;
};

async function avatarForOrganization(organizationId: string) {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("organization_members")
    .select("profile_id,role")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"])
    .limit(10);

  const member =
    (members ?? []).find((row) => row.role === "OWNER") ??
    members?.[0] ??
    null;

  if (!member?.profile_id) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("avatar_storage_path")
    .eq("id", member.profile_id)
    .maybeSingle();

  if (!profile?.avatar_storage_path) return null;

  const { data: signed } = await admin.storage
    .from("host-avatars")
    .createSignedUrl(profile.avatar_storage_path, 3600);

  return signed?.signedUrl ?? null;
}

export async function getPublicHostProfileForOrganization(
  organizationId: string,
): Promise<PublicHostProfile | null> {
  const admin = createAdminClient();

  const { data: organization } = await admin
    .from("organizations")
    .select(
      "id,name,public_host_slug,public_host_name,primary_contact_name,business_location,contact_email,contact_phone,public_host_bio",
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) return null;

  return {
    organizationId: organization.id,
    publicSlug: organization.public_host_slug ?? null,
    name: organization.public_host_name?.trim() || organization.name,
    contactName: organization.primary_contact_name ?? null,
    businessLocation: organization.business_location ?? null,
    publicBio: organization.public_host_bio ?? null,
    contactEmail: organization.contact_email ?? null,
    contactPhone: organization.contact_phone ?? null,
    avatarUrl: await avatarForOrganization(organizationId),
  };
}

export async function getPublicHostProfileForProperty(
  propertyId: string,
): Promise<PublicHostProfile | null> {
  const admin = createAdminClient();
  const { data: property } = await admin
    .from("properties")
    .select("organization_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property?.organization_id) return null;
  return getPublicHostProfileForOrganization(property.organization_id);
}

export async function getPublicHostPageBySlug(
  requestedSlug: string,
): Promise<PublicHostPage | null> {
  const slug = requestedSlug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;

  const admin = createAdminClient();

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id,name,public_host_slug,public_host_name,public_host_bio")
    .eq("public_host_slug", slug)
    .maybeSingle();

  if (organizationError || !organization?.public_host_slug) return null;

  const { data: propertyRows, error: propertyError } = await admin
    .from("properties")
    .select(
      "id,name,description,property_type,public_area,city,region_code,published_at,created_at",
    )
    .eq("organization_id", organization.id)
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (propertyError || !propertyRows?.length) return null;

  const propertyIds = propertyRows.map((property) => property.id);

  const { data: units, error: unitError } = await admin
    .from("property_units")
    .select(
      "id,property_id,slug,max_guests,bedrooms,bathrooms,is_primary,is_active",
    )
    .in("property_id", propertyIds)
    .eq("is_primary", true)
    .eq("is_active", true);

  if (unitError || !units?.length) return null;

  const unitIds = units.map((unit) => unit.id);

  const [rateResult, imageResult, reviewResult, avatarUrl] = await Promise.all([
    admin
      .from("unit_rate_settings")
      .select("unit_id,weeknight_cents")
      .in("unit_id", unitIds),
    admin
      .from("property_images")
      .select("unit_id,storage_path,sort_order,created_at")
      .in("unit_id", unitIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("reservation_reviews")
      .select(
        "id,property_id,rating,body,guest_name_snapshot,host_response,created_at",
      )
      .in("property_id", propertyIds)
      .eq("status", "PUBLISHED")
      .order("created_at", { ascending: false })
      .limit(100),
    avatarForOrganization(organization.id),
  ]);

  const unitByProperty = new Map(
    (units ?? []).map((unit) => [unit.property_id as string, unit]),
  );

  const rateByUnit = new Map(
    (rateResult.data ?? []).map((rate) => [
      rate.unit_id as string,
      Number(rate.weeknight_cents || 0),
    ]),
  );

  const coverPathByUnit = new Map<string, string>();
  for (const image of imageResult.data ?? []) {
    if (!coverPathByUnit.has(image.unit_id as string)) {
      coverPathByUnit.set(
        image.unit_id as string,
        image.storage_path as string,
      );
    }
  }

  const signedCovers = await createSignedUrlMap(
    admin,
    "property-images",
    [...coverPathByUnit.values()],
    3600,
  );

  const propertyById = new Map(
    propertyRows.map((property) => [property.id as string, property]),
  );

  const reviewsByProperty = new Map<
    string,
    { total: number; count: number }
  >();

  const publicReviews: PublicHostReview[] = [];

  for (const review of reviewResult.data ?? []) {
    const property = propertyById.get(review.property_id as string);
    const unit = unitByProperty.get(review.property_id as string);
    if (!property || !unit?.slug) continue;

    const current = reviewsByProperty.get(review.property_id as string) ?? {
      total: 0,
      count: 0,
    };
    current.total += Number(review.rating || 0);
    current.count += 1;
    reviewsByProperty.set(review.property_id as string, current);

    publicReviews.push({
      id: review.id as string,
      propertyId: review.property_id as string,
      propertyName: property.name as string,
      propertySlug: unit.slug as string,
      guestName:
        (review.guest_name_snapshot as string | null) || "Verified guest",
      rating: Number(review.rating || 0),
      body: (review.body as string | null) || null,
      hostResponse: (review.host_response as string | null) || null,
      createdAt: review.created_at as string,
    });
  }

  const stays: PublicHostStay[] = propertyRows.flatMap((property) => {
    const unit = unitByProperty.get(property.id as string);
    if (!unit?.slug) return [];

    const stats = reviewsByProperty.get(property.id as string);
    const coverPath = coverPathByUnit.get(unit.id as string);
    const location =
      (property.public_area as string | null) ||
      [property.city, property.region_code].filter(Boolean).join(", ") ||
      "Regional stay";

    return [
      {
        propertyId: property.id as string,
        slug: unit.slug as string,
        name: property.name as string,
        description:
          (property.description as string | null) ||
          "Independent stay listed with Find A Place Booking.",
        location,
        type: (property.property_type as string | null) || "Stay",
        sleeps: Number(unit.max_guests || 1),
        bedrooms: Number(unit.bedrooms || 0),
        baths: Number(unit.bathrooms || 0),
        price: Math.round(
          Number(rateByUnit.get(unit.id as string) || 0) / 100,
        ),
        image: coverPath
          ? signedCovers.get(coverPath) ?? null
          : null,
        rating:
          stats?.count
            ? Math.round((stats.total / stats.count) * 10) / 10
            : 0,
        reviewCount: stats?.count ?? 0,
      } satisfies PublicHostStay,
    ];
  });

  if (!stays.length) return null;

  const reviewTotal = publicReviews.reduce(
    (sum, review) => sum + review.rating,
    0,
  );

  return {
    organizationId: organization.id as string,
    slug: organization.public_host_slug as string,
    name:
      (organization.public_host_name as string | null)?.trim() ||
      (organization.name as string),
    publicBio:
      (organization.public_host_bio as string | null)?.trim() || null,
    avatarUrl,
    stays,
    reviews: publicReviews,
    rating:
      publicReviews.length
        ? Math.round((reviewTotal / publicReviews.length) * 10) / 10
        : 0,
    reviewCount: publicReviews.length,
  };
}

export type PublicHostDirectoryEntry = {
  organizationId: string;
  slug: string;
  name: string;
  publicBio: string | null;
  avatarUrl: string | null;
  stayCount: number;
  rating: number;
  reviewCount: number;
};

export async function getPublicHostDirectory(): Promise<
  PublicHostDirectoryEntry[]
> {
  const admin = createAdminClient();

  const { data: publishedProperties, error: propertyError } = await admin
    .from("properties")
    .select("id,organization_id")
    .eq("status", "PUBLISHED");

  if (propertyError || !publishedProperties?.length) return [];

  const propertyIds = publishedProperties.map((property) => property.id as string);
  const organizationIds = [
    ...new Set(
      publishedProperties.map(
        (property) => property.organization_id as string,
      ),
    ),
  ];

  const [{ data: organizations }, { data: reviews }] = await Promise.all([
    admin
      .from("organizations")
      .select("id,name,public_host_slug,public_host_name,public_host_bio")
      .in("id", organizationIds)
      .not("public_host_slug", "is", null),
    admin
      .from("reservation_reviews")
      .select("property_id,rating")
      .in("property_id", propertyIds)
      .eq("status", "PUBLISHED"),
  ]);

  const propertyIdsByOrganization = new Map<string, string[]>();
  for (const property of publishedProperties) {
    const organizationId = property.organization_id as string;
    const current = propertyIdsByOrganization.get(organizationId) ?? [];
    current.push(property.id as string);
    propertyIdsByOrganization.set(organizationId, current);
  }

  const organizationByProperty = new Map<string, string>();
  for (const property of publishedProperties) {
    organizationByProperty.set(
      property.id as string,
      property.organization_id as string,
    );
  }

  const reviewStats = new Map<
    string,
    { total: number; count: number }
  >();

  for (const review of reviews ?? []) {
    const organizationId = organizationByProperty.get(
      review.property_id as string,
    );
    if (!organizationId) continue;

    const current = reviewStats.get(organizationId) ?? {
      total: 0,
      count: 0,
    };
    current.total += Number(review.rating || 0);
    current.count += 1;
    reviewStats.set(organizationId, current);
  }

  const entries = await Promise.all(
    (organizations ?? []).flatMap(async (organization) => {
      const slug = (organization.public_host_slug as string | null)?.trim();
      if (!slug) return [];

      const stats = reviewStats.get(organization.id as string);
      const avatarUrl = await avatarForOrganization(
        organization.id as string,
      );

      return [
        {
          organizationId: organization.id as string,
          slug,
          name:
            (organization.public_host_name as string | null)?.trim() ||
            (organization.name as string),
          publicBio:
            (organization.public_host_bio as string | null)?.trim() || null,
          avatarUrl,
          stayCount:
            propertyIdsByOrganization.get(organization.id as string)?.length ??
            0,
          rating:
            stats?.count
              ? Math.round((stats.total / stats.count) * 10) / 10
              : 0,
          reviewCount: stats?.count ?? 0,
        } satisfies PublicHostDirectoryEntry,
      ];
    }),
  );

  return entries
    .flat()
    .filter((entry) => entry.stayCount > 0)
    .sort((a, b) => {
      if (b.reviewCount !== a.reviewCount) {
        return b.reviewCount - a.reviewCount;
      }
      if (b.stayCount !== a.stayCount) {
        return b.stayCount - a.stayCount;
      }
      return a.name.localeCompare(b.name);
    });
}

