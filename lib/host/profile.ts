import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type HostGalleryImage = {
  id: string;
  storagePath: string;
  originalName: string | null;
  signedUrl: string | null;
};

export type HostAccountProfile = {
  profileId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  avatarStoragePath: string | null;
  avatarUrl: string | null;
  gallery: HostGalleryImage[];
  organizationId: string | null;
  organizationName: string | null;
  publicHostName: string | null;
  primaryContactName: string | null;
  businessLocation: string | null;
  supportEmail: string | null;
  publicHostBio: string | null;
};

export async function getHostAccountProfile(): Promise<HostAccountProfile> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,phone,avatar_storage_path")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !profile) throw new Error("Unable to load host profile.");

  const [{ data: memberships }, { data: galleryRows }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id,role,status")
      .eq("profile_id", profileId)
      .eq("status", "ACTIVE")
      .in("role", ["OWNER", "MANAGER"])
      .limit(1),
    supabase
      .from("host_profile_images")
      .select("id,storage_path,original_name,sort_order,created_at")
      .eq("profile_id", profileId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const organizationId = memberships?.[0]?.organization_id as string | undefined;

  type OrganizationProfile = {
    name: string;
    primary_contact_name: string | null;
    business_location: string | null;
    contact_email: string | null;
    public_host_bio: string | null;
    public_host_name: string | null;
  };

  let organization: OrganizationProfile | null = null;

  if (organizationId) {
    const { data: organizationData } = await supabase
      .from("organizations")
      .select(
        "name,primary_contact_name,business_location,contact_email,public_host_bio,public_host_name",
      )
      .eq("id", organizationId)
      .maybeSingle();

    organization = (organizationData ?? null) as OrganizationProfile | null;
  }

  let avatarUrl: string | null = null;
  const avatarStoragePath = (profile.avatar_storage_path ?? null) as string | null;

  if (avatarStoragePath) {
    const { data: signed } = await supabase.storage
      .from("host-avatars")
      .createSignedUrl(avatarStoragePath, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }

  const gallery: HostGalleryImage[] = [];

  for (const row of galleryRows ?? []) {
    const { data: signed } = await supabase.storage
      .from("host-avatars")
      .createSignedUrl(row.storage_path, 3600);

    gallery.push({
      id: row.id,
      storagePath: row.storage_path,
      originalName: row.original_name,
      signedUrl: signed?.signedUrl ?? null,
    });
  }

  return {
    profileId,
    email: profile.email ?? null,
    fullName: profile.full_name ?? null,
    phone: profile.phone ?? null,
    avatarStoragePath,
    avatarUrl,
    gallery,
    organizationId: organizationId ?? null,
    organizationName: organization?.name ?? null,
    publicHostName: organization?.public_host_name ?? null,
    primaryContactName: organization?.primary_contact_name ?? null,
    businessLocation: organization?.business_location ?? null,
    supportEmail: organization?.contact_email ?? null,
    publicHostBio: organization?.public_host_bio ?? null,
  };
}

export function initialsForHost(
  profile: Pick<HostAccountProfile, "fullName" | "organizationName" | "email">,
) {
  const source = profile.fullName || profile.organizationName || profile.email || "Host";
  const parts = source.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
