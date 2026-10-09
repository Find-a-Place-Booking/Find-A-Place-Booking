"use client";

import { useEffect, useState } from "react";

import galleryStyles from "./PropertyGallery.module.css";
import styles from "./PropertyMediaGallery.module.css";

type VideoMedia = {
  url: string;
  contentType: string;
  isPrimary: boolean;
};

export function PropertyMediaGalleryClient({
  propertyName,
  images,
  video,
}: {
  propertyName: string;
  images: string[];
  video: VideoMedia | null;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  const uniqueImages = Array.from(
    new Set(images.filter((image): image is string => Boolean(image))),
  );
  const mainImage = uniqueImages[0];
  const primaryVideo = Boolean(video?.isPrimary);
  const secondImage = primaryVideo ? uniqueImages[0] : uniqueImages[1];
  const thirdImage = primaryVideo
    ? uniqueImages[1]
    : video
      ? uniqueImages[1]
      : uniqueImages[2];

  useEffect(() => {
    if (activeIndex === null && !videoOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
        setVideoOpen(false);
        return;
      }

      if (videoOpen || activeIndex === null || uniqueImages.length < 2) return;

      if (event.key === "ArrowLeft") {
        setActiveIndex(
          (current) =>
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
  }, [activeIndex, videoOpen, uniqueImages.length]);

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

  function photoButton(
    image: string | undefined,
    index: number,
    className: string,
  ) {
    return image ? (
      <button
        className={`${galleryStyles.photoButton} ${className}`}
        type="button"
        onClick={() => open(index)}
        aria-label={`Open photo ${index + 1} of ${uniqueImages.length}`}
      >
        <img
          src={image}
          alt={`${propertyName} photo ${index + 1}`}
          loading={index === 0 && !primaryVideo ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={index === 0 && !primaryVideo ? "high" : undefined}
        />
      </button>
    ) : (
      <div
        className={`${galleryStyles.placeholder} ${className}`}
        aria-label="Additional property photo unavailable"
      />
    );
  }

  return (
    <>
      <div className={`shell ${galleryStyles.gallery}`}>
        {primaryVideo && video ? (
          <div className={`${galleryStyles.main} ${styles.primaryVideo}`}>
            <video
              src={video.url}
              controls
              playsInline
              preload="metadata"
              poster={mainImage || undefined}
              aria-label={`${propertyName} property video`}
            />
            <span className={styles.videoLabel}>Property video</span>
          </div>
        ) : mainImage ? (
          photoButton(mainImage, 0, galleryStyles.main)
        ) : (
          <div
            className={`${galleryStyles.placeholder} ${galleryStyles.main}`}
            aria-label="Property photo unavailable"
          />
        )}

        {!primaryVideo && video ? (
          <button
            type="button"
            className={`${galleryStyles.photoButton} ${galleryStyles.secondary} ${styles.videoPreview}`}
            onClick={() => setVideoOpen(true)}
            aria-label={`Watch ${propertyName} property video`}
          >
            {mainImage ? <img src={mainImage} alt="" aria-hidden="true" /> : null}
            <span className={styles.playMark}>▶</span>
            <span className={styles.videoLabel}>Property video</span>
          </button>
        ) : (
          photoButton(
            secondImage,
            primaryVideo ? 0 : 1,
            galleryStyles.secondary,
          )
        )}

        {photoButton(
          thirdImage,
          primaryVideo ? 1 : video ? 1 : 2,
          galleryStyles.secondary,
        )}

        {video && !primaryVideo ? (
          <button
            type="button"
            className={styles.watchVideo}
            onClick={() => setVideoOpen(true)}
          >
            ▶ Watch video
          </button>
        ) : null}

        {uniqueImages.length ? (
          <button
            className={galleryStyles.viewAll}
            type="button"
            onClick={() => open(0)}
          >
            <span aria-hidden="true">▦</span>
            View all {uniqueImages.length} photo{uniqueImages.length === 1 ? "" : "s"}
          </button>
        ) : null}
      </div>

      {videoOpen && video ? (
        <div
          className={styles.videoLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${propertyName} property video`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setVideoOpen(false);
          }}
        >
          <div className={styles.videoLightboxHeader}>
            <strong>{propertyName}</strong>
            <button
              type="button"
              onClick={() => setVideoOpen(false)}
              aria-label="Close property video"
            >
              ×
            </button>
          </div>
          <div className={styles.videoLightboxStage}>
            <video
              src={video.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster={mainImage || undefined}
            />
          </div>
        </div>
      ) : null}

      {activeIndex !== null && uniqueImages[activeIndex] ? (
        <div
          className={galleryStyles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${propertyName} photo gallery`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveIndex(null);
          }}
        >
          <div className={galleryStyles.lightboxHeader}>
            <div>
              <strong>{propertyName}</strong>
              <span>
                {activeIndex + 1} of {uniqueImages.length}
              </span>
            </div>
            <button
              type="button"
              className={galleryStyles.close}
              onClick={() => setActiveIndex(null)}
              aria-label="Close photo gallery"
            >
              ×
            </button>
          </div>

          <div className={galleryStyles.lightboxStage}>
            {uniqueImages.length > 1 ? (
              <button
                type="button"
                className={`${galleryStyles.nav} ${galleryStyles.previous}`}
                onClick={previous}
                aria-label="Previous photo"
              >
                ‹
              </button>
            ) : null}

            <img
              className={galleryStyles.lightboxImage}
              src={uniqueImages[activeIndex]}
              alt={`${propertyName} photo ${activeIndex + 1}`}
            />

            {uniqueImages.length > 1 ? (
              <button
                type="button"
                className={`${galleryStyles.nav} ${galleryStyles.next}`}
                onClick={next}
                aria-label="Next photo"
              >
                ›
              </button>
            ) : null}
          </div>

          {uniqueImages.length > 1 ? (
            <div className={galleryStyles.thumbnails} aria-label="Photo thumbnails">
              {uniqueImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  className={index === activeIndex ? galleryStyles.activeThumb : ""}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show photo ${index + 1}`}
                >
                  <img src={image} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
