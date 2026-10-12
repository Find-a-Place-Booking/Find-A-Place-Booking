import { createAdminClient } from "@/lib/supabase/admin";

type PublicListingSocialRow = {
  image_paths?: string[] | null;
};

export type SocialImagePayload = {
  body: ArrayBuffer;
  contentType: string;
  source: "transformed" | "original";
};

async function blobPayload(
  blob: Blob,
  source: SocialImagePayload["source"],
): Promise<SocialImagePayload> {
  const body = await blob.arrayBuffer();

  if (!body.byteLength) {
    throw new Error("Storage returned an empty image.");
  }

  const contentType =
    blob.type?.split(";")[0]?.trim() || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new Error(
      `Storage returned unexpected content type ${contentType}.`,
    );
  }

  return {
    body,
    contentType,
    source,
  };
}

export async function loadStaySocialImage(
  slug: string,
): Promise<SocialImagePayload | null> {
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

  const storage = admin.storage.from("property-images");

  // Pull the image through the authenticated Storage client instead of
  // generating a short-lived signed URL and then making a second fetch to it.
  // Facebook always receives one stable Find A Place URL while the server
  // retrieves the current primary property photo behind the scenes.
  const {
    data: transformed,
    error: transformError,
  } = await storage.download(storagePath, {
    transform: {
      width: 1200,
      height: 630,
      resize: "cover",
      quality: 84,
      format: "origin",
    },
  });

  if (!transformError && transformed) {
    try {
      return await blobPayload(transformed, "transformed");
    } catch (error) {
      console.warn(
        "[stay social image] transformed image unusable; trying original",
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
      "[stay social image] transformed download unavailable; trying original",
      {
        slug,
        storagePath,
        message: transformError?.message,
      },
    );
  }

  // If image transformations are disabled or unavailable, return the actual
  // primary property photo rather than falling back to the platform logo.
  const {
    data: original,
    error: originalError,
  } = await storage.download(storagePath);

  if (!originalError && original) {
    return blobPayload(original, "original");
  }

  console.error("[stay social image] primary photo download failed", {
    slug,
    storagePath,
    message: originalError?.message,
  });

  // Do not return the Find A Place logo for a stay that has a real photo.
  // A temporary 503 lets crawlers retry instead of permanently caching the
  // wrong brand image as this stay's thumbnail.
  throw new Error("The primary stay photo is temporarily unavailable.");
}
