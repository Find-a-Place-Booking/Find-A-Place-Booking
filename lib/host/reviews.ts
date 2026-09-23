import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type HostReviewRecord = {
  id: string;
  reservationId: string;
  propertyId: string;
  unitId: string;
  propertyName: string;
  slug: string;
  guestName: string;
  rating: number;
  body: string;
  status: string;
  hostResponse: string | null;
  createdAt: string;
  hostRespondedAt: string | null;
};

export async function getHostReviews(): Promise<HostReviewRecord[]> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) redirect("/host/sign-in");

  const { data: memberships, error: membershipError } =
    await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", profileId)
      .eq("status", "ACTIVE")
      .in("role", ["OWNER", "MANAGER"]);

  if (membershipError) {
    throw new Error("Unable to load host organizations.");
  }

  const organizationIds = (memberships ?? []).map(
    (row) => row.organization_id as string,
  );

  if (!organizationIds.length) return [];

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("id,name")
    .in("organization_id", organizationIds)
    .neq("status", "ARCHIVED");

  if (propertyError) {
    throw new Error("Unable to load review properties.");
  }

  const propertyIds = (properties ?? []).map(
    (property) => property.id as string,
  );

  if (!propertyIds.length) return [];

  const { data: units, error: unitError } = await supabase
    .from("property_units")
    .select("id,property_id,slug")
    .in("property_id", propertyIds)
    .eq("is_primary", true);

  if (unitError) {
    throw new Error("Unable to load review listings.");
  }

  const { data: reviews, error: reviewError } = await supabase
    .from("reservation_reviews")
    .select(
      "id,reservation_id,property_id,unit_id,guest_name_snapshot,rating,body,status,host_response,created_at,host_responded_at",
    )
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false });

  if (reviewError) {
    throw new Error("Unable to load guest reviews.");
  }

  const propertyById = new Map(
    (properties ?? []).map((property) => [
      property.id as string,
      property.name as string,
    ]),
  );
  const unitByProperty = new Map(
    (units ?? []).map((unit) => [
      unit.property_id as string,
      {
        id: unit.id as string,
        slug: unit.slug as string,
      },
    ]),
  );

  return (reviews ?? []).flatMap((review) => {
    const unit = unitByProperty.get(review.property_id as string);
    if (!unit) return [];

    return [
      {
        id: review.id as string,
        reservationId: review.reservation_id as string,
        propertyId: review.property_id as string,
        unitId: review.unit_id as string,
        propertyName:
          propertyById.get(review.property_id as string) ||
          "Property",
        slug: unit.slug,
        guestName:
          (review.guest_name_snapshot as string | null) ||
          "Verified guest",
        rating: Number(review.rating || 0),
        body: (review.body as string | null) || "",
        status: review.status as string,
        hostResponse:
          (review.host_response as string | null) || null,
        createdAt: review.created_at as string,
        hostRespondedAt:
          (review.host_responded_at as string | null) || null,
      } satisfies HostReviewRecord,
    ];
  });
}
