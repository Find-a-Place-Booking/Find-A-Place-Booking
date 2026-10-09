import { createAdminClient } from "@/lib/supabase/admin";

import { PropertyMediaGalleryClient } from "./PropertyMediaGalleryClient";

export async function PropertyMediaGallery({
  propertyName,
  unitId,
  images,
}: {
  propertyName: string;
  unitId: string;
  images: string[];
}) {
  let video:
    | {
        url: string;
        contentType: string;
        isPrimary: boolean;
      }
    | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("property_videos")
      .select("storage_path,content_type,is_primary")
      .eq("unit_id", unitId)
      .maybeSingle();

    if (error) {
      console.error("[public property video] lookup failed", {
        unitId,
        code: error.code,
        message: error.message,
      });
    } else if (data?.storage_path) {
      const { data: signed, error: signedError } = await admin.storage
        .from("property-videos")
        .createSignedUrl(data.storage_path, 3600);

      if (signedError) {
        console.error("[public property video] signed URL failed", {
          unitId,
          message: signedError.message,
        });
      } else if (signed?.signedUrl) {
        video = {
          url: signed.signedUrl,
          contentType: data.content_type,
          isPrimary: Boolean(data.is_primary),
        };
      }
    }
  } catch (error) {
    console.error("[public property video] unavailable", error);
  }

  return (
    <PropertyMediaGalleryClient
      propertyName={propertyName}
      images={images}
      video={video}
    />
  );
}
