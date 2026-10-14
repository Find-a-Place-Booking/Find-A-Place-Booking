import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";

type PublicListingSocialRow = {
  image_paths?: string[] | null;
};

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const CACHE_CONTROL =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

function unavailable(slug: string, reason: string) {
  console.error("[public stay share] main photo unavailable", { slug, reason });
  // IMPORTANT: Don't quietly substitute a later gallery photo. Let Meta
  // retry instead of caching the wrong image for this stay.
  return new Response(null, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "60" },
  });
}

/**
 * Serves ONLY the selected primary listing photo. Hosts select it with
 * "Make primary" / "Set as cover", which stores it first by sort_order;
 * public_listing_detail.image_paths is sorted by that same order.
 *
 * Normalize it on the server into a small real JPEG instead of serving a
 * multi-megabyte original, an unexpected WebP, or the second gallery image.
 * This keeps the URL compatible with Facebook and the older share URLs.
 */
export async function serveStaySocialImage(
  slug: string,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("public_listing_detail", {
      requested_slug: slug,
    });
    if (error) return unavailable(slug, `listing lookup: ${error.message}`);

    const row = (Array.isArray(data) ? data[0] : data) as
      | PublicListingSocialRow
      | undefined;
    if (!row) {
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // The first path is the hero photo, never just the first downloadable one.
    const primaryPath = row.image_paths?.[0];
    if (!primaryPath) return unavailable(slug, "no primary photo assigned");

    const { data: primary, error: downloadError } = await admin.storage
      .from("property-images")
      .download(primaryPath);
    if (!primary) {
      return unavailable(slug, `primary download: ${downloadError?.message ?? "missing file"}`);
    }

    // Supabase accepts JPG, PNG, and WebP listing photos. Sharp normalizes
    // all three without relying on the Storage transformation service.
    // Large originals are compressed to stay comfortably under Meta's 8MB cap.
    const source = Buffer.from(await primary.arrayBuffer());
    const jpeg = await sharp(source, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize(1200, 630, { fit: "cover", position: "attention" })
      .flatten({ background: "#f6f4ef" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    if (!jpeg.byteLength || jpeg.byteLength > MAX_IMAGE_BYTES) {
      return unavailable(slug, `converted primary photo was ${jpeg.byteLength} bytes`);
    }

    return new Response(method === "HEAD" ? null : new Uint8Array(jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": "inline",
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
        "X-Find-A-Place-Social-Image": "primary-only-v4",
      },
    });
  } catch (error) {
    return unavailable(slug, error instanceof Error ? error.message : String(error));
  }
}
