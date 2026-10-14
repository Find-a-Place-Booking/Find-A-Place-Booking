import { ImageResponse } from "next/og";
import { createElement } from "react";

import { loadStaySocialImageSource } from "@/lib/public/stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const alt = "Property photo on Find A Place Booking";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
    const source = await loadStaySocialImageSource(slug);

    if (!source) {
      return new Response(null, { status: 404 });
    }

    const response = new ImageResponse(
      createElement(
        "div",
        {
          style: {
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundColor: "#e7e3db",
            overflow: "hidden",
          },
        },
        createElement("img", {
          src: source.dataUrl,
          alt: "",
          width: 1200,
          height: 630,
          style: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
          },
        }),
      ),
      size,
    );

    response.headers.set(
      "Cache-Control",
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    );
    response.headers.set("Content-Disposition", "inline");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Find-A-Place-Social-Image", "normalized-png");

    return response;
  } catch (error) {
    console.error("[stay opengraph image] request failed", {
      slug,
      message: error instanceof Error ? error.message : String(error),
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
