import { createAdminClient } from "@/lib/supabase/admin";

export type PublicHostProfile = {
  organizationId: string;
  name: string;
  contactName: string | null;
  businessLocation: string | null;
  publicBio: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  avatarUrl: string | null;
};

export async function getPublicHostProfileForOrganization(
  organizationId: string,
): Promise<PublicHostProfile | null> {
  const admin = createAdminClient();

  const { data: organization } = await admin
    .from("organizations")
    .select(
      "id,name,public_host_name,primary_contact_name,business_location,contact_email,contact_phone,public_host_bio",
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) return null;

  const { data: members } = await admin
    .from("organization_members")
    .select("profile_id,role")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"])
    .limit(10);

  const member =
    (members ?? []).find((row) => row.role === "OWNER") ?? members?.[0] ?? null;

  let avatarUrl: string | null = null;
  if (member?.profile_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_storage_path")
      .eq("id", member.profile_id)
      .maybeSingle();

    if (profile?.avatar_storage_path) {
      const { data: signed } = await admin.storage
        .from("host-avatars")
        .createSignedUrl(profile.avatar_storage_path, 3600);
      avatarUrl = signed?.signedUrl ?? null;
    }
  }

  return {
    organizationId: organization.id,
    name: organization.public_host_name?.trim() || organization.name,
    contactName: organization.primary_contact_name ?? null,
    businessLocation: organization.business_location ?? null,
    publicBio: organization.public_host_bio ?? null,
    contactEmail: organization.contact_email ?? null,
    contactPhone: organization.contact_phone ?? null,
    avatarUrl,
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
