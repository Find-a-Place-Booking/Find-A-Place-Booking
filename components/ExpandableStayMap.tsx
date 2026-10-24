"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
 * The existing StayMap component owns its popup DOM, so we attach the action
 * to the existing bubble rather than replacing or re-initializing Mapbox.
 */
export function ExpandableStayMap({ stays, className = "", emptyMessage }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const [expandedBubble, setExpandedBubble] = useState<ExpandedBubble | null>(null);
  const [sort, setSort] = useState<SortMode>("recommended");

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const stayBySlug = new Map(stays.map((stay) => [stay.slug, stay]));

    const enhanceClusterBubbles = () => {
      for (const popup of frame.querySelectorAll<HTMLElement>(".mapboxgl-popup")) {
        // Identify a cluster by its accessible sort selector, not by a
        // footer button that can be pushed out of view on short maps.
        const sortSelect = popup.querySelector<HTMLSelectElement>(
          'select[aria-label="Sort stays in this map area"]',
        );
        const heading = sortSelect?.parentElement;
        const root = heading?.parentElement;
        const list = heading?.nextElementSibling as HTMLElement | null;
        if (!heading || !root || !list || heading.querySelector("[data-fap-expand-bubble]")) continue;

        // Size the scrolling list to the existing map frame and keep the
        // expand action in the ALWAYS VISIBLE popup header.
        root.style.setProperty(
          "--fap-map-frame-height",
          `${Math.max(280, Math.round(frame.getBoundingClientRect().height))}px`,
        );
        root.classList.add(styles.fittedClusterPopup);
        heading.classList.add(styles.enhancedHeading);
        list.classList.add(styles.scrollablePopupList);

        // Mapbox listens for wheel / touch / drag gestures on the map.
        // Keep those events inside the popup list so scrolling the stays
        // doesn't pan or zoom the underlying map.
        const keepScrollInList = (event: Event) => event.stopPropagation();
        list.addEventListener("wheel", keepScrollInList, { passive: true });
        list.addEventListener("touchstart", keepScrollInList, { passive: true });
        list.addEventListener("touchmove", keepScrollInList, { passive: true });
        list.addEventListener("pointerdown", keepScrollInList);
        list.addEventListener("mousedown", keepScrollInList);

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Expand this bubble ↗";
        button.className = styles.popupExpandButton;
        button.dataset.fapExpandBubble = "1";
        button.setAttribute("aria-label", "Expand the stays in this map bubble");

        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const matched: StayMapItem[] = [];
          const foundSlugs = new Set<string>();
          for (const link of popup.querySelectorAll<HTMLAnchorElement>('a[href^="/stays/"]')) {
            const rawSlug = link.pathname.split("/").filter(Boolean).at(-1) ?? "";
            let slug = rawSlug;
            try {
              slug = decodeURIComponent(rawSlug);
            } catch {
              continue;
            }
            const stay = stayBySlug.get(slug);
            if (stay && !foundSlugs.has(slug)) {
              foundSlugs.add(slug);
              matched.push(stay);
            }
          }
          if (matched.length === 0) return;

          const heading = popup.querySelector("strong")?.textContent ?? "";
          const parsedCount = Number.parseInt(heading, 10);
          const totalInBubble = Number.isFinite(parsedCount)
            ? Math.max(parsedCount, matched.length)
            : matched.length;

          // Close the small bubble, but DO NOT change the Mapbox viewport,
          // the size of the map, or the map component's mounted state.
          popup.querySelector<HTMLButtonElement>(".mapboxgl-popup-close-button")?.click();
          setSort("recommended");
          setExpandedBubble({ stays: matched, totalInBubble });
          track("map_cluster_bubble_expanded", {
            surface: "home_map",
            count: matched.length,
          });
        });

        heading.appendChild(button);
      }
    };

    const observer = new MutationObserver(enhanceClusterBubbles);
    observer.observe(frame, { childList: true, subtree: true });
    enhanceClusterBubbles();
    return () => observer.disconnect();
  }, [stays]);

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
        <StayMap stays={stays} emptyMessage={emptyMessage} className={styles.innerMap} />
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
