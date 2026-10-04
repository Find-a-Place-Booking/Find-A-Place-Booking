"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function revalidateNearbyExperienceChange(input: {
  propertyId: string;
  slug: string;
}) {
  const propertyId = input.propertyId?.trim();
  const slug = input.slug?.trim();
  if (!propertyId || !slug) return { ok: false };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return { ok: false };

  const { data: allowed, error } = await supabase.rpc(
    "can_manage_property",
    { target_property_id: propertyId },
  );
  if (error || !allowed) return { ok: false };

  revalidatePath(`/host/properties/${slug}`);
  revalidatePath(`/stays/${slug}`);
  return { ok: true };
}
