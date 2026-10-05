import { after, NextRequest, NextResponse } from "next/server";

import { deliverHostProfileInquiryAlert } from "@/lib/notifications/host-profile-inquiries";
import { sameOrigin } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: string) {
  return (
    value.length >= 3 &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    const hostSlug = cleanText(body?.hostSlug, 120).toLowerCase();
    const propertyId = cleanText(body?.propertyId, 100);
    const guestName = cleanText(body?.guestName, 120);
    const guestEmail = cleanText(body?.guestEmail, 320).toLowerCase();
    const message = cleanText(body?.message, 3000);
    const honeypot = cleanText(body?.website, 300);

    if (honeypot) {
      return NextResponse.json({ ok: true });
    }

    if (!HOST_SLUG_RE.test(hostSlug)) {
      return NextResponse.json(
        { error: "That host profile could not be found." },
        { status: 404 },
      );
    }

    if (guestName.length < 2) {
      return NextResponse.json(
        { error: "Enter your name." },
        { status: 400 },
      );
    }

    if (!validEmail(guestEmail)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    if (message.length < 10) {
      return NextResponse.json(
        { error: "Write a little more so the host knows what you need." },
        { status: 400 },
      );
    }

    if (propertyId && !UUID_RE.test(propertyId)) {
      return NextResponse.json(
        { error: "That stay selection is invalid." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: organization } = await admin
      .from("organizations")
      .select("id,public_host_slug")
      .eq("public_host_slug", hostSlug)
      .maybeSingle();

    if (!organization) {
      return NextResponse.json(
        { error: "That host profile could not be found." },
        { status: 404 },
      );
    }

    const { count: publishedCount } = await admin
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "PUBLISHED");

    if (!publishedCount) {
      return NextResponse.json(
        { error: "That host profile is not currently available." },
        { status: 404 },
      );
    }

    let selectedPropertyId: string | null = null;
    if (propertyId) {
      const { data: property } = await admin
        .from("properties")
        .select("id")
        .eq("id", propertyId)
        .eq("organization_id", organization.id)
        .eq("status", "PUBLISHED")
        .maybeSingle();

      if (!property) {
        return NextResponse.json(
          { error: "That stay is not available on this host profile." },
          { status: 400 },
        );
      }

      selectedPropertyId = property.id;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("host_profile_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("guest_email", guestEmail)
      .gte("created_at", oneHourAgo);

    if ((recentCount ?? 0) >= 5) {
      return NextResponse.json(
        {
          error:
            "You've sent several messages recently. Give the host a little time to respond before sending another.",
        },
        { status: 429 },
      );
    }

    const { data: inquiry, error: insertError } = await admin
      .from("host_profile_inquiries")
      .insert({
        organization_id: organization.id,
        property_id: selectedPropertyId,
        guest_name: guestName,
        guest_email: guestEmail,
        message,
        status: "NEW",
      })
      .select("id")
      .single();

    if (insertError || !inquiry?.id) {
      console.error("[public host inquiry] insert failed", insertError);
      return NextResponse.json(
        { error: "Your message could not be saved. Try again." },
        { status: 500 },
      );
    }

    after(async () => {
      try {
        await deliverHostProfileInquiryAlert(admin, inquiry.id);
      } catch (error) {
        console.error("[public host inquiry] host email alert failed", {
          inquiryId: inquiry.id,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[public host inquiry]", error);
    return NextResponse.json(
      { error: "Your message could not be sent right now. Try again." },
      { status: 500 },
    );
  }
}
