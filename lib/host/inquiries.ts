import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type HostProfileInquiry = {
  id: string;
  organizationId: string;
  propertyId: string | null;
  propertyName: string | null;
  propertySlug: string | null;
  guestName: string;
  guestEmail: string;
  message: string;
  status: string;
  hostReply: string | null;
  readByHostAt: string | null;
  repliedAt: string | null;
  createdAt: string;
};

export async function getHostProfileInquiries(): Promise<
  HostProfileInquiry[]
> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"]);

  const organizationIds = (memberships ?? []).map(
    (membership) => membership.organization_id as string,
  );

  if (!organizationIds.length) return [];

  const { data: inquiries, error } = await supabase
    .from("host_profile_inquiries")
    .select(
      "id,organization_id,property_id,guest_name,guest_email,message,status,host_reply,read_by_host_at,replied_at,created_at",
    )
    .in("organization_id", organizationIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error("Unable to load pre-booking inquiries.");
  }

  const propertyIds = [
    ...new Set(
      (inquiries ?? [])
        .map((inquiry) => inquiry.property_id as string | null)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const propertyById = new Map<
    string,
    { name: string; slug: string | null }
  >();

  if (propertyIds.length) {
    const [{ data: properties }, { data: units }] = await Promise.all([
      supabase
        .from("properties")
        .select("id,name")
        .in("id", propertyIds),
      supabase
        .from("property_units")
        .select("property_id,slug")
        .in("property_id", propertyIds)
        .eq("is_primary", true),
    ]);

    const slugByProperty = new Map(
      (units ?? []).map((unit) => [
        unit.property_id as string,
        (unit.slug as string | null) || null,
      ]),
    );

    for (const property of properties ?? []) {
      propertyById.set(property.id as string, {
        name: property.name as string,
        slug: slugByProperty.get(property.id as string) ?? null,
      });
    }
  }

  return (inquiries ?? []).map((inquiry) => {
    const property = inquiry.property_id
      ? propertyById.get(inquiry.property_id as string)
      : null;

    return {
      id: inquiry.id as string,
      organizationId: inquiry.organization_id as string,
      propertyId: (inquiry.property_id as string | null) ?? null,
      propertyName: property?.name ?? null,
      propertySlug: property?.slug ?? null,
      guestName: inquiry.guest_name as string,
      guestEmail: inquiry.guest_email as string,
      message: inquiry.message as string,
      status: inquiry.status as string,
      hostReply: (inquiry.host_reply as string | null) ?? null,
      readByHostAt:
        (inquiry.read_by_host_at as string | null) ?? null,
      repliedAt: (inquiry.replied_at as string | null) ?? null,
      createdAt: inquiry.created_at as string,
    };
  });
}
