import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Property photo on Find A Place Booking";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/jpeg";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function brandUrl() {
  return absoluteUrl("/brand/find-a-place-seal.png");
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return Response.redirect(brandUrl(), 307);
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("public_listing_detail", {
    requested_slug: slug,
  });

  if (error) {
    console.error("[stay opengraph image] listing lookup failed", {
      slug,
      code: error.code,
      message: error.message,
    });
    return Response.redirect(brandUrl(), 307);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { image_paths?: string[] | null }
    | undefined;

  const storagePath = row?.image_paths?.[0];

  if (!storagePath) {
    console.warn("[stay opengraph image] no property cover image", {
      slug,
    });
    return Response.redirect(brandUrl(), 307);
  }

  const storage = admin.storage.from("property-images");

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
    const response = Response.redirect(transformed.signedUrl, 307);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set(
      "X-Find-A-Place-Social-Image",
      "property-transformed",
    );
    return response;
  }

  console.warn(
    "[stay opengraph image] transformed signed URL unavailable; using original",
    {
      slug,
      storagePath,
      message: transformError?.message,
    },
  );

  const { data: original, error: originalError } =
    await storage.createSignedUrl(storagePath, 900);

  if (!originalError && original?.signedUrl) {
    const response = Response.redirect(original.signedUrl, 307);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set(
      "X-Find-A-Place-Social-Image",
      "property-original",
    );
    return response;
  }

  console.error("[stay opengraph image] primary image signing failed", {
    slug,
    storagePath,
    message: originalError?.message,
  });

  return Response.redirect(brandUrl(), 307);
}
