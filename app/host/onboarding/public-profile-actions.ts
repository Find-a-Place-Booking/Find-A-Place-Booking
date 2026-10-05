"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function requireHostOrganization() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in?next=/host/onboarding");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER"])
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    redirect("/host/onboarding?profileError=Host+organization+not+found");
  }

  return {
    supabase,
    profileId,
    organizationId: membership.organization_id as string,
  };
}

async function revalidatePublicHost(organizationId: string) {
  const admin = createAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("public_host_slug")
    .eq("id", organizationId)
    .maybeSingle();

  revalidatePath("/host/onboarding");
  revalidatePath("/host/settings");
  revalidatePath("/stays", "layout");

  if (organization?.public_host_slug) {
    revalidatePath(`/hosts/${organization.public_host_slug}`);
  }
}

export async function saveOnboardingPublicHostProfile(formData: FormData) {
  const publicHostName = String(formData.get("public_host_name") ?? "")
    .trim()
    .slice(0, 120);
  const publicHostBio = String(formData.get("public_host_bio") ?? "")
    .trim()
    .slice(0, 800);

  if (!publicHostName) {
    redirect("/host/onboarding?profileError=Add+a+public+host+or+business+name");
  }

  const { organizationId } = await requireHostOrganization();
  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update({
      public_host_name: publicHostName,
      public_host_bio: publicHostBio || null,
    })
    .eq("id", organizationId);

  if (error) {
    console.error("[onboarding public host profile]", error);
    redirect("/host/onboarding?profileError=Public+host+profile+could+not+be+saved");
  }

  await revalidatePublicHost(organizationId);
  redirect("/host/onboarding?profileSaved=1");
}

export async function uploadOnboardingHostAvatar(formData: FormData) {
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/host/onboarding?profileError=Choose+an+image+first");
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    redirect("/host/onboarding?profileError=Use+JPG%2C+PNG+or+WebP");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    redirect("/host/onboarding?profileError=Profile+photo+must+be+3MB+or+smaller");
  }

  const { supabase, profileId, organizationId } =
    await requireHostOrganization();

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_storage_path")
    .eq("id", profileId)
    .maybeSingle();

  const oldPath = (current?.avatar_storage_path ?? null) as string | null;
  const storagePath =
    `${profileId}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error: uploadError } = await supabase.storage
    .from("host-avatars")
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("[onboarding host avatar upload]", uploadError);
    redirect("/host/onboarding?profileError=We+couldn%27t+upload+that+photo");
  }

  const { error: saveError } = await supabase.rpc("set_my_avatar_path", {
    avatar_path: storagePath,
  });

  if (saveError) {
    await supabase.storage.from("host-avatars").remove([storagePath]);
    console.error("[onboarding host avatar save]", saveError);
    redirect("/host/onboarding?profileError=We+couldn%27t+save+that+photo");
  }

  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from("host-avatars").remove([oldPath]);
  }

  await revalidatePublicHost(organizationId);
  redirect("/host/onboarding?avatarSaved=1");
}

export async function removeOnboardingHostAvatar() {
  const { supabase, profileId, organizationId } =
    await requireHostOrganization();

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_storage_path")
    .eq("id", profileId)
    .maybeSingle();

  const oldPath = (current?.avatar_storage_path ?? null) as string | null;

  const { error } = await supabase.rpc("set_my_avatar_path", {
    avatar_path: null,
  });

  if (error) {
    redirect("/host/onboarding?profileError=We+couldn%27t+remove+that+photo");
  }

  if (oldPath) {
    await supabase.storage.from("host-avatars").remove([oldPath]);
  }

  await revalidatePublicHost(organizationId);
  redirect("/host/onboarding?avatarRemoved=1");
}
