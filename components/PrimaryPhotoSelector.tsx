"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PropertyImageRecord } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/client";
import styles from "./PrimaryPhotoSelector.module.css";

export function PrimaryPhotoSelector({
  unitId,
  images: initialImages,
  editable,
}: {
  unitId: string;
  images: PropertyImageRecord[];
  editable: boolean;
}) {
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialImages.length
      ? [...initialImages].sort(
          (a, b) => a.sortOrder - b.sortOrder,
        )[0]?.id ?? null
      : null,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedImages = useMemo(
    () =>
      [...images].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    [images],
  );

  if (!sortedImages.length) return null;

  const currentPrimary = sortedImages[0];
  const selectedImage =
    sortedImages.find((image) => image.id === selectedId) ??
    currentPrimary;
  const selectionChanged = selectedImage.id !== currentPrimary.id;

  async function savePrimary() {
    if (!editable || saving || !selectionChanged) return;

    setSaving(true);
    setError(null);
    setMessage("Updating the primary photo…");

    const minimumSortOrder = Math.min(
      ...sortedImages.map((item) => item.sortOrder),
    );
    const nextSortOrder = minimumSortOrder - 1;

    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("property_images")
      .update({ sort_order: nextSortOrder })
      .eq("id", selectedImage.id)
      .eq("unit_id", unitId)
      .select("id")
      .single();

    if (updateError || !data) {
      console.error("[set primary property image]", updateError);
      setSaving(false);
      setMessage(null);
      setError("Couldn't change the primary photo. Try again.");
      return;
    }

    setImages((current) =>
      current.map((item) =>
        item.id === selectedImage.id
          ? { ...item, sortOrder: nextSortOrder }
          : item,
      ),
    );
    setSaving(false);
    setMessage("Primary photo updated. This is now the first image guests see.");
    router.refresh();
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Primary / hero photo</p>
          <h2>Choose the first photo guests see</h2>
          <p>
            Tap any photo below, then choose <strong>Set selected as primary</strong>.
            This changes only the photo order — nothing is deleted or re-uploaded.
          </p>
        </div>

        <div className={styles.summary}>
          <strong>{sortedImages.length}</strong>
          <span>photo{sortedImages.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {message ? (
        <div className="admin-message success">{message}</div>
      ) : null}

      {error ? (
        <div className="admin-message error">{error}</div>
      ) : null}

      <div
        className={styles.grid}
        role="radiogroup"
        aria-label="Choose the primary property photo"
      >
        {sortedImages.map((image, index) => {
          const selected = selectedImage.id === image.id;
          const primary = index === 0;

          return (
            <label
              key={image.id}
              className={`${styles.card} ${
                selected ? styles.selected : ""
              } ${primary ? styles.primary : ""}`}
            >
              <input
                className={styles.radio}
                type="radio"
                name={`primary-photo-${unitId}`}
                value={image.id}
                checked={selected}
                disabled={!editable || saving}
                onChange={() => {
                  setSelectedId(image.id);
                  setMessage(null);
                  setError(null);
                }}
              />

              <div className={styles.imageWrap}>
                {image.signedUrl ? (
                  <img
                    src={image.signedUrl}
                    alt={image.altText || image.originalName || "Property photo"}
                  />
                ) : (
                  <div className={styles.missing}>Preview unavailable</div>
                )}

                <span className={styles.check}>
                  {selected ? "✓" : ""}
                </span>

                {primary ? (
                  <span className={styles.primaryBadge}>
                    Current primary
                  </span>
                ) : null}
              </div>

              <div className={styles.caption}>
                <strong>
                  {image.originalName || `Photo ${index + 1}`}
                </strong>
                <span>
                  {primary
                    ? "Currently shown first"
                    : selected
                      ? "Selected to become primary"
                      : "Tap to select"}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      <div className={styles.actions}>
        <div>
          <strong>
            {selectionChanged
              ? "Ready to change the hero photo"
              : "Current primary photo selected"}
          </strong>
          <span>
            {selectionChanged
              ? "Save the selection to make this the first image across the listing."
              : "Choose a different photo above to change it."}
          </span>
        </div>

        <button
          type="button"
          className="button"
          disabled={!editable || saving || !selectionChanged}
          onClick={() => void savePrimary()}
        >
          {saving ? "Updating…" : "Set selected as primary"}
        </button>
      </div>
    </section>
  );
}
