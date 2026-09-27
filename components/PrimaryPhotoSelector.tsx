"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PropertyImageRecord } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/client";

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
  const [savingId, setSavingId] = useState<string | null>(null);
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

  async function setPrimary(image: PropertyImageRecord) {
    if (!editable || savingId || sortedImages[0]?.id === image.id) return;

    setSavingId(image.id);
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
      .eq("id", image.id)
      .eq("unit_id", unitId)
      .select("id")
      .single();

    if (updateError || !data) {
      setSavingId(null);
      setMessage(null);
      setError("Couldn't change the primary photo. Try again.");
      return;
    }

    setImages((current) =>
      current.map((item) =>
        item.id === image.id
          ? { ...item, sortOrder: nextSortOrder }
          : item,
      ),
    );
    setSavingId(null);
    setMessage("Primary photo updated.");
    router.refresh();
  }

  return (
    <section className="panel property-review-submit">
      <div>
        <p className="eyebrow dark">Primary / hero photo</p>
        <h2>Choose the first photo guests see</h2>
        <p>
          The primary photo is used first on the listing, property cards and
          other marketplace surfaces. Changing it does not delete or re-upload
          any photos.
        </p>

        {message ? (
          <div className="admin-message success">{message}</div>
        ) : null}

        {error ? (
          <div className="admin-message error">{error}</div>
        ) : null}

        <div className="property-image-grid">
          {sortedImages.map((image, index) => (
            <figure key={image.id}>
              {image.signedUrl ? (
                <img
                  src={image.signedUrl}
                  alt={image.altText || "Property photo"}
                />
              ) : (
                <div className="property-image-missing">
                  Preview unavailable
                </div>
              )}

              <figcaption>
                <span>
                  {index === 0
                    ? "Primary photo"
                    : image.originalName || `Photo ${index + 1}`}
                </span>

                {index === 0 ? (
                  <span aria-label="Current primary photo">✓ Primary</span>
                ) : (
                  <button
                    type="button"
                    disabled={!editable || savingId !== null}
                    onClick={() => void setPrimary(image)}
                  >
                    {savingId === image.id
                      ? "Setting…"
                      : "Set as primary"}
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
