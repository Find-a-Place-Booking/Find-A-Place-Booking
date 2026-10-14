import { createAdminClient } from "@/lib/supabase/admin";

type PublicListingSocialRow = {
  image_paths?: string[] | null;
};

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BYTES = 7 * 1024 * 1024; // Keep responses safely below Meta's 8MB limit.
const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

function detectFacebookSafeType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (
    bytes.length > 24 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length > 24 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/**
 * Public, crawler-friendly image endpoint. Never send HTML/JSON/WebP falsely
 * labeled as PNG, and never use ImageResponse/Satori to re-render the source.
 * The original images remain private; only the actual transformed bytes are
 * served by these public, listing-scoped routes.
 */
export async function serveStaySocialImage(
  slug: string,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("public_listing_detail", {
      requested_slug: slug,
    });
    if (error) {
      console.error("[public stay share] listing lookup failed", { slug, code: error.code, message: error.message });
      return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    const row = (Array.isArray(data) ? data[0] : data) as PublicListingSocialRow | undefined;
    if (!row) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const paths = [...new Set((row.image_paths ?? []).filter((path): path is string => Boolean(path)))];
    const storage = admin.storage.from("property-images");

    for (const storagePath of paths.slice(0, 8)) {
      // Force the original *format* while resizing the image to 1200x630.
      // Without format:origin, Storage may auto-return WebP to browsers/crawlers.
      const transformed = await storage.download(storagePath, {
        transform: {
          width: 1200,
          height: 630,
          quality: 78,
          resize: "cover",
          format: "origin",
        },
      });

      // If transformations are temporarily unavailable, use a small enough
      // original photo (this still helps otherwise-working listings).
      const candidates: Blob[] = [];
      if (transformed.data) candidates.push(transformed.data);
      if (!transformed.data) {
        console.warn("[public stay share] transformation failed", {
          slug, storagePath, message: transformed.error?.message,
        });
        const original = await storage.download(storagePath);
        if (original.data) candidates.push(original.data);
      }

      for (const blob of candidates) {
        if (!blob.size || blob.size > MAX_BYTES) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const mime = detectFacebookSafeType(bytes);
        if (!mime) continue;

        return new Response(method === "HEAD" ? null : blob, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(bytes.byteLength),
            "Cache-Control": CACHE_CONTROL,
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "X-Find-A-Place-Social-Image": "direct-binary-v3",
          },
        });
      }
    }

    console.error("[public stay share] no usable property image", {
      slug, tried: Math.min(paths.length, 8),
    });
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[public stay share] unexpected failure", {
      slug, message: error instanceof Error ? error.message : String(error),
    });
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    });
  }
}
