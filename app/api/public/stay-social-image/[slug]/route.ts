import { loadStaySocialImage } from "@/lib/public/stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return new Response(null, { status: 404 });
  }

  const image = await loadStaySocialImage(slug);

  return new Response(image.body, {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Disposition": "inline",
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Find-A-Place-Social-Image": image.source,
    },
  });
}
