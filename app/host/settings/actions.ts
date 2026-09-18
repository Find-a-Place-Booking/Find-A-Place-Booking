"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const MAX_SERVER_ACTION_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function requireProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;

  if (!profileId) redirect("/host/sign-in");
  return { supabase, profileId };
}

function refreshHostLayout() {
  revalidatePath("/host", "layout");
  revalidatePath("/host/settings");
}

export async function uploadHostAvatar(formData: FormData) {
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/host/settings?avatarError=Choose+an+image+first");
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    redirect("/host/settings?avatarError=Use+JPG%2C+PNG+or+WebP");
  }

  if (file.size > MAX_SERVER_ACTION_IMAGE_BYTES) {
    redirect(
      "/host/settings?avatarError=Profile+photo+must+be+3MB+or+smaller",
    );
  }

  const { supabase, profileId } = await requireProfile();

  const { data: current } = await supabase
    .from("profiles")
    .select("avatar_storage_path")
    .eq("id", profileId)
    .maybeSingle();

  const oldPath = (current?.avatar_storage_path ?? null) as string | null;
  const storagePath = `${profileId}/${crypto.randomUUID()}.${extensionFor(
    file,
  )}`;

  const { error: uploadError } = await supabase.storage
    .from("host-avatars")
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadHostAvatar] storage upload failed", uploadError);
    redirect("/host/settings?avatarError=We+couldn%27t+upload+that+photo");
  }

  const { error: saveError } = await supabase.rpc("set_my_avatar_path", {
    avatar_path: storagePath,
  });

  if (saveError) {
    console.error("[uploadHostAvatar] profile save failed", saveError);
    await supabase.storage.from("host-avatars").remove([storagePath]);
    redirect("/host/settings?avatarError=We+couldn%27t+save+that+photo");
  }

  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from("host-avatars").remove([oldPath]);
  }

  refreshHostLayout();
  redirect("/host/settings?avatarSaved=1");
}

export async function removeHostAvatar() {
  const { supabase, profileId } = await requireProfile();

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
    console.error("[removeHostAvatar] profile save failed", error);
    redirect("/host/settings?avatarError=We+couldn%27t+remove+that+photo");
  }

  if (oldPath) {
    await supabase.storage.from("host-avatars").remove([oldPath]);
  }

  refreshHostLayout();
  redirect("/host/settings?avatarRemoved=1");
}

export async function uploadHostGallery(formData: FormData) {
  const { supabase, profileId } = await requireProfile();
  const files = formData
    .getAll("gallery")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  const { count } = await supabase
    .from("host_profile_images")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  const remaining = Math.max(0, 6 - (count ?? 0));

  if (!remaining) {
    redirect("/host/settings?galleryError=Host+gallery+is+limited+to+6+photos.");
  }

  if (files.length !== 1) {
    redirect("/host/settings?galleryError=Choose+one+image+at+a+time.");
  }

  const selected = files.slice(0, Math.min(1, remaining));
  let sortOrder = count ?? 0;

  for (const file of selected) {
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      redirect("/host/settings?galleryError=Use+JPG%2C+PNG+or+WebP.");
    }
    if (file.size > MAX_SERVER_ACTION_IMAGE_BYTES) {
      redirect("/host/settings?galleryError=Host+photo+must+be+3MB+or+smaller.");
    }

    const storagePath = `${profileId}/gallery/${crypto.randomUUID()}.${extensionFor(
      file,
    )}`;

    const { error: uploadError } = await supabase.storage
      .from("host-avatars")
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) continue;

    const { error: rowError } = await supabase
      .from("host_profile_images")
      .insert({
        profile_id: profileId,
        storage_path: storagePath,
        original_name: file.name.slice(0, 255),
        content_type: file.type,
        size_bytes: file.size,
        sort_order: sortOrder++,
      });

    if (rowError) {
      await supabase.storage.from("host-avatars").remove([storagePath]);
    }
  }

  refreshHostLayout();
  redirect("/host/settings?gallerySaved=1");
}

export async function removeHostGalleryImage(formData: FormData) {
  const imageId = String(formData.get("image_id") ?? "").trim();

  if (!imageId) {
    redirect("/host/settings?galleryError=Missing+photo+reference.");
  }

  const { supabase, profileId } = await requireProfile();

  const { data: image } = await supabase
    .from("host_profile_images")
    .select("id,storage_path")
    .eq("id", imageId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!image) {
    redirect("/host/settings?galleryError=Photo+not+found.");
  }

  const { error } = await supabase
    .from("host_profile_images")
    .delete()
    .eq("id", image.id)
    .eq("profile_id", profileId);

  if (error) {
    redirect("/host/settings?galleryError=Photo+could+not+be+removed.");
  }

  await supabase.storage.from("host-avatars").remove([image.storage_path]);

  refreshHostLayout();
  redirect("/host/settings?galleryRemoved=1");
}
