import { createAdminClient } from "@/lib/supabase/admin";

type PublicListingSocialRow = {
  image_paths?: string[] | null;
};

type SupportedImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type SocialImageSource = {
  dataUrl: string;
  contentType: SupportedImageType;
  byteLength: number;
  storagePath: string;
};

// Do not feed multi-megabyte originals directly into the Open Graph renderer.
// Social images are only 1200x630, so a larger downloaded image is not needed.
const MAX_RENDER_INPUT_BYTES = 6 * 1024 * 1024;
const MAX_PHOTOS_TO_TRY = 12;

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function detectImageContentType(bytes: Uint8Array): SupportedImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return "image/gif";
  }

  return null;
}

export async function loadStaySocialImageSource(slug: string): Promise<SocialImageSource | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("public_listing_detail", {
    requested_slug: slug,
  });

  if (error) {
    console.error("[stay social image] listing lookup failed", {
      slug, code: error.code, message: error.message,
    });
    throw new Error("Unable to load the stay.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as PublicListingSocialRow | undefined;
  const paths = [...new Set((row?.image_paths ?? []).filter(Boolean))].slice(0, MAX_PHOTOS_TO_TRY);

  if (!paths.length) {
    console.warn("[stay social image] listing has no photo", { slug });
    return null;
  }

  const bucket = admin.storage.from("property-images");

  // On the Find A Place Supabase Pro project, ask Storage to resize the primary
  // photo before it reaches the Vercel OG renderer. Keep an original-download
  // fallback in case transformations are temporarily disabled/unavailable.
  // If a photo cannot be made renderer-safe, try the next photo from the SAME stay.
  for (const storagePath of paths) {
    const transformed = await bucket.download(storagePath, {
      transform: { width: 1200, height: 630, resize: "cover", quality: 78 },
    });

    let image = transformed.data;
    if (!image) {
      const original = await bucket.download(storagePath);
      image = original.data;
      if (!image) {
        console.warn("[stay social image] photo download failed", {
          slug, storagePath,
          transformError: transformed.error?.message,
          originalError: original.error?.message,
        });
        continue;
      }
    }

    const buffer = await image.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_RENDER_INPUT_BYTES) {
      console.warn("[stay social image] photo too large or empty", {
        slug, storagePath, byteLength: buffer.byteLength,
      });
      continue;
    }

    const bytes = new Uint8Array(buffer);
    const contentType = detectImageContentType(bytes);
    if (!contentType) {
      console.warn("[stay social image] unsupported photo format", { slug, storagePath });
      continue;
    }

    return {
      dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
      contentType,
      byteLength: buffer.byteLength,
      storagePath,
    };
  }

  console.error("[stay social image] no renderable photo found", { slug, tried: paths.length });
  return null;
}
