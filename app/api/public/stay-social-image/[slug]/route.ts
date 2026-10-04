import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function redirectResponse(url: string, source: string) {
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Find-A-Place-Social-Image", source);
  return response;
}

function brandFallback(request: Request) {
  return redirectResponse(
    new URL("/brand/find-a-place-seal.png", request.url).toString(),
    "brand",
  );
}

export async function GET(
  request: Request,
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
    console.error("[stay social image] listing lookup failed", {
      slug,
      code: error.code,
      message: error.message,
    });
    return brandFallback(request);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { image_paths?: string[] | null }
    | undefined;

  const storagePath = row?.image_paths?.[0];

  if (!storagePath) {
    console.warn("[stay social image] no property cover image", { slug });
    return brandFallback(request);
  }

  const storage = admin.storage.from("property-images");

  // First choice: the actual primary property image, resized to the
  // standard Facebook/Open Graph card ratio. We redirect the crawler
  // directly to Supabase instead of downloading/re-serving the image
  // through Vercel.
  const { data: transformed, error: transformError } =
    await storage.createSignedUrl(storagePath, 900, {
      transform: {
        width: 1200,
        height: 630,
        resize: "cover",
        quality: 82,
      },
    });

  if (!transformError && transformed?.signedUrl) {
    return redirectResponse(transformed.signedUrl, "property-transformed");
  }

  console.warn(
    "[stay social image] transformed signed URL unavailable; using original",
    {
      slug,
      storagePath,
      message: transformError?.message,
    },
  );

  // Second choice: still use the property's primary image, even if
  // transformation is unavailable. The platform logo is only a final
  // fallback after the actual stay image cannot be signed at all.
  const { data: original, error: originalError } =
    await storage.createSignedUrl(storagePath, 900);

  if (!originalError && original?.signedUrl) {
    return redirectResponse(original.signedUrl, "property-original");
  }

  console.error("[stay social image] primary image signing failed", {
    slug,
    storagePath,
    message: originalError?.message,
  });

  return brandFallback(request);
}
