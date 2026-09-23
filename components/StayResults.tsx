"use client";

import { useMemo, useState } from "react";
import { PropertyCard } from "./PropertyCard";
import { DeferredStayMap } from "./DeferredStayMap";
import {
  propertyMatchesDestination,
  type Property,
} from "@/data/catalog";

const filterOptions = [
  "Cabin",
  "RV Site",
  "Hot tub",
  "Pet friendly",
  "Waterfront",
  "Under $250",
  "2+ bedrooms",
];

export function StayResults({
  properties,
  destination,
  guests,
  initialFilter = "",
  inventoryAvailable = properties.length > 0,
}: {
  properties: Property[];
  destination: string;
  guests: number;
  initialFilter?: string;
  inventoryAvailable?: boolean;
}) {
  const [filters, setFilters] = useState<string[]>(() =>
    filterOptions.includes(initialFilter) ? [initialFilter] : [],
  );
  const [sort, setSort] = useState("recommended");
  const [mapOpen, setMapOpen] = useState(true);

  const filtered = useMemo(() => {
    let result = properties.filter((property) => {
      const destinationMatch = propertyMatchesDestination(
        property,
        destination,
      );

      if (!destinationMatch || property.sleeps < guests) return false;

      return filters.every((filter) => {
        if (filter === "Cabin") return property.type === "Cabin";
        if (filter === "RV Site") return property.type === "RV Site";
        if (filter === "Under $250") return property.price < 250;
        if (filter === "2+ bedrooms") return property.bedrooms >= 2;
        return property.tags.includes(filter);
      });
    });

    if (sort === "price-low") {
      result = [...result].sort((a, b) => a.price - b.price);
    }
    if (sort === "rating") {
      result = [...result].sort((a, b) => b.rating - a.rating);
    }
    return result;
  }, [destination, filters, guests, properties, sort]);

  const toggleFilter = (filter: string) => {
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter],
    );
  };

  const inventoryEmpty = !inventoryAvailable;

  return (
    <>
      <div className="shell results-controls">
        <div className="chip-row">
          {filterOptions.map((filter) => (
            <button
              className={filters.includes(filter) ? "active" : ""}
              onClick={() => toggleFilter(filter)}
              type="button"
              key={filter}
            >
              {filter}
            </button>
          ))}
          {filters.length > 0 && (
            <button
              className="clear-chip"
              onClick={() => setFilters([])}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
        <div className="result-sort">
          <label>
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recommended">Recommended</option>
              <option value="price-low">Price: low to high</option>
              <option value="rating">Guest rating</option>
            </select>
          </label>
          <button
            className="map-toggle"
            type="button"
            onClick={() => setMapOpen((value) => !value)}
          >
            {mapOpen ? "Hide map" : "Show map"}
          </button>
        </div>
      </div>

      <div className={`results-layout shell-wide ${mapOpen ? "" : "map-hidden"}`}>
        <section>
          <div className="results-count">
            <strong>{filtered.length}</strong>{" "}
            {filtered.length === 1 ? "stay" : "stays"}{" "}
            <span>· Availability is rechecked again before checkout</span>
          </div>

          {filtered.length > 0 ? (
            <div className="result-grid">
              {filtered.map((property) => (
                <PropertyCard key={property.slug} property={property} />
              ))}
            </div>
          ) : (
            <div className="empty-results production-empty">
              <p className="eyebrow dark">
                {inventoryEmpty ? "More places are coming" : "Nothing matched"}
              </p>
              <h2>
                {inventoryEmpty
                  ? "We’re still getting the first places ready."
                  : "No stays match those filters."}
              </h2>
              <p>
                {inventoryEmpty
                  ? "New stays will show up here as hosts finish getting them ready."
                  : "Try removing a filter or searching a nearby destination."}
              </p>
              {!inventoryEmpty && (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setFilters([])}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>

        {mapOpen && (
          <aside className="map-shell live-map" aria-label="Regional search map">
            <div className="map-label">
              <strong>Map view</strong>
              <span>
                {filtered.length} {filtered.length === 1 ? "stay" : "stays"}
              </span>
            </div>
            <DeferredStayMap
              stays={filtered}
              emptyMessage="Try a different destination or filter to see mapped stays."
            />
          </aside>
        )}
      </div>
    </>
  );
}
