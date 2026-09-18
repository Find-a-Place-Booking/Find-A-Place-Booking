"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 5000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function addReservationSupportNote(formData: FormData) {
  const context = await getAdminContext();
  const reservationId = field(formData, "reservation_id", 100);
  const note = field(formData, "note");

  if (!reservationId || !note) {
    redirect(
      `/admin/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent("Enter a support note first.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reservation_support_notes").insert({
    reservation_id: reservationId,
    admin_profile_id: context.profileId,
    note,
  });

  if (error) {
    console.error("[addReservationSupportNote]", error);
    redirect(
      `/admin/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent("The support note could not be saved.")}`,
    );
  }

  revalidatePath(`/admin/reservations/${reservationId}`);
  redirect(
    `/admin/reservations/${encodeURIComponent(
      reservationId,
    )}?saved=${encodeURIComponent("Support note saved.")}`,
  );
}
