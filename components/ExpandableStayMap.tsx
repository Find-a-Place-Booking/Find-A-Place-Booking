"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";

import { StayMap, type StayMapItem } from "./StayMap";
import styles from "./ExpandableStayMap.module.css";

type Props = {
  stays: StayMapItem[];
  className?: string;
  emptyMessage?: string;
};

type SortMode = "recommended" | "price-low" | "price-high" | "rating";

type ExpandedBubble = {
  stays: StayMapItem[];
  totalInBubble: number;
};

/**
 * Keep the ORIGINAL stay map and its small Mapbox cluster bubbles.
 * The added "Expand bubble" action turns just that cluster into a roomy,
 * scrollable panel inside the same map frame; it never enlarges the map or
 * opens a separate map screen. Back to map closes the panel and restores pins.
 *
 * StayMap owns the popup action and requests every cluster leaf on demand;
 * this wrapper owns only the expanded panel and compact-popup styling.
 */
export function ExpandableStayMap({ stays, className = "", emptyMessage }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const [expandedBubble, setExpandedBubble] = useState<ExpandedBubble | null>(null);
  const [sort, setSort] = useState<SortMode>("recommended");

  const openExpandedBubble = useCallback((clusterStays: StayMapItem[], totalInBubble: number) => {
    setSort("recommended");
    setExpandedBubble({ stays: clusterStays, totalInBubble });
    track("map_cluster_bubble_expanded", {
      surface: "home_map",
      count: clusterStays.length,
    });
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    // Styling is the only DOM enhancement now. The actual expand handler is
    // owned by StayMap so it can retrieve all map data, not just popup links.
    const enhanceClusterBubbles = () => {
      for (const popup of frame.querySelectorAll<HTMLElement>(".mapboxgl-popup")) {
        const sortSelect = popup.querySelector<HTMLSelectElement>(
          'select[aria-label="Sort stays in this map area"]',
        );
        const heading = sortSelect?.parentElement;
        const root = heading?.parentElement;
        const list = heading?.nextElementSibling as HTMLElement | null;
        if (!heading || !root || !list || heading.dataset.fapEnhanced === "1") continue;
        heading.dataset.fapEnhanced = "1";

        root.style.setProperty(
          "--fap-map-frame-height",
          `${Math.max(280, Math.round(frame.getBoundingClientRect().height))}px`,
        );
        root.classList.add(styles.fittedClusterPopup);
        heading.classList.add(styles.enhancedHeading);
        list.classList.add(styles.scrollablePopupList);
        const expand = heading.querySelector<HTMLButtonElement>("[data-fap-expand-bubble]");
        if (expand) expand.classList.add(styles.popupExpandButton);

        const keepScrollInList = (event: Event) => event.stopPropagation();
        list.addEventListener("wheel", keepScrollInList, { passive: true });
        list.addEventListener("touchstart", keepScrollInList, { passive: true });
        list.addEventListener("touchmove", keepScrollInList, { passive: true });
        list.addEventListener("pointerdown", keepScrollInList);
        list.addEventListener("mousedown", keepScrollInList);
      }
    };

    const observer = new MutationObserver(enhanceClusterBubbles);
    observer.observe(frame, { childList: true, subtree: true });
    enhanceClusterBubbles();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!expandedBubble) return;
    backButtonRef.current?.focus();
  }, [expandedBubble]);

  useEffect(() => {
    if (!expandedBubble) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExpandedBubble(null);
      frameRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedBubble]);

  const sortedStays = useMemo(() => {
    const result = [...(expandedBubble?.stays ?? [])];
    if (sort === "price-low") result.sort((a, b) => a.price - b.price);
    if (sort === "price-high") result.sort((a, b) => b.price - a.price);
    if (sort === "rating") result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return result;
  }, [expandedBubble, sort]);

  function closeBubble() {
    setExpandedBubble(null);
    // Return keyboard focus to the existing map, not a different screen.
    frameRef.current?.focus();
  }

  return (
    <div
      ref={frameRef}
      tabIndex={-1}
      className={`stay-map ${className} ${styles.frame}`}
      aria-label="Find A Place stay map"
    >
      <div className={styles.mapCanvas} inert={Boolean(expandedBubble)}>
        <StayMap stays={stays} emptyMessage={emptyMessage} className={styles.innerMap} onClusterExpand={openExpandedBubble} />
      </div>

      {expandedBubble ? (
        <section
          className={styles.expandedBubble}
          aria-label="Expanded list of stays in this map bubble"
        >
          <header className={styles.bubbleHeader}>
            <button
              ref={backButtonRef}
              className={styles.backButton}
              type="button"
              onClick={closeBubble}
            >
              ← Back to map
            </button>
            <div className={styles.bubbleHeading}>
              <span className={styles.eyebrow}>Explore this area</span>
              <h3>Stays in this bubble</h3>
              <p>
                {expandedBubble.totalInBubble > expandedBubble.stays.length
                  ? `${expandedBubble.stays.length} of ${expandedBubble.totalInBubble} stays shown`
                  : `${expandedBubble.stays.length} ${expandedBubble.stays.length === 1 ? "stay" : "stays"} to explore`}
              </p>
            </div>
            <label className={styles.sortRow}>
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="rating">Guest rating</option>
              </select>
            </label>
          </header>

          <div className={styles.bubbleList}>
            {sortedStays.map((stay) => (
              <a
                href={`/stays/${encodeURIComponent(stay.slug)}`}
                className={styles.stayCard}
                key={stay.slug}
                onClick={() =>
                  track("property_click", {
                    slug: stay.slug,
                    surface: "map_bubble_expanded",
                    trigger: "expanded_bubble_stay",
                  })
                }
              >
                <img
                  src={`/api/public/stay-cover/${encodeURIComponent(stay.slug)}`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    const image = event.currentTarget;
                    if (image.dataset.fallback === "1") return;
                    image.dataset.fallback = "1";
                    image.src = "/brand/find-a-place-seal.png";
                  }}
                />
                <span className={styles.stayCopy}>
                  <strong>{stay.name}</strong>
                  <small>{stay.location}</small>
                  <b>
                    ${Math.max(0, Math.round(stay.price))}/night
                    {stay.rating && stay.reviews ? ` · ★ ${stay.rating.toFixed(1)}` : ""}
                  </b>
                  <em>View stay →</em>
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
