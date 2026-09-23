"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function compact(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}

export async function saveHostReviewResponse(formData: FormData) {
  const reviewId = compact(formData.get("reviewId"), 100);
  const slug = compact(formData.get("slug"), 160);
  const response = compact(formData.get("response"), 4000);

  if (!reviewId || !response) {
    redirect(
      `/host/reviews?error=${encodeURIComponent(
        "Write a response before saving.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect("/host/sign-in");
  }

  const { error } = await supabase.rpc("host_respond_to_review", {
    target_review_id: reviewId,
    response_text: response,
  });

  if (error) {
    console.error("[saveHostReviewResponse]", error);
    redirect(
      `/host/reviews?error=${encodeURIComponent(
        error.message || "Unable to save review response.",
      )}`,
    );
  }

  revalidatePath("/host/reviews");
  revalidatePath("/");
  revalidatePath("/stays");
  if (slug) revalidatePath(`/stays/${slug}`);

  redirect("/host/reviews?saved=1");
}
