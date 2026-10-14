import { ImageResponse } from "next/og";
import { createElement } from "react";

import { loadStaySocialImageSource } from "@/lib/public/stay-social-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validSlug(slug: string) {
  return Boolean(
    slug &&
      slug.length <= 160 &&
      SAFE_SLUG.test(slug),
  );
}

function imageHeaders(slug: string) {
  return {
    "Cache-Control":
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "Content-Disposition": `inline; filename="${slug}-share.png"`,
    "Content-Type": "image/png",
    "X-Content-Type-Options": "nosniff",
    "X-Find-A-Place-Social-Image": "normalized-png",
  };
}

async function sourceForSlug(slug: string) {
  if (!validSlug(slug)) return null;
  return loadStaySocialImageSource(slug);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!validSlug(slug)) {
    return new Response(null, { status: 404 });
  }

  try {
    const source = await sourceForSlug(slug);

    if (!source) {
      return new Response(null, {
        status: 404,
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      });
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
      {
        width: 1200,
        height: 630,
      },
    );

    for (const [key, value] of Object.entries(imageHeaders(slug))) {
      response.headers.set(key, value);
    }

    return response;
  } catch (error) {
    console.error("[stay social image] request failed", {
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

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!validSlug(slug)) {
    return new Response(null, { status: 404 });
  }

  try {
    const source = await sourceForSlug(slug);

    if (!source) {
      return new Response(null, {
        status: 404,
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      });
    }

    return new Response(null, {
      status: 200,
      headers: imageHeaders(slug),
    });
  } catch {
    return new Response(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    });
  }
}
