import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  hostSlug?: unknown;
  name?: unknown;
  email?: unknown;
  rating?: unknown;
  review?: unknown;
  experience?: unknown;
  turnstileToken?: unknown;
  website?: unknown;
};
function string(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit + 1) : "";
}
const error = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return error("Invalid request origin.", 403);
  if (Number(request.headers.get("content-length") || 0) > 12_000) return error("Review is too long.", 413);
  const body = (await request.json().catch(() => null)) as Payload | null;
  if (!body || typeof body !== "object") return error("Invalid review.", 400);
  // Traps bulk form spam without causing visible submission failure.
  if (string(body.website, 100)) return NextResponse.json({ ok: true });

  const hostSlug = string(body.hostSlug, 100).toLowerCase();
  const name = string(body.name, 100);
  const email = string(body.email, 254).toLowerCase();
  const review = string(body.review, 2000);
  const rating = Number(body.rating);
  const experience = string(body.experience, 32);
  const token = string(body.turnstileToken, 4096);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hostSlug)) return error("Host not found.", 404);
  if (name.length < 2 || name.length > 100 || email.length < 5 || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      review.length < 20 || review.length > 2000 ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      !["STAYED", "HOST_INTERACTION", "OTHER"].includes(experience)) {
    return error("Enter your name, email, 1–5 stars and at least 20 characters about your experience.", 400);
  }

  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!sitekey || !secret || !token || token.length > 4096) {
    return error("Complete the security check before submitting.", 400);
  }
  try {
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!verification.ok) return error("Security check unavailable. Try again.", 503);
    const result = (await verification.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    const expectedHost = process.env.TURNSTILE_EXPECTED_HOSTNAME?.trim();
    if (!result.success || result.action !== "host_review" || (expectedHost && result.hostname !== expectedHost)) {
      return error("Security check expired. Please retry.", 403);
    }
  } catch {
    return error("Security check unavailable. Try again.", 503);
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin.from("organizations")
    .select("id").eq("public_host_slug", hostSlug).maybeSingle();
  if (orgError || !org) return error("Host not found.", 404);
  const { count, error: listingError } = await admin.from("properties")
    .select("id", { head: true, count: "exact" }).eq("organization_id", org.id).eq("status", "PUBLISHED");
  if (listingError || !count) return error("This host is not accepting public reviews.", 404);

  const { error: insertError } = await admin.from("public_host_reviews").insert({
    organization_id: org.id,
    reviewer_name: name,
    reviewer_email: email,
    rating,
    body: review,
    experience_type: experience,
    status: "PENDING",
  });
  if (insertError) {
    if (insertError.code === "23505") return error("A review was already received for this host and email.", 409);
    console.error("[host reviews] submission failed", { code: insertError.code });
    return error("Your review could not be saved. Try again.", 500);
  }
  return NextResponse.json({ ok: true, message: "Thank you. Your review was submitted for moderation." },
    { headers: { "Cache-Control": "no-store" } });
}
