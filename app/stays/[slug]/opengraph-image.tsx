import { loadStaySocialImage } from "@/lib/public/stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Find A Place Booking property photo";
export const size = {
  width: 1200,
  height: 630,
};

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const image = await loadStaySocialImage(slug);

  return new Response(image.body, {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.body.byteLength),
      "Cache-Control":
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Find-A-Place-Social-Image": image.source,
    },
  });
}
