"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { PropertyImageRecord } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/client";
import styles from "./PrimaryPhotoSelector.module.css";

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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
  const [images, setImages] = useState(() =>
    [...initialImages].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const orderedImages = useMemo(
    () => [...images].sort((a, b) => a.sortOrder - b.sortOrder),
    [images],
  );

  if (!orderedImages.length) return null;

  async function persistOrder(next: PropertyImageRecord[]) {
    if (!editable || saving) return false;

    const previous = orderedImages;
    const normalized = next.map((image, index) => ({
      ...image,
      sortOrder: index,
    }));

    setImages(normalized);
    setSaving(true);
    setError(null);
    setMessage("Saving photo order…");

    const supabase = createClient();
    const { error: reorderError } = await supabase.rpc(
      "reorder_property_images",
      {
        target_unit_id: unitId,
        ordered_image_ids: normalized.map((image) => image.id),
      },
    );

    setSaving(false);

    if (reorderError) {
      console.error("[reorder property images]", reorderError);
      setImages(previous);
      setMessage(null);
      setError("Couldn't save the new photo order. Nothing was changed.");
      return false;
    }

    setMessage(
      "Photo order saved. The first photo is now the primary image guests see.",
    );
    router.refresh();
    return true;
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedImages.length) return;
    await persistOrder(moveItem(orderedImages, index, target));
  }

  async function moveToFront(index: number) {
    if (index === 0) return;
    await persistOrder(moveItem(orderedImages, index, 0));
  }

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Photo order</p>
          <h2>Drag photos into the order guests should see them</h2>
          <p>
            The first photo is automatically the primary / hero image. Drag and
            drop on desktop, or use the move buttons on phones and tablets. The
            order saves as soon as you move a photo.
          </p>
        </div>

        <div className={styles.summary}>
          <strong>{orderedImages.length}</strong>
          <span>photo{orderedImages.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {message ? <div className="admin-message success">{message}</div> : null}
      {error ? <div className="admin-message error">{error}</div> : null}

      <div className={styles.grid} aria-label="Property photo order">
        {orderedImages.map((image, index) => {
          const primary = index === 0;
          const dragging = draggingId === image.id;

          return (
            <figure
              key={image.id}
              className={`${styles.card} ${primary ? styles.primary : ""} ${
                dragging ? styles.dragging : ""
              }`}
              draggable={editable && !saving}
              onDragStart={(event) => {
                if (!editable || saving) {
                  event.preventDefault();
                  return;
                }
                dragIndexRef.current = index;
                setDraggingId(image.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", image.id);
              }}
              onDragEnd={() => {
                dragIndexRef.current = null;
                setDraggingId(null);
              }}
              onDragOver={(event) => {
                if (!editable || saving) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!editable || saving) return;
                event.preventDefault();
                const from = dragIndexRef.current;
                dragIndexRef.current = null;
                setDraggingId(null);
                if (from == null || from === index) return;
                void persistOrder(moveItem(orderedImages, from, index));
              }}
            >
              <div className={styles.imageWrap}>
                {image.signedUrl ? (
                  <img
                    src={image.signedUrl}
                    alt={image.altText || image.originalName || "Property photo"}
                    draggable={false}
                  />
                ) : (
                  <div className={styles.missing}>Preview unavailable</div>
                )}

                <span className={styles.positionBadge}>#{index + 1}</span>
                {primary ? (
                  <span className={styles.primaryBadge}>Primary photo</span>
                ) : null}
                <span className={styles.dragHandle} aria-hidden="true">
                  ⋮⋮
                </span>
              </div>

              <figcaption className={styles.caption}>
                <div>
                  <strong>{image.originalName || `Photo ${index + 1}`}</strong>
                  <span>
                    {primary
                      ? "Shown first across the listing"
                      : "Drag to reorder"}
                  </span>
                </div>

                <div className={styles.mobileActions}>
                  <button
                    type="button"
                    disabled={!editable || saving || index === 0}
                    onClick={() => void move(index, -1)}
                    aria-label={`Move ${image.originalName || `photo ${index + 1}`} earlier`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={!editable || saving || index === orderedImages.length - 1}
                    onClick={() => void move(index, 1)}
                    aria-label={`Move ${image.originalName || `photo ${index + 1}`} later`}
                  >
                    →
                  </button>
                  {!primary ? (
                    <button
                      type="button"
                      disabled={!editable || saving}
                      onClick={() => void moveToFront(index)}
                    >
                      Make primary
                    </button>
                  ) : null}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div>
          <strong>{saving ? "Saving photo order…" : "First photo = primary photo"}</strong>
          <span>
            Reordering does not delete or re-upload anything. It only changes
            how the existing photos are arranged for guests.
          </span>
        </div>
      </div>
    </section>
  );
}
