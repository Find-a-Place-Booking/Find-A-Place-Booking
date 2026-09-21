"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 4000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");
  return { supabase, profileId };
}

export async function sendHostReservationMessage(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const body = field(formData, "body");

  if (!reservationId || !body) {
    redirect(
      `/host/reservations/${encodeURIComponent(
        reservationId,
      )}?error=${encodeURIComponent("Enter a message first.")}`,
    );
  }

  const { supabase, profileId } = await requireHost();

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id")
    .eq("id", reservationId)
    .maybeSingle();

  if (reservationError || !reservation) {
    redirect("/host/reservations?result=error&detail=Reservation+not+found.");
  }

  let { data: conversation } = await supabase
    .from("reservation_conversations")
    .select("id")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (!conversation) {
    const { data: created, error: conversationError } = await supabase
      .from("reservation_conversations")
      .insert({ reservation_id: reservationId })
      .select("id")
      .single();

    if (conversationError || !created) {
      redirect(
        `/host/reservations/${reservationId}?error=${encodeURIComponent(
          "The booking conversation could not be started.",
        )}`,
      );
    }

    conversation = created;
  }

  const { error } = await supabase.from("reservation_messages").insert({
    conversation_id: conversation.id,
    reservation_id: reservationId,
    sender_type: "HOST",
    sender_profile_id: profileId,
    body,
  });

  if (error) {
    console.error("[sendHostReservationMessage]", error);
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The message could not be sent.",
      )}`,
    );
  }

  await supabase
    .from("reservation_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  revalidatePath("/host/messages");
  revalidatePath(`/host/reservations/${reservationId}`);

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Message sent.",
    )}`,
  );
}

export async function respondToReservationReview(formData: FormData) {
  const reservationId = field(formData, "reservation_id", 100);
  const reviewId = field(formData, "review_id", 100);
  const response = field(formData, "response");

  if (!reservationId || !reviewId || !response) {
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "Enter a response first.",
      )}`,
    );
  }

  const { supabase, profileId } = await requireHost();
  const { error } = await supabase
    .from("reservation_reviews")
    .update({
      host_response: response,
      host_response_by: profileId,
      host_responded_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) {
    console.error("[respondToReservationReview]", error);
    redirect(
      `/host/reservations/${reservationId}?error=${encodeURIComponent(
        "The review response could not be saved.",
      )}`,
    );
  }

  revalidatePath(`/host/reservations/${reservationId}`);
  revalidatePath("/stays");

  redirect(
    `/host/reservations/${reservationId}?saved=${encodeURIComponent(
      "Review response saved.",
    )}`,
  );
}
