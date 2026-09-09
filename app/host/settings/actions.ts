"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  if (!(file instanceof File) || file.size === 0) redirect("/host/settings?avatarError=Choose+an+image+first");
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) redirect("/host/settings?avatarError=Use+JPG%2C+PNG+or+WebP");
  if (file.size > MAX_AVATAR_BYTES) redirect("/host/settings?avatarError=Profile+photo+must+be+5MB+or+smaller");

  const { supabase, profileId } = await requireProfile();
  const { data: current } = await supabase.from("profiles").select("avatar_storage_path").eq("id", profileId).maybeSingle();
  const oldPath = (current?.avatar_storage_path ?? null) as string | null;
  const storagePath = `${profileId}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error: uploadError } = await supabase.storage.from("host-avatars").upload(storagePath, await file.arrayBuffer(), {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) {
    console.error("[uploadHostAvatar] storage upload failed", uploadError);
    redirect("/host/settings?avatarError=We+couldn%27t+upload+that+photo");
  }

  const { error: saveError } = await supabase.rpc("set_my_avatar_path", { avatar_path: storagePath });
  if (saveError) {
    console.error("[uploadHostAvatar] profile save failed", saveError);
    await supabase.storage.from("host-avatars").remove([storagePath]);
    redirect("/host/settings?avatarError=We+couldn%27t+save+that+photo");
  }

  if (oldPath && oldPath !== storagePath) await supabase.storage.from("host-avatars").remove([oldPath]);
  refreshHostLayout();
  redirect("/host/settings?avatarSaved=1");
}

export async function removeHostAvatar() {
  const { supabase, profileId } = await requireProfile();
  const { data: current } = await supabase.from("profiles").select("avatar_storage_path").eq("id", profileId).maybeSingle();
  const oldPath = (current?.avatar_storage_path ?? null) as string | null;
  const { error } = await supabase.rpc("set_my_avatar_path", { avatar_path: null });
  if (error) {
    console.error("[removeHostAvatar] profile save failed", error);
    redirect("/host/settings?avatarError=We+couldn%27t+remove+that+photo");
  }
  if (oldPath) await supabase.storage.from("host-avatars").remove([oldPath]);
  refreshHostLayout();
  redirect("/host/settings?avatarRemoved=1");
}
