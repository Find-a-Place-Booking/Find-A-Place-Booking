"use client";

import { useEffect, useRef, useState } from "react";

import type { NearbyExperiencePreview } from "@/data/catalog";
import styles from "./NearbyExperiencesPeek.module.css";

function distanceLabel(item: NearbyExperiencePreview) {
  const parts: string[] = [];
  if (typeof item.distanceMiles === "number" && Number.isFinite(item.distanceMiles)) {
    const miles =
      item.distanceMiles % 1 === 0
        ? item.distanceMiles.toFixed(0)
        : item.distanceMiles.toFixed(1);
    parts.push(`${miles} mi`);
  }
  if (typeof item.driveMinutes === "number" && item.driveMinutes > 0) {
    parts.push(`${item.driveMinutes} min`);
  }
  return parts.join(" · ");
}

export function NearbyExperiencesPeek({
  slug,
  count,
  items,
}: {
  slug: string;
  count: number;
  items: NearbyExperiencePreview[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!count || !items.length) return null;

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${open ? styles.open : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-label={`See ${count} nearby experience${count === 1 ? "" : "s"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⌖</span>
        <b>Nearby experiences</b>
        <small>{count}</small>
      </button>

      <div className={styles.popover} role="dialog" aria-label="Nearby experiences preview">
        <div className={styles.popoverHead}>
          <div>
            <span>Near this stay</span>
            <strong>
              {count} host-picked place{count === 1 ? "" : "s"}
            </strong>
          </div>
        </div>

        <div className={styles.items}>
          {items.slice(0, 3).map((item) => {
            const distance = distanceLabel(item);
            return (
              <div className={styles.item} key={`${item.title}-${item.category}`}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.category}</span>
                </div>
                {distance ? <small>{distance}</small> : null}
              </div>
            );
          })}
        </div>

        <a
          className={styles.viewAll}
          href={`/stays/${encodeURIComponent(slug)}#nearby-experiences`}
        >
          See all nearby experiences →
        </a>
      </div>
    </div>
  );
}
