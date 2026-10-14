import { createHash } from "node:crypto";

import { serveStaySocialImage } from "@/lib/public/serve-stay-social-image";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Main property photo on Find A Place Booking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

type ImageRow = { name?: string | null; image_paths?: string[] | null };

// File-based Open Graph images take precedence over generateMetadata().
// Include a fingerprint of the chosen primary image in the generated URL.
// When a host changes their cover, Meta sees a NEW og:image URL on rescrape
// instead of reusing the old cached image for this stay.
export async function generateImageMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = params;
  let primary = `missing:${slug}`;
  let name = "Find A Place stay";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("public_listing_detail", {
      requested_slug: slug,
    });
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as ImageRow | undefined;
      primary = row?.image_paths?.[0] || primary;
      name = row?.name || name;
    }
  } catch (error) {
    console.error("[stay opengraph metadata] primary image lookup failed", {
      slug,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return [
    {
      id: createHash("sha256").update(primary).digest("hex").slice(0, 16),
      alt: `${name} main photo`,
      size,
      contentType,
    },
  ];
}

// `id` is used by Next.js to produce the versioned Open Graph image URL.
// The image itself is always resolved from the CURRENT first/primary photo.
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
  id: Promise<string>;
}) {
  return serveStaySocialImage((await params).slug);
}
