import { createAdminClient } from "@/lib/supabase/admin";

type PublicListingSocialRow = {
  image_paths?: string[] | null;
};

export type SocialImageSource = {
  dataUrl: string;
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  byteLength: number;
  storagePath: string;
};

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function detectImageContentType(
  bytes: Uint8Array,
):
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif"
  | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }

  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" ||
      ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }

  return null;
}

export async function loadStaySocialImageSource(
  slug: string,
): Promise<SocialImageSource | null> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc(
    "public_listing_detail",
    {
      requested_slug: slug,
    },
  );

  if (error) {
    console.error("[stay social image] listing lookup failed", {
      slug,
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to load the stay.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | PublicListingSocialRow
    | undefined;

  const storagePath = row?.image_paths?.[0];

  if (!storagePath) {
    console.warn("[stay social image] listing has no primary photo", {
      slug,
    });
    return null;
  }

  // Download the real primary image without a storage transform. The route
  // re-renders it into a standards-safe 1200x630 PNG with ImageResponse.
  // This avoids passing an upstream blob/MIME combination straight through
  // to social crawlers and guarantees the response bytes match image/png.
  const {
    data: original,
    error: originalError,
  } = await admin.storage
    .from("property-images")
    .download(storagePath);

  if (originalError || !original) {
    console.error("[stay social image] primary photo download failed", {
      slug,
      storagePath,
      message: originalError?.message,
    });
    throw new Error("The primary stay photo is temporarily unavailable.");
  }

  const body = await original.arrayBuffer();

  if (!body.byteLength) {
    throw new Error("Storage returned an empty primary image.");
  }

  const bytes = new Uint8Array(body);
  const contentType = detectImageContentType(bytes);

  if (!contentType) {
    console.error("[stay social image] unsupported image signature", {
      slug,
      storagePath,
      storageContentType: original.type || null,
      byteLength: body.byteLength,
    });
    throw new Error("The primary stay photo format is not supported.");
  }

  return {
    dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString(
      "base64",
    )}`,
    contentType,
    byteLength: body.byteLength,
    storagePath,
  };
}
