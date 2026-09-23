import { NextRequest, NextResponse } from "next/server";

import { sameOrigin } from "@/lib/payments/booking-runtime";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const organizationId =
      request.nextUrl.searchParams.get("organizationId")?.trim() || "";

    if (!UUID_RE.test(organizationId)) {
      return NextResponse.json(
        { error: "Host organization is invalid." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();

    if (!claims?.claims?.sub) {
      return NextResponse.json(
        { error: "Sign in again to continue host setup." },
        { status: 401 },
      );
    }

    const { data: preparedData, error: preparedError } = await supabase.rpc(
      "prepare_onboarding_property",
      { target_organization_id: organizationId },
    );

    if (preparedError) {
      return NextResponse.json(
        { error: preparedError.message },
        { status: 409 },
      );
    }

    const prepared = Array.isArray(preparedData)
      ? preparedData[0]
      : preparedData;

    if (!prepared?.property_id || !prepared?.unit_id || !prepared?.slug) {
      return NextResponse.json(
        { error: "The onboarding property could not be prepared." },
        { status: 500 },
      );
    }

    const { data: rows, error: imageError } = await supabase
      .from("property_images")
      .select(
        "id,storage_path,original_name,content_type,size_bytes,sort_order,alt_text",
      )
      .eq("unit_id", prepared.unit_id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (imageError) {
      return NextResponse.json(
        { error: "Unable to load the saved property photos." },
        { status: 500 },
      );
    }

    const images = await Promise.all(
      (rows ?? []).map(async (row) => {
        const { data: signed } = await supabase.storage
          .from("property-images")
          .createSignedUrl(row.storage_path, 3600);

        return {
          id: row.id,
          storagePath: row.storage_path,
          originalName: row.original_name,
          contentType: row.content_type,
          sizeBytes: row.size_bytes,
          sortOrder: row.sort_order,
          altText: row.alt_text,
          signedUrl: signed?.signedUrl ?? null,
        };
      }),
    );

    return NextResponse.json(
      {
        target: {
          propertyId: prepared.property_id,
          unitId: prepared.unit_id,
          slug: prepared.slug,
        },
        images,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[host onboarding photos]", error);
    return NextResponse.json(
      { error: "Unable to prepare property photos. Refresh and try again." },
      { status: 500 },
    );
  }
}
