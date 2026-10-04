import { ImageResponse } from "next/og";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type SocialListingRow = {
  name?: string | null;
  public_area?: string | null;
  city?: string | null;
  region_code?: string | null;
  image_paths?: string[] | null;
};

function locationLabel(row: SocialListingRow | null) {
  if (!row) return "Find A Place Booking";

  return (
    row.public_area ||
    [row.city, row.region_code].filter(Boolean).join(", ") ||
    "Find A Place Booking"
  );
}

function fallbackImage(title: string, location: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#263a40",
          color: "white",
          padding: "64px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 24,
            letterSpacing: 3,
            textTransform: "uppercase",
            opacity: 0.8,
            marginBottom: 16,
          }}
        >
          Find A Place Booking
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 54,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 26,
            marginTop: 18,
            opacity: 0.88,
          }}
        >
          {location}
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control":
          "public, max-age=600, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!slug || slug.length > 160 || !SAFE_SLUG.test(slug)) {
    return fallbackImage(
      "Find A Place Booking",
      "Independent stays worth the trip",
    );
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

    return fallbackImage(
      "Find A Place Booking",
      "Independent stays worth the trip",
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | SocialListingRow
    | undefined;

  const title = row?.name?.trim() || "Find A Place Booking";
  const location = locationLabel(row ?? null);
  const storagePath = row?.image_paths?.[0];

  if (!storagePath) {
    return fallbackImage(title, location);
  }

  const storage = admin.storage.from("property-images");

  let download = await storage.download(storagePath, {
    transform: {
      width: 1200,
      height: 630,
      resize: "cover",
      quality: 82,
    },
  });

  if (download.error || !download.data) {
    console.warn(
      "[stay opengraph image] transformed image unavailable; using original",
      {
        slug,
        message: download.error?.message,
      },
    );

    download = await storage.download(storagePath);
  }

  if (download.error || !download.data) {
    console.error("[stay opengraph image] image download failed", {
      slug,
      message: download.error?.message,
    });

    return fallbackImage(title, location);
  }

  const imageBytes = Buffer.from(
    await download.data.arrayBuffer(),
  ).toString("base64");

  const mimeType =
    download.data.type && download.data.type.startsWith("image/")
      ? download.data.type
      : "image/jpeg";

  const imageSrc = `data:${mimeType};base64,${imageBytes}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#263a40",
          overflow: "hidden",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <img
          src={imageSrc}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "1200px",
            height: "630px",
            objectFit: "cover",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            padding: "30px 42px 34px",
            background: "rgba(24, 39, 43, 0.88)",
            color: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              opacity: 0.85,
              marginBottom: 8,
            }}
          >
            Find A Place Booking
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 42,
              fontWeight: 700,
              lineHeight: 1.05,
              maxWidth: 1080,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 22,
              marginTop: 10,
              opacity: 0.9,
            }}
          >
            {location}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control":
          "public, max-age=600, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}
