import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import {
  guestCheckoutTokenMatches,
  sameOrigin,
} from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const reservationId =
    request.nextUrl.searchParams.get("reservationId")?.trim() || "";
  const checkoutToken =
    request.nextUrl.searchParams.get("checkoutToken")?.trim() || "";

  if (!guestCheckoutTokenMatches(reservationId, checkoutToken)) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("reservation_reviews")
    .select("id,rating,body,status,host_response,created_at")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  return NextResponse.json(
    { review: data ?? null },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        reservationId?: string;
        checkoutToken?: string;
        rating?: number;
        review?: string;
      }
    | null;

  const reservationId = body?.reservationId?.trim() || "";
  const checkoutToken = body?.checkoutToken?.trim() || "";
  const rating = Number(body?.rating);
  const review = body?.review?.trim().slice(0, 4000) || "";

  if (
    !reservationId ||
    !guestCheckoutTokenMatches(reservationId, checkoutToken)
  ) {
    return NextResponse.json(
      { error: "Booking access could not be verified." },
      { status: 403 },
    );
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "Choose a rating from 1 to 5 stars." },
      { status: 400 },
    );
  }

  if (review.length < 10) {
    return NextResponse.json(
      { error: "Write a short review of at least 10 characters." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("reservations")
    .select("id,status,property_id,unit_id,guest_name,check_out")
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation || reservation.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Only confirmed reservations can be reviewed." },
      { status: 409 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  if (reservation.check_out > today) {
    return NextResponse.json(
      { error: "Reviews open after checkout." },
      { status: 409 },
    );
  }

  const { error } = await admin.from("reservation_reviews").insert({
    reservation_id: reservation.id,
    property_id: reservation.property_id,
    unit_id: reservation.unit_id,
    guest_name_snapshot: reservation.guest_name,
    rating,
    body: review,
    status: "PUBLISHED",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A review has already been submitted for this stay." },
        { status: 409 },
      );
    }

    console.error("[trip review] insert failed", error);
    return NextResponse.json(
      { error: "Unable to save review." },
      { status: 500 },
    );
  }

  const { data: unit } = await admin
    .from("property_units")
    .select("slug")
    .eq("id", reservation.unit_id)
    .maybeSingle();

  revalidatePath("/");
  revalidatePath("/stays");
  if (unit?.slug) revalidatePath(`/stays/${unit.slug}`);

  return NextResponse.json({ ok: true });
}
