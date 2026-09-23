"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MapLayerMouseEvent } from "mapbox-gl";

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

function usableCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max;
}

type MapPointFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown> | null;
};

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

function popupNode(stay: StayMapItem) {
  const card = document.createElement("a");
  card.className = "stay-map-popup";
  card.href = `/stays/${encodeURIComponent(stay.slug)}`;

  if (stay.image) {
    const image = document.createElement("img");
    image.src = stay.image;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    card.appendChild(image);
  }

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

      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "310px",
        offset: 18,
      });

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
          paint: {
            "text-color": "#ffffff",
          },
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
          paint: {
            "text-color": "#ffffff",
          },
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
        const feature = event.features?.[0] as unknown as
          | MapPointFeature
          | undefined;
        const slug = String(feature?.properties?.slug ?? "");
        const stay = stayBySlug.get(slug);
        const coordinates = pointCoordinates(feature);
        if (!stay || !coordinates) return;

        popup.setLngLat(coordinates).setDOMContent(popupNode(stay)).addTo(map);
      };

      const expandCluster = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0] as unknown as
          | MapPointFeature
          | undefined;
        const coordinates = pointCoordinates(feature);
        if (!coordinates) return;

        map.easeTo({
          center: coordinates,
          zoom: Math.min(map.getZoom() + 2, 12),
        });
      };

      map.on("click", "stay-points", openStay);
      map.on("click", "stay-price-labels", openStay);
      map.on("click", "stay-clusters", expandCluster);

      const interactiveLayers = [
        "stay-points",
        "stay-price-labels",
        "stay-clusters",
      ];
      const enter = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const leave = () => {
        map.getCanvas().style.cursor = "";
      };
      interactiveLayers.forEach((layer) => {
        map.on("mouseenter", layer, enter);
        map.on("mouseleave", layer, leave);
      });

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      cleanup = () => {
        resizeObserver.disconnect();
        popup.remove();
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
