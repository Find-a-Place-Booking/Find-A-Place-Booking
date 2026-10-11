"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import styles from "./OnboardingPhotoManager.module.css";

type Photo = {
  id: string;
  storagePath: string;
  originalName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
  altText: string | null;
  signedUrl: string | null;
};

type Target = {
  propertyId: string;
  unitId: string;
  slug: string;
};

type Props = {
  organizationId: string;
  propertyName: string;
  onPhotoNamesChange?: (names: string[]) => void;
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function OnboardingPhotoManager({
  organizationId,
  propertyName,
  onPhotoNamesChange,
}: Props) {
  const initialized = useRef(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [images, setImages] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [organizingPhotos, setOrganizingPhotos] = useState(false);
  const [message, setMessage] = useState(
    "Preparing the real listing photo storage…",
  );
  const [error, setError] = useState<string | null>(null);

  const orderedImages = useMemo(
    () => [...images].sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  const publishNames = useCallback(
    (next: Photo[]) => {
      const ordered = [...next].sort((a, b) => a.sortOrder - b.sortOrder);
      onPhotoNamesChange?.(
        ordered
          .map((image) => image.originalName?.trim() || "")
          .filter(Boolean),
      );
    },
    [onPhotoNamesChange],
  );

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/host/onboarding/photos?organizationId=${encodeURIComponent(
        organizationId,
      )}`,
      {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.target) {
      throw new Error(
        payload?.error ||
          "Unable to prepare property photo storage. Save the property name and try again.",
      );
    }

    const nextImages = (payload.images ?? []) as Photo[];
    setTarget(payload.target as Target);
    setImages(nextImages);
    publishNames(nextImages);
    setMessage(
      nextImages.length
        ? `${nextImages.length} photo${nextImages.length === 1 ? "" : "s"} already saved to this listing.`
        : "Photo storage is ready. Upload at least one photo before finishing setup.",
    );
  }, [organizationId, publishNames]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await load();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to prepare property photo storage.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || uploading || organizingPhotos || !target) return;

    const remaining = Math.max(0, 25 - images.length);
    if (!remaining) {
      setError("A property can have up to 25 photos.");
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError(null);
    setMessage("Uploading property photos…");

    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      setUploading(false);
      setError("Your session expired. Sign in again before uploading photos.");
      return;
    }

    const nextImages = [...orderedImages];

    for (const file of selected) {
      if (!allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) {
        setError(
          `${file.name} was skipped. Use JPG, PNG or WebP files under 10 MB.`,
        );
        continue;
      }

      const path =
        `${organizationId}/${target.propertyId}/` +
        `${crypto.randomUUID()}.${extensionFor(file)}`;

      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("[onboarding property image upload]", uploadError);
        setError(`Couldn't upload ${file.name}.`);
        continue;
      }

      const { data: row, error: insertError } = await supabase
        .from("property_images")
        .insert({
          unit_id: target.unitId,
          storage_path: path,
          original_name: file.name.slice(0, 255),
          content_type: file.type,
          size_bytes: file.size,
          sort_order: nextImages.length,
          alt_text: propertyName.trim()
            ? `${propertyName.trim()} property photo`
            : "Property photo",
          created_by: userId,
        })
        .select(
          "id,storage_path,original_name,content_type,size_bytes,sort_order,alt_text",
        )
        .single();

      if (insertError || !row) {
        await supabase.storage.from("property-images").remove([path]);
        console.error("[onboarding property image row]", insertError);
        setError(`Couldn't register ${file.name} after upload.`);
        continue;
      }

      const { data: signed } = await supabase.storage
        .from("property-images")
        .createSignedUrl(path, 3600);

      nextImages.push({
        id: row.id,
        storagePath: row.storage_path,
        originalName: row.original_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        sortOrder: row.sort_order,
        altText: row.alt_text,
        signedUrl: signed?.signedUrl ?? null,
      });
    }

    setImages(nextImages);
    publishNames(nextImages);
    setUploading(false);

    if (nextImages.length > images.length) {
      setMessage(
        `${nextImages.length} photo${nextImages.length === 1 ? "" : "s"} saved to the real listing. You can set the cover and reorder them below.`,
      );
    }
  }

  async function removeImage(image: Photo) {
    if (uploading || organizingPhotos || !target) return;

    setUploading(true);
    setError(null);
    const supabase = createClient();

    const { error: rowError } = await supabase
      .from("property_images")
      .delete()
      .eq("id", image.id);

    if (rowError) {
      setUploading(false);
      setError("Couldn't remove this photo from the listing.");
      return;
    }

    const { error: storageError } = await supabase.storage
      .from("property-images")
      .remove([image.storagePath]);

    const nextImages = orderedImages
      .filter((item) => item.id !== image.id)
      .map((item, index) => ({ ...item, sortOrder: index }));
    setImages(nextImages);
    publishNames(nextImages);
    setUploading(false);

    if (nextImages.length && target) {
      const { error: normalizeError } = await supabase.rpc(
        "reorder_property_images",
        {
          target_unit_id: target.unitId,
          ordered_image_ids: nextImages.map((item) => item.id),
        },
      );
      if (normalizeError) {
        console.error("[onboarding photo order normalize]", normalizeError);
      }
    }

    if (storageError) {
      console.error("[onboarding photo storage cleanup]", storageError);
      setError(
        "The photo was removed from the listing, but its old stored file needs cleanup.",
      );
      return;
    }

    setMessage(
      nextImages.length
        ? `${nextImages.length} photo${nextImages.length === 1 ? "" : "s"} saved to the listing.`
        : "No photos saved yet. Upload at least one before finishing setup.",
    );
  }

  async function persistPhotoOrder(next: Photo[]) {
    if (!target || uploading || organizingPhotos) return;

    const previous = orderedImages;
    const normalized = next.map((image, index) => ({
      ...image,
      sortOrder: index,
    }));

    setImages(normalized);
    publishNames(normalized);
    setOrganizingPhotos(true);
    setError(null);
    setMessage("Saving photo order…");

    const supabase = createClient();
    const { error: reorderError } = await supabase.rpc(
      "reorder_property_images",
      {
        target_unit_id: target.unitId,
        ordered_image_ids: normalized.map((image) => image.id),
      },
    );

    setOrganizingPhotos(false);

    if (reorderError) {
      console.error("[onboarding reorder property images]", reorderError);
      setImages(previous);
      publishNames(previous);
      setError("Couldn't save the new photo order. Nothing was changed.");
      setMessage("Photo order was not changed.");
      return;
    }

    setMessage(
      "Photo order saved. The first photo is now the cover used on the listing and shared-link preview.",
    );
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderedImages.length) return;
    void persistPhotoOrder(moveItem(orderedImages, index, targetIndex));
  }

  function makePrimaryPhoto(index: number) {
    if (index === 0) return;
    void persistPhotoOrder(moveItem(orderedImages, index, 0));
  }

  return (
    <div className={styles.manager}>
      <div className={styles.status}>
        <div>
          <strong>
            {loading
              ? "Preparing photo storage"
              : uploading
                ? "Saving photos"
                : organizingPhotos
                  ? "Saving photo order"
                  : "Photos save immediately"}
          </strong>
          <span>{message}</span>
        </div>
        {!loading && target ? (
          <span className={styles.saved}>Connected to listing draft</span>
        ) : null}
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <label className="upload-drop">
        <span>＋</span>
        <strong>Add property photos</strong>
        <p>
          JPG, PNG or WebP, up to 10 MB each and 25 photos total. You can
          choose the cover and reorder photos after upload.
        </p>
        <span className="button button-small button-quiet">
          {uploading ? "Uploading…" : "Choose photos"}
        </span>
        <input
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={loading || uploading || organizingPhotos || !target}
          onChange={(event) => {
            void uploadFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {orderedImages.length ? (
        <>
          <div className={styles.organizeNote}>
            <strong>Arrange your listing photos</strong>
            <span>
              The first photo is the cover guests see on stay cards and shared
              links. Use the buttons below to change the order on desktop or
              mobile.
            </span>
          </div>

          <div className={styles.grid}>
            {orderedImages.map((photo, index) => (
              <div className={styles.photo} key={photo.id}>
                {photo.signedUrl ? (
                  <img
                    src={photo.signedUrl}
                    alt={photo.altText || "Property photo"}
                  />
                ) : (
                  <div aria-label="Property photo unavailable" />
                )}

                <div className={styles.photoMeta}>
                  <span className={index === 0 ? styles.coverLabel : ""}>
                    {index === 0
                      ? "Cover"
                      : photo.originalName || `Photo ${index + 1}`}
                  </span>
                  <button
                    className={styles.remove}
                    type="button"
                    disabled={uploading || organizingPhotos}
                    onClick={() => void removeImage(photo)}
                  >
                    Remove
                  </button>
                </div>

                <div className={styles.photoActions}>
                  {index !== 0 ? (
                    <button
                      type="button"
                      disabled={uploading || organizingPhotos}
                      onClick={() => makePrimaryPhoto(index)}
                    >
                      Set as cover
                    </button>
                  ) : (
                    <span className={styles.primary}>Primary photo</span>
                  )}

                  <div className={styles.moveButtons}>
                    <button
                      type="button"
                      aria-label={`Move photo ${index + 1} left`}
                      disabled={
                        uploading || organizingPhotos || index === 0
                      }
                      onClick={() => movePhoto(index, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label={`Move photo ${index + 1} right`}
                      disabled={
                        uploading ||
                        organizingPhotos ||
                        index === orderedImages.length - 1
                      }
                      onClick={() => movePhoto(index, 1)}
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <p className={styles.help}>
        These are the actual files used by the property listing. Finishing
        onboarding will keep them attached to the listing automatically.
      </p>
    </div>
  );
}
