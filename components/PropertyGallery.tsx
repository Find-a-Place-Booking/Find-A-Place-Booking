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
  const hasImages = images.length > 0;
  const mainImage = images[0];
  const secondImage = images[1] ?? mainImage;
  const thirdImage = images[2] ?? mainImage;

  useEffect(() => {
    if (activeIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
        return;
      }

      if (images.length < 2) return;

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) =>
          current === null
            ? 0
            : (current - 1 + images.length) % images.length,
        );
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) =>
          current === null ? 0 : (current + 1) % images.length,
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, images.length]);

  function open(index: number) {
    if (!images[index]) return;
    setActiveIndex(index);
  }

  function previous() {
    setActiveIndex((current) =>
      current === null
        ? 0
        : (current - 1 + images.length) % images.length,
    );
  }

  function next() {
    setActiveIndex((current) =>
      current === null ? 0 : (current + 1) % images.length,
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
            aria-label={`Open photo 1 of ${images.length}`}
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
            onClick={() => open(images[1] ? 1 : 0)}
            aria-label={`Open photo ${images[1] ? 2 : 1} of ${images.length}`}
          >
            <img
              src={secondImage}
              alt={`${propertyName} photo ${images[1] ? 2 : 1}`}
              loading="lazy"
              decoding="async"
            />
          </button>
        ) : (
          <div
            className={`${styles.placeholder} ${styles.secondary}`}
            aria-label="Property photo unavailable"
          />
        )}

        {thirdImage ? (
          <button
            className={`${styles.photoButton} ${styles.secondary}`}
            type="button"
            onClick={() => open(images[2] ? 2 : 0)}
            aria-label={`Open photo ${images[2] ? 3 : 1} of ${images.length}`}
          >
            <img
              src={thirdImage}
              alt={`${propertyName} photo ${images[2] ? 3 : 1}`}
              loading="lazy"
              decoding="async"
            />
          </button>
        ) : (
          <div
            className={`${styles.placeholder} ${styles.secondary}`}
            aria-label="Property photo unavailable"
          />
        )}

        {hasImages ? (
          <button
            className={styles.viewAll}
            type="button"
            onClick={() => open(0)}
          >
            <span aria-hidden="true">▦</span>
            View all {images.length} photo{images.length === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>

      {activeIndex !== null && images[activeIndex] ? (
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
                {activeIndex + 1} of {images.length}
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
            {images.length > 1 ? (
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
              src={images[activeIndex]}
              alt={`${propertyName} photo ${activeIndex + 1}`}
            />

            {images.length > 1 ? (
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

          {images.length > 1 ? (
            <div className={styles.thumbnails} aria-label="Photo thumbnails">
              {images.map((image, index) => (
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
