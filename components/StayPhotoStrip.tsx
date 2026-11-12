"use client";

import { useRef, useState } from "react";
import styles from "./StayPhotoStrip.module.css";

type Props = { images: string[]; propertyName: string };

export function StayPhotoStrip({ images, propertyName }: Props) {
  const photos = images.filter((image) => typeof image === "string" && image.length > 0);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (!photos.length) return null;

  const go = (target: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, target));
    const element = track.current;
    setIndex(next);
    if (element) element.scrollTo({ left: element.clientWidth * next, behavior: "smooth" });
  };

  const handleScroll = () => {
    const element = track.current;
    if (!element || !element.clientWidth) return;
    setIndex(Math.min(photos.length - 1, Math.max(0, Math.round(element.scrollLeft / element.clientWidth))));
  };

  return (
    <section className={styles.gallery} aria-label={`${propertyName} photo gallery`}>
      <div
        ref={track}
        className={styles.track}
        onScroll={handleScroll}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); go(index + 1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
        }}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={`Swipe to browse ${photos.length} property photos`}
      >
        {photos.map((src, photoIndex) => (
          <img
            className={styles.photo}
            src={src}
            key={`${photoIndex}-${src}`}
            alt={`${propertyName}, photo ${photoIndex + 1} of ${photos.length}`}
            loading={photoIndex === 0 ? "eager" : "lazy"}
            draggable={false}
          />
        ))}
      </div>
      {photos.length > 1 ? (
        <>
          <button className={`${styles.arrow} ${styles.previous}`} type="button" aria-label="Previous photo" onClick={() => go(index - 1)} disabled={index === 0}>‹</button>
          <button className={`${styles.arrow} ${styles.next}`} type="button" aria-label="Next photo" onClick={() => go(index + 1)} disabled={index === photos.length - 1}>›</button>
          <span className={styles.counter} aria-live="polite">{index + 1} / {photos.length}</span>
        </>
      ) : null}
    </section>
  );
}
