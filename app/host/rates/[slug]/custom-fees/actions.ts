"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modes = new Set(["FLAT_PER_STAY", "PER_NIGHT", "PER_GUEST_PER_STAY", "PER_GUEST_PER_NIGHT", "PER_PET_PER_STAY"]);
const resultUrl = (slug: string, state: string) => `/host/rates/${encodeURIComponent(slug)}?custom_fee=${state}#custom-fees`;

function field(data: FormData, name: string, limit = 500) {
  const raw = data.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, limit) : "";
}

// Keep currency conversion exact; never silently round host money inputs.
function centsFromText(amount: string): number | null {
  if (!amount) return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(amount)) return NaN;
  const [dollars, part = ""] = amount.split(".");
  const cents = Number(dollars) * 100 + Number(part.padEnd(2, "0"));
  return cents <= 1_000_000 ? cents : NaN;
}

async function authorizedContext(data: FormData) {
  const id = field(data, "unitId", 36);
  if (!validUuid.test(id)) redirect("/host/rates");
  const supabase = await createClient();
  const { data: allowed, error: accessError } = await supabase.rpc("can_manage_unit_pricing", { target_unit_id: id });
  if (accessError || allowed !== true) redirect("/host/rates");
  const { data: unit, error } = await supabase.from("property_units").select("slug").eq("id", id).maybeSingle();
  if (error || !unit?.slug) redirect("/host/rates");
  return { supabase, id, slug: unit.slug as string };
}

export async function saveCustomHostFee(data: FormData) {
  const { supabase, id, slug } = await authorizedContext(data);
  const feeId = field(data, "feeId", 36);
  const name = field(data, "name", 101);
  const description = field(data, "description", 501);
  const calculation = field(data, "calculation", 40);
  const cents = centsFromText(field(data, "amount", 30));
  if ((feeId && !validUuid.test(feeId)) || name.length < 2 || name.length > 100 || description.length > 500 || !modes.has(calculation) || Number.isNaN(cents)) {
    redirect(resultUrl(slug, "invalid"));
  }
  // Blank amounts remain inactive drafts, not surprise checkout charges.
  const amount_cents = cents ?? 0;
  const payload = {
    name,
    description,
    amount_cents,
    calculation,
    is_active: amount_cents > 0 && data.get("isActive") === "on",
    taxable_as_accommodation: data.get("taxableAsAccommodation") === "on",
  };
  if (feeId) {
    const { data: updated, error } = await supabase.from("unit_custom_fees")
      .update(payload).eq("id", feeId).eq("unit_id", id).select("id").maybeSingle();
    if (error || !updated) redirect(resultUrl(slug, "error"));
  } else {
    const { error } = await supabase.from("unit_custom_fees").insert({ unit_id: id, ...payload });
    if (error) redirect(resultUrl(slug, "error"));
  }
  revalidatePath(`/host/rates/${slug}`);
  revalidatePath(`/stays`);
  redirect(resultUrl(slug, "saved"));
}

export async function deleteCustomHostFee(data: FormData) {
  const { supabase, id, slug } = await authorizedContext(data);
  const feeId = field(data, "feeId", 36);
  if (!validUuid.test(feeId)) redirect(resultUrl(slug, "invalid"));
  const { data: removed, error } = await supabase.from("unit_custom_fees")
    .delete().eq("id", feeId).eq("unit_id", id).select("id").maybeSingle();
  if (error || !removed) redirect(resultUrl(slug, "error"));
  revalidatePath(`/host/rates/${slug}`);
  revalidatePath(`/stays`);
  redirect(resultUrl(slug, "deleted"));
}
