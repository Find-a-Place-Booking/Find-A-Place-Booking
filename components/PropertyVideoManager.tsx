import { createClient } from "@/lib/supabase/server";

import { PropertyVideoManagerClient } from "./PropertyVideoManagerClient";

export type HostPropertyVideo = {
  id: string;
  storagePath: string;
  originalName: string | null;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  isPrimary: boolean;
  signedUrl: string | null;
};

export async function PropertyVideoManager({
  organizationId,
  propertyId,
  unitId,
  propertyName,
  editable,
}: {
  organizationId: string;
  propertyId: string;
  unitId: string;
  propertyName: string;
  editable: boolean;
}) {
  const supabase = await createClient();
  let initialVideo: HostPropertyVideo | null = null;

  const { data, error } = await supabase
    .from("property_videos")
    .select(
      "id,storage_path,original_name,content_type,size_bytes,duration_seconds,is_primary",
    )
    .eq("unit_id", unitId)
    .maybeSingle();

  if (error) {
    console.error("[property video] unable to load host video", {
      unitId,
      code: error.code,
      message: error.message,
    });
  } else if (data) {
    const { data: signed, error: signedError } = await supabase.storage
      .from("property-videos")
      .createSignedUrl(data.storage_path, 3600);

    if (signedError) {
      console.error("[property video] unable to sign host preview", {
        unitId,
        message: signedError.message,
      });
    }

    initialVideo = {
      id: data.id,
      storagePath: data.storage_path,
      originalName: data.original_name,
      contentType: data.content_type,
      sizeBytes: Number(data.size_bytes || 0),
      durationSeconds:
        data.duration_seconds == null
          ? null
          : Number(data.duration_seconds),
      isPrimary: Boolean(data.is_primary),
      signedUrl: signed?.signedUrl ?? null,
    };
  }

  return (
    <PropertyVideoManagerClient
      organizationId={organizationId}
      propertyId={propertyId}
      unitId={unitId}
      propertyName={propertyName}
      editable={editable}
      initialVideo={initialVideo}
    />
  );
}
