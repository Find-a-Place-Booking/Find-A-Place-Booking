import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createAdminClient } from "@/lib/supabase/admin";

type PublicListingSocialRow = {
  image_paths?: string[] | null;
};

type SocialImagePayload = {
  body: ArrayBuffer;
  contentType: string;
  source: "transformed" | "original" | "brand";
};

async function fetchSignedImage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Image fetch returned HTTP ${response.status}.`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new Error(
      `Image fetch returned unexpected content type ${contentType}.`,
    );
  }

  return {
    body: await response.arrayBuffer(),
    contentType,
  };
}

async function brandFallback(): Promise<SocialImagePayload> {
  const logo = await readFile(
    join(
      process.cwd(),
      "public",
      "brand",
      "find-a-place-seal.png",
    ),
  );

  const bytes = Uint8Array.from(logo);

  return {
    body: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    contentType: "image/png",
    source: "brand",
  };
}

export async function loadStaySocialImage(
  slug: string,
): Promise<SocialImagePayload> {
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
    return brandFallback();
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | PublicListingSocialRow
    | undefined;

  const storagePath = row?.image_paths?.[0];

  if (!storagePath) {
    console.warn("[stay social image] listing has no cover image", {
      slug,
    });
    return brandFallback();
  }

  const storage = admin.storage.from("property-images");

  // First choice: a social-card-sized version of the actual primary
  // property photo.
  const {
    data: transformedSigned,
    error: transformedSignedError,
  } = await storage.createSignedUrl(storagePath, 300, {
    transform: {
      width: 1200,
      height: 630,
      resize: "cover",
      quality: 84,
    },
  });

  if (
    !transformedSignedError &&
    transformedSigned?.signedUrl
  ) {
    try {
      const image = await fetchSignedImage(
        transformedSigned.signedUrl,
      );

      return {
        ...image,
        source: "transformed",
      };
    } catch (error) {
      console.warn(
        "[stay social image] transformed cover fetch failed; trying original",
        {
          slug,
          storagePath,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }
  } else {
    console.warn(
      "[stay social image] transformed signed URL unavailable; trying original",
      {
        slug,
        storagePath,
        message: transformedSignedError?.message,
      },
    );
  }

  // Second choice: the original primary property image. This is more
  // important than perfect cropping; Facebook should still show the
  // stay instead of dropping immediately to the platform logo.
  const {
    data: originalSigned,
    error: originalSignedError,
  } = await storage.createSignedUrl(storagePath, 300);

  if (!originalSignedError && originalSigned?.signedUrl) {
    try {
      const image = await fetchSignedImage(
        originalSigned.signedUrl,
      );

      return {
        ...image,
        source: "original",
      };
    } catch (error) {
      console.error(
        "[stay social image] original cover fetch failed",
        {
          slug,
          storagePath,
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }
  } else {
    console.error(
      "[stay social image] original signed URL unavailable",
      {
        slug,
        storagePath,
        message: originalSignedError?.message,
      },
    );
  }

  // Only use the Find A Place brand image after both forms of the
  // actual stay cover photo fail.
  return brandFallback();
}
