"use client";

import { useEffect, useState } from "react";

import styles from "./PropertyGallery.module.css";

export function PropertyGallery({
  propertyName,
  images,
}: {
  propertyName: string;
  images: string[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Never invent extra photos to fill the three-slot layout. If a listing only
  // has one or two real photos, the unused slots stay as the existing
  // placeholders instead of repeating the primary image.
  const uniqueImages = Array.from(
    new Set(images.filter((image): image is string => Boolean(image))),
  );
  const hasImages = uniqueImages.length > 0;
  const mainImage = uniqueImages[0];
  const secondImage = uniqueImages[1];
  const thirdImage = uniqueImages[2];

  useEffect(() => {
    if (activeIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
        return;
      }

      if (uniqueImages.length < 2) return;

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) =>
          current === null
            ? 0
            : (current - 1 + uniqueImages.length) % uniqueImages.length,
        );
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) =>
          current === null ? 0 : (current + 1) % uniqueImages.length,
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, uniqueImages.length]);

  function open(index: number) {
    if (!uniqueImages[index]) return;
    setActiveIndex(index);
  }

  function previous() {
    setActiveIndex((current) =>
      current === null
        ? 0
        : (current - 1 + uniqueImages.length) % uniqueImages.length,
    );
  }

  function next() {
    setActiveIndex((current) =>
      current === null ? 0 : (current + 1) % uniqueImages.length,
    );
  }

  return (
    <>
      <div className={`shell ${styles.gallery}`}>
        {mainImage ? (
          <button
            className={`${styles.photoButton} ${styles.main}`}
            type="button"
            onClick={() => open(0)}
            aria-label={`Open photo 1 of ${uniqueImages.length}`}
          >
            <img
              src={mainImage}
              alt={`${propertyName} photo 1`}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          </button>
        ) : (
          <div
            className={`${styles.placeholder} ${styles.main}`}
            aria-label="Property photo unavailable"
          />
        )}

        {secondImage ? (
          <button
            className={`${styles.photoButton} ${styles.secondary}`}
            type="button"
            onClick={() => open(1)}
            aria-label={`Open photo 2 of ${uniqueImages.length}`}
          >
            <img
              src={secondImage}
              alt={`${propertyName} photo 2`}
              loading="lazy"
              decoding="async"
            />
          </button>
        ) : (
          <div
            className={`${styles.placeholder} ${styles.secondary}`}
            aria-label="Additional property photo unavailable"
          />
        )}

        {thirdImage ? (
          <button
            className={`${styles.photoButton} ${styles.secondary}`}
            type="button"
            onClick={() => open(2)}
            aria-label={`Open photo 3 of ${uniqueImages.length}`}
          >
            <img
              src={thirdImage}
              alt={`${propertyName} photo 3`}
              loading="lazy"
              decoding="async"
            />
          </button>
        ) : (
          <div
            className={`${styles.placeholder} ${styles.secondary}`}
            aria-label="Additional property photo unavailable"
          />
        )}

        {hasImages ? (
          <button
            className={styles.viewAll}
            type="button"
            onClick={() => open(0)}
          >
            <span aria-hidden="true">▦</span>
            View all {uniqueImages.length} photo{uniqueImages.length === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>

      {activeIndex !== null && uniqueImages[activeIndex] ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${propertyName} photo gallery`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveIndex(null);
            }
          }}
        >
          <div className={styles.lightboxHeader}>
            <div>
              <strong>{propertyName}</strong>
              <span>
                {activeIndex + 1} of {uniqueImages.length}
              </span>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => setActiveIndex(null)}
              aria-label="Close photo gallery"
            >
              ×
            </button>
          </div>

          <div className={styles.lightboxStage}>
            {uniqueImages.length > 1 ? (
              <button
                type="button"
                className={`${styles.nav} ${styles.previous}`}
                onClick={previous}
                aria-label="Previous photo"
              >
                ‹
              </button>
            ) : null}

            <img
              className={styles.lightboxImage}
              src={uniqueImages[activeIndex]}
              alt={`${propertyName} photo ${activeIndex + 1}`}
            />

            {uniqueImages.length > 1 ? (
              <button
                type="button"
                className={`${styles.nav} ${styles.next}`}
                onClick={next}
                aria-label="Next photo"
              >
                ›
              </button>
            ) : null}
          </div>

          {uniqueImages.length > 1 ? (
            <div className={styles.thumbnails} aria-label="Photo thumbnails">
              {uniqueImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={index === activeIndex ? styles.activeThumb : ""}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show photo ${index + 1}`}
                >
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
