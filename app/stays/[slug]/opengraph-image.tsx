import { loadStaySocialImage } from "@/lib/public/stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Property photo on Find A Place Booking";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return new Response(null, { status: 404 });
  }

  try {
    const image = await loadStaySocialImage(slug);

    if (!image) {
      return new Response(null, { status: 404 });
    }

    return new Response(image.body, {
      status: 200,
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.body.byteLength),
        "Content-Disposition": "inline",
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "X-Content-Type-Options": "nosniff",
        "X-Find-A-Place-Social-Image": image.source,
      },
    });
  } catch (error) {
    console.error("[stay opengraph image] request failed", {
      slug,
      message:
        error instanceof Error
          ? error.message
          : String(error),
    });

    return new Response(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    });
  }
}
