import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function brandFallback(request: Request) {
  const response = NextResponse.redirect(
    new URL("/brand/find-a-place-seal.png", request.url),
    307,
  );
  response.headers.set(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  return response;
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
    return brandFallback(request);
  }

  const storage = admin.storage.from("property-images");

  // Social crawlers do better with one stable, same-domain image URL.
  // Return the image bytes directly so Facebook/Twitter do not have to follow
  // an expiring private-storage signed URL from the page metadata.
  let download = await storage.download(storagePath, {
    transform: {
      width: 1200,
      height: 630,
      resize: "cover",
      quality: 82,
      format: "origin",
    },
  });

  // Preserve a working preview even if Storage image transformations are
  // unavailable for the current project/plan.
  if (download.error || !download.data) {
    console.warn("[stay social image] transformed image unavailable; using original", {
      slug,
      message: download.error?.message,
    });
    download = await storage.download(storagePath);
  }

  if (download.error || !download.data) {
    console.error("[stay social image] image download failed", {
      slug,
      message: download.error?.message,
    });
    return brandFallback(request);
  }

  const body = await download.data.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": download.data.type || "image/jpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control":
        "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
