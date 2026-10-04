"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, MapLayerMouseEvent } from "mapbox-gl";
import { track } from "@vercel/analytics";

import styles from "./StayMap.module.css";

export type StayMapItem = {
  slug: string;
  name: string;
  location: string;
  price: number;
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
  image?: string;
};

type Props = {
  stays: StayMapItem[];
  className?: string;
  emptyMessage?: string;
};

type MapPointFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown> | null;
};

function usableCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function pointCoordinates(
  feature: MapPointFeature | undefined,
): [number, number] | null {
  if (feature?.geometry?.type !== "Point") return null;
  const coordinates = feature.geometry.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (
    !usableCoordinate(lat, -90, 90) ||
    !usableCoordinate(lng, -180, 180)
  ) {
    return null;
  }
  return [lng, lat];
}

function stayImage(stay: StayMapItem) {
  return (
    stay.image ||
    `/api/public/stay-cover/${encodeURIComponent(stay.slug)}`
  );
}

function popupNode(stay: StayMapItem) {
  const card = document.createElement("a");
  card.className = "stay-map-popup";
  card.href = `/stays/${encodeURIComponent(stay.slug)}`;
  card.addEventListener("click", () => {
    track("property_click", {
      slug: stay.slug,
      surface: "map",
      trigger: "popup",
    });
  });

  const image = document.createElement("img");
  image.src = stayImage(stay);
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  card.appendChild(image);

  const copy = document.createElement("span");
  copy.className = "stay-map-popup-copy";

  const place = document.createElement("small");
  place.textContent = stay.location;
  copy.appendChild(place);

  const name = document.createElement("strong");
  name.textContent = stay.name;
  copy.appendChild(name);

  const meta = document.createElement("span");
  const rating =
    stay.rating && stay.reviews
      ? ` · ★ ${stay.rating.toFixed(1)} (${stay.reviews})`
      : "";
  meta.textContent = `$${Math.max(0, Math.round(stay.price))}/night${rating}`;
  copy.appendChild(meta);

  card.appendChild(copy);
  return card;
}

function clusterPopupNode(
  stays: StayMapItem[],
  pointCount: number,
  onZoom: () => void,
  onEnter: () => void,
  onLeave: () => void,
) {
  const root = document.createElement("div");
  root.className = styles.clusterPopup;
  root.addEventListener("mouseenter", onEnter);
  root.addEventListener("mouseleave", onLeave);

  const heading = document.createElement("div");
  heading.className = styles.clusterHeading;

  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("small");
  eyebrow.textContent = "Explore this area";
  const title = document.createElement("strong");
  title.textContent = `${pointCount} ${pointCount === 1 ? "stay" : "stays"} here`;
  titleWrap.append(eyebrow, title);

  const sort = document.createElement("select");
  sort.setAttribute("aria-label", "Sort stays in this map area");
  [
    ["recommended", "Recommended"],
    ["price-low", "Price: low to high"],
    ["price-high", "Price: high to low"],
    ["rating", "Guest rating"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    sort.appendChild(option);
  });
  heading.append(titleWrap, sort);

  const list = document.createElement("div");
  list.className = styles.clusterList;

  const render = (mode: string) => {
    const sorted = [...stays];
    if (mode === "price-low") sorted.sort((a, b) => a.price - b.price);
    if (mode === "price-high") sorted.sort((a, b) => b.price - a.price);
    if (mode === "rating") {
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    }

    list.replaceChildren();
    sorted.forEach((stay) => {
      const link = document.createElement("a");
      link.className = styles.clusterStay;
      link.href = `/stays/${encodeURIComponent(stay.slug)}`;
      link.addEventListener("click", () => {
        track("property_click", {
          slug: stay.slug,
          surface: "map_cluster",
          trigger: "cluster_list",
        });
      });

      const image = document.createElement("img");
      image.src = stayImage(stay);
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";

      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = stay.name;
      const location = document.createElement("small");
      location.textContent = stay.location;
      const meta = document.createElement("b");
      const rating =
        stay.rating && stay.reviews
          ? ` · ★ ${stay.rating.toFixed(1)}`
          : "";
      meta.textContent = `$${Math.max(0, Math.round(stay.price))}/night${rating}`;
      copy.append(name, location, meta);
      link.append(image, copy);
      list.appendChild(link);
    });
  };

  render("recommended");
  sort.addEventListener("change", () => render(sort.value));

  const footer = document.createElement("div");
  footer.className = styles.clusterFooter;
  const hint = document.createElement("span");
  hint.textContent = "Browse here or zoom in to separate the pins.";
  const zoom = document.createElement("button");
  zoom.type = "button";
  zoom.textContent = "Zoom into this area";
  zoom.addEventListener("click", onZoom);
  footer.append(hint, zoom);

  root.append(heading, list, footer);
  return root;
}

