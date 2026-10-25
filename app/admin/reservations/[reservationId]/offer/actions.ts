"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin/context";
import { sendManualTargetedOffer } from "@/lib/bookings/manual-targeted-offer";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sendIndividualOffer(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  const discountPercent = Number(formData.get("discountPercent"));
  const confirmed = formData.get("confirm") === "yes";
  if (!UUID.test(reservationId)) throw new Error("Invalid reservation identifier.");

  const url = `/admin/reservations/${encodeURIComponent(reservationId)}/offer`;
  if (!confirmed || ![5, 10, 15, 20].includes(discountPercent)) {
    redirect(`${url}?error=${encodeURIComponent("Confirm an approved discount of 5%, 10%, 15% or 20%.")}`);
  }

  const context = await getAdminContext();
  const userClient = await createClient();
  let message: string;
  let result: "saved" | "error" = "error";
  try {
    const outcome = await sendManualTargetedOffer({
      admin: createAdminClient(), userClient,
      reservationId, createdBy: context.profileId,
      discountPercent, environment: stripeEnvironment(),
    });
    result = "saved";
    message = `Offer sent to ${outcome.guest}. No booking or calendar hold was created.`;
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to send the offer.";
  }

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${reservationId}`);
  redirect(`${url}?${result}=${encodeURIComponent(message.slice(0, 300))}`);
}
