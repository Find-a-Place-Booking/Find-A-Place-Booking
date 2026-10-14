import { serveStaySocialImage } from "@/lib/public/serve-stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Property photo on Find A Place Booking";
export const size = { width: 1200, height: 630 };

// No ImageResponse renderer, no data: URL and no fixed, potentially incorrect
// Content-Type. The real image bytes + matching MIME are returned instead.
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return serveStaySocialImage((await params).slug);
}
