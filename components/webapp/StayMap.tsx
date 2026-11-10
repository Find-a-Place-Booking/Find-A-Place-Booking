"use client";
import React from "react";
import { StayMap as Map } from "@/components/StayMap";
import type { Stay } from "./GuestWebApp";
export function StayMap({
  stays,
  onSelect,
}: {
  stays: Stay[];
  onSelect: (stay: Stay) => void;
}) {
  React.useEffect(() => setArea(null), [stays]);
  const [area, setArea] = React.useState<Stay[] | null>(null);
  return (
    <section className="stack">
      {area ? (
        <>
          <button className="button secondary" onClick={() => setArea(null)}>
            ← Back to map
          </button>
          {area.map((stay) => (
            <button
              key={stay.slug}
              className="panel conversation"
              onClick={() => onSelect(stay)}
            >
              <strong>{stay.name}</strong>
              <span>From ${stay.startingNightlyUsd}/night</span>
            </button>
          ))}
        </>
      ) : (
        <Map
          stays={stays.map((s) => ({
            slug: s.slug,
            name: s.name,
            location: s.location,
            price: s.startingNightlyUsd,
            lat: s.lat,
            lng: s.lng,
            image: s.cover,
          }))}
          onClusterExpand={(items) =>
            setArea(
              items
                .map((i) => stays.find((s) => s.slug === i.slug))
                .filter((s): s is Stay => Boolean(s)),
            )
          }
        />
      )}
    </section>
  );
}