export function StayMap({
  stays,
  className = "",
  emptyMessage = "No mapped stays are available yet.",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || "";

  const mappedStays = useMemo(
    () =>
      stays.filter(
        (stay) =>
          usableCoordinate(stay.lat, -90, 90) &&
          usableCoordinate(stay.lng, -180, 180) &&
          !(stay.lat === 0 && stay.lng === 0),
      ),
    [stays],
  );

  useEffect(() => {
    if (!containerRef.current || !token || mappedStays.length === 0) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    async function mountMap() {
      const module = await import("mapbox-gl");
      if (disposed || !containerRef.current) return;

      const mapboxgl = module.default;
      mapboxgl.accessToken = token;

      const first = mappedStays[0];
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/outdoors-v12",
        center: [first.lng, first.lat],
        zoom: mappedStays.length === 1 ? 10 : 6,
        attributionControl: false,
      });

      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right",
      );

      const stayPopup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "310px",
        offset: 18,
      });
      const clusterPopup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: "400px",
        offset: 20,
        className: styles.clusterMapboxPopup,
      });

      let closeTimer: ReturnType<typeof setTimeout> | null = null;
      let activeClusterId: number | null = null;

      const cancelClusterClose = () => {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = null;
      };
      const scheduleClusterClose = () => {
        cancelClusterClose();
        closeTimer = setTimeout(() => {
          clusterPopup.remove();
          activeClusterId = null;
        }, 260);
      };

      const stayBySlug = new Map(mappedStays.map((stay) => [stay.slug, stay]));
      const geojson = {
        type: "FeatureCollection" as const,
        features: mappedStays.map((stay) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [stay.lng, stay.lat],
          },
          properties: {
            slug: stay.slug,
            priceLabel: `$${Math.max(0, Math.round(stay.price))}`,
          },
        })),
      };

      const bounds = new mapboxgl.LngLatBounds();
      mappedStays.forEach((stay) => bounds.extend([stay.lng, stay.lat]));

      map.on("load", () => {
        if (disposed) return;

        map.addSource("find-a-place-stays", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterMaxZoom: 10,
          clusterRadius: 48,
        });

        map.addLayer({
          id: "stay-clusters",
          type: "circle",
          source: "find-a-place-stays",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1d2d32",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20,
              10,
              24,
              50,
              30,
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "stay-cluster-count",
          type: "symbol",
          source: "find-a-place-stays",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        map.addLayer({
          id: "stay-points",
          type: "circle",
          source: "find-a-place-stays",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#1d2d32",
            "circle-radius": 22,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "stay-price-labels",
          type: "symbol",
          source: "find-a-place-stays",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["get", "priceLabel"],
            "text-size": 11,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#ffffff" },
        });

        if (mappedStays.length === 1) {
          map.jumpTo({ center: [first.lng, first.lat], zoom: 10 });
        } else {
          map.fitBounds(bounds, {
            padding: { top: 70, right: 60, bottom: 60, left: 60 },
            maxZoom: 10,
            duration: 0,
          });
        }
      });

      const openStay = (event: MapLayerMouseEvent) => {
        clusterPopup.remove();
        activeClusterId = null;
        const feature = event.features?.[0] as unknown as MapPointFeature | undefined;
        const slug = String(feature?.properties?.slug ?? "");
        const stay = stayBySlug.get(slug);
        const coordinates = pointCoordinates(feature);
        if (!stay || !coordinates) return;
        stayPopup.setLngLat(coordinates).setDOMContent(popupNode(stay)).addTo(map);
      };

      const openCluster = async (event: MapLayerMouseEvent) => {
        cancelClusterClose();
        stayPopup.remove();

        const feature = event.features?.[0] as unknown as MapPointFeature | undefined;
        const coordinates = pointCoordinates(feature);
        const clusterId = Number(feature?.properties?.cluster_id);
        const pointCount = Number(feature?.properties?.point_count || 0);
        if (!coordinates || !Number.isFinite(clusterId)) return;
        if (activeClusterId === clusterId && clusterPopup.isOpen()) return;

        const source = map.getSource("find-a-place-stays") as GeoJSONSource | undefined;
        if (!source) return;

        try {
          const leaves = await new Promise<any[]>(
            (resolve, reject) => {
              source.getClusterLeaves(
                clusterId,
                Math.max(1, Math.min(pointCount || mappedStays.length, 100)),
                0,
                (clusterError, features) => {
                  if (clusterError) reject(clusterError);
                  else resolve(features || []);
                },
              );
            },
          );
          if (disposed) return;

          const clusterStays = leaves.flatMap((leaf) => {
            const slug = String(leaf.properties?.slug ?? "");
            const stay = stayBySlug.get(slug);
            return stay ? [stay] : [];
          });
          if (!clusterStays.length) return;

          const zoomIn = async () => {
            try {
              const expansionZoom = await new Promise<number>(
                (resolve, reject) => {
                  source.getClusterExpansionZoom(
                    clusterId,
                    (zoomError, zoom) => {
                      if (zoomError) reject(zoomError);
                      else resolve(zoom ?? Math.min(map.getZoom() + 2, 13));
                    },
                  );
                },
              );
              clusterPopup.remove();
              activeClusterId = null;
              map.easeTo({
                center: coordinates,
                zoom: Math.min(expansionZoom, 13),
              });
              track("map_cluster_zoom", {
                count: pointCount,
                surface: "stay_map",
              });
            } catch {
              map.easeTo({
                center: coordinates,
                zoom: Math.min(map.getZoom() + 2, 13),
              });
            }
          };

          const node = clusterPopupNode(
            clusterStays,
            pointCount || clusterStays.length,
            () => void zoomIn(),
            cancelClusterClose,
            scheduleClusterClose,
          );

          activeClusterId = clusterId;
          clusterPopup.setLngLat(coordinates).setDOMContent(node).addTo(map);
          track("map_cluster_open", {
            count: pointCount || clusterStays.length,
            surface: "stay_map",
          });
        } catch (error) {
          console.error("[stay map cluster] unable to load cluster leaves", error);
        }
      };

      map.on("click", "stay-points", openStay);
      map.on("click", "stay-price-labels", openStay);
      map.on("click", "stay-clusters", (event) => void openCluster(event));

      const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if (hoverCapable) {
        map.on("mouseenter", "stay-clusters", (event) => {
          map.getCanvas().style.cursor = "pointer";
          void openCluster(event);
        });
        map.on("mouseleave", "stay-clusters", () => {
          map.getCanvas().style.cursor = "";
          scheduleClusterClose();
        });
      }

      ["stay-points", "stay-price-labels"].forEach((layer) => {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      clusterPopup.on("close", () => {
        activeClusterId = null;
        cancelClusterClose();
      });

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      cleanup = () => {
        resizeObserver.disconnect();
        cancelClusterClose();
        stayPopup.remove();
        clusterPopup.remove();
        map.remove();
      };
    }

    void mountMap();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [mappedStays, token]);

  if (!token) {
    return (
      <div className={`stay-map-fallback ${className}`}>
        <strong>Mapbox is ready to connect.</strong>
        <span>Add NEXT_PUBLIC_MAPBOX_TOKEN to this environment.</span>
      </div>
    );
  }

  if (mappedStays.length === 0) {
    return (
      <div className={`stay-map-fallback ${className}`}>
        <strong>No mapped stays yet.</strong>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return <div ref={containerRef} className={`stay-map ${className}`} />;
}
