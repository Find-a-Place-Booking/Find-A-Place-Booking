"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendManualTargetedOffer } from "@/lib/bookings/manual-targeted-offer";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sendHostIndividualOffer(formData: FormData) {
  const reservationId = String(formData.get("reservationId") ?? "").trim();
  if (!UUID.test(reservationId)) redirect("/host/reservations");

  const page = `/host/recovery/individual/${encodeURIComponent(reservationId)}`;
  const percent = Number(formData.get("discountPercent"));
  if (formData.get("confirm") !== "yes" || ![5, 10, 15, 20].includes(percent)) {
    redirect(`${page}?error=${encodeURIComponent("Please approve a 5%, 10%, 15%, or 20% discount.")}`);
  }

  const userClient = await createClient();
  const { data } = await userClient.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");

  let result: "saved" | "error" = "error";
  let message = "Unable to send this offer.";
  try {
    const outcome = await sendManualTargetedOffer({
      admin: createAdminClient(), userClient,
      reservationId, createdBy: profileId, discountPercent: percent,
      environment: stripeEnvironment(),
    });
    result = "saved";
    message = `Special offer sent to ${outcome.guest}. No booking or calendar hold was created.`;
  } catch (error) {
    message = error instanceof Error ? error.message : message;
  }
  revalidatePath("/host");
  revalidatePath("/host/reservations");
  revalidatePath("/host/recovery");
  revalidatePath(page);
  redirect(`${page}?${result}=${encodeURIComponent(message.slice(0, 250))}`);
}
