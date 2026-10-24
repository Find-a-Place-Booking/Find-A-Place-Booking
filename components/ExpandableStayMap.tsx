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

/**
 * A lightweight interface around the existing live Mapbox map. It does not
 * replace or re-initialize Mapbox when the visitor enlarges the map.
 *
 * The current cluster popup is owned by StayMap. Enhance only its existing
 * "Zoom into this area" footer so no changes to map data or booking code are
 * needed. Mapbox can recreate popup DOM; the MutationObserver handles that.
 */
export function ExpandableStayMap({ stays, className = "", emptyMessage }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const mapButtonRef = useRef<HTMLButtonElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [areaStays, setAreaStays] = useState<StayMapItem[] | null>(null);
  const [sort, setSort] = useState<SortMode>("recommended");

  // Don't remount the underlying map when expanding or viewing stay details.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const stayBySlug = new Map(stays.map((stay) => [stay.slug, stay]));

    const enhanceClusterPopups = () => {
      for (const popup of frame.querySelectorAll<HTMLElement>(".mapboxgl-popup")) {
        const zoomButton = Array.from(popup.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => button.textContent?.trim() === "Zoom into this area");
        const footer = zoomButton?.parentElement;
        if (!footer || footer.querySelector("[data-fap-map-expand]")) continue;

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Open larger view";
        button.dataset.fapMapExpand = "1";
        button.setAttribute("aria-label", "View stays from this cluster in a larger map");
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const seen = new Set<string>();
          const matched: StayMapItem[] = [];
          for (const link of popup.querySelectorAll<HTMLAnchorElement>('a[href^="/stays/"]')) {
            const slug = decodeURIComponent(link.pathname.split("/").filter(Boolean).at(-1) ?? "");
            const stay = stayBySlug.get(slug);
            if (stay && !seen.has(slug)) {
              seen.add(slug);
              matched.push(stay);
            }
          }
          if (!matched.length) return;

          // Close the small bubble; the same Mapbox map remains mounted behind
          // the expanded panel, keeping its location and zoom level.
          popup.querySelector<HTMLButtonElement>(".mapboxgl-popup-close-button")?.click();
          setSort("recommended");
          setAreaStays(matched);
          setExpanded(true);
          track("map_cluster_expanded", { surface: "home_map", count: matched.length });
        });
        footer.classList.add(styles.enhancedFooter);
        footer.appendChild(button);
      }
    };

    const observer = new MutationObserver(enhanceClusterPopups);
    observer.observe(frame, { subtree: true, childList: true });
    enhanceClusterPopups();
    return () => observer.disconnect();
  }, [stays]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (areaStays) setAreaStays(null);
      else setExpanded(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [expanded, areaStays]);

  useEffect(() => {
    if (areaStays) backButtonRef.current?.focus();
  }, [areaStays]);

  const sortedStays = useMemo(() => {
    const result = [...(areaStays ?? [])];
    if (sort === "price-low") result.sort((a, b) => a.price - b.price);
    if (sort === "price-high") result.sort((a, b) => b.price - a.price);
    if (sort === "rating") result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return result;
  }, [areaStays, sort]);

  return (
    <div
      ref={frameRef}
      className={`stay-map ${className} ${styles.frame} ${expanded ? styles.fullscreen : ""}`}
      aria-label="Find A Place stay map"
    >
      <StayMap stays={stays} emptyMessage={emptyMessage} className={styles.mapCanvas} />

      <button
        ref={mapButtonRef}
        type="button"
        className={styles.mapToggle}
        onClick={() => {
          if (expanded) {
            setAreaStays(null);
            setExpanded(false);
          } else {
            setExpanded(true);
            track("map_fullscreen_open", { surface: "home_map" });
          }
        }}
        aria-label={expanded ? "Close larger map" : "Open larger map"}
        aria-expanded={expanded}
      >
        {expanded ? "× Close map" : "⛶ Larger map"}
      </button>

      {areaStays ? (
        <section className={styles.areaPanel} aria-label="Stays in this map area">
          <div className={styles.panelHeader}>
            <button
              ref={backButtonRef}
              type="button"
              className={styles.backButton}
              onClick={() => {
                setAreaStays(null);
                mapButtonRef.current?.focus();
              }}
            >
              ← Back to map
            </button>
            <h3>Stays in this area</h3>
            <p>{areaStays.length} {areaStays.length === 1 ? "place" : "places"} to explore</p>
            <label className={styles.sortRow}>
              <span>Sort stays</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="rating">Guest rating</option>
              </select>
            </label>
          </div>
          <div className={styles.stayList}>
            {sortedStays.map((stay) => (
              <a
                href={`/stays/${encodeURIComponent(stay.slug)}`}
                className={styles.stayCard}
                key={stay.slug}
                onClick={() => track("property_click", {
                  slug: stay.slug,
                  surface: "map_expanded",
                  trigger: "cluster_list",
                })}
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
                  <b>${Math.max(0, Math.round(stay.price))}/night
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
