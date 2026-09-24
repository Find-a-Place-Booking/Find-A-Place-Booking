import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const revalidate = 1800;

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cachedRedirect(url: string) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set(
    "Cache-Control",
    "public, max-age=600, s-maxage=1800, stale-while-revalidate=86400",
  );
  return response;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return new NextResponse(null, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("public_listing_detail", {
    requested_slug: slug,
  });

  if (error) {
    console.error("[mobile stay cover] listing lookup failed", {
      slug,
      code: error.code,
      message: error.message,
    });
    return new NextResponse(null, { status: 404 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { image_paths?: string[] | null }
    | undefined;
  const storagePath = row?.image_paths?.[0];

  if (!storagePath) {
    return new NextResponse(null, { status: 404 });
  }

  const storage = admin.storage.from("property-images");

  // This route is only selected by <picture> on screens <= 700px.
  // Supabase Storage downsizes the cover and automatically negotiates WebP
  // where the browser supports it. Desktop keeps using the original URL.
  const { data: transformed, error: transformError } =
    await storage.createSignedUrl(storagePath, 3600, {
      transform: {
        width: 1080,
        quality: 70,
      },
    });

  if (transformed?.signedUrl && !transformError) {
    return cachedRedirect(transformed.signedUrl);
  }

  // If image transformations are unavailable, preserve the listing image
  // instead of showing a broken mobile card.
  console.error("[mobile stay cover] transform unavailable; using original", {
    slug,
    message: transformError?.message,
  });

  const { data: original, error: originalError } =
    await storage.createSignedUrl(storagePath, 3600);

  if (originalError || !original?.signedUrl) {
    return new NextResponse(null, { status: 404 });
  }

  return cachedRedirect(original.signedUrl);
}
