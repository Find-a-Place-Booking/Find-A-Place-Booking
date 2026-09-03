"use client";

import { useMemo, useState } from "react";
import { PropertyCard } from "./PropertyCard";
import type { Property } from "@/data/catalog";

const filterOptions = ["Cabin", "RV Site", "Hot tub", "Pet friendly", "Waterfront", "Under $250", "2+ bedrooms"];

export function StayResults({ properties, destination, guests }: { properties: Property[]; destination: string; guests: number }) {
  const [filters, setFilters] = useState<string[]>([]);
  const [sort, setSort] = useState("recommended");
  const [mapOpen, setMapOpen] = useState(true);

  const filtered = useMemo(() => {
    const normalized = destination.toLowerCase().trim();
    let result = properties.filter((property) => {
      const destinationMatch = !normalized || normalized.includes("anywhere") ||
        [property.location, property.city, property.state, property.region].join(" ").toLowerCase().includes(normalized);
      if (!destinationMatch || property.sleeps < guests) return false;
      return filters.every((filter) => {
        if (filter === "Cabin") return property.type === "Cabin";
        if (filter === "RV Site") return property.type === "RV Site";
        if (filter === "Under $250") return property.price < 250;
        if (filter === "2+ bedrooms") return property.bedrooms >= 2;
        return property.tags.includes(filter);
      });
    });
    if (sort === "price-low") result = [...result].sort((a, b) => a.price - b.price);
    if (sort === "rating") result = [...result].sort((a, b) => b.rating - a.rating);
    return result;
  }, [destination, filters, guests, properties, sort]);

  const toggleFilter = (filter: string) => {
    setFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
  };

  const inventoryEmpty = properties.length === 0;

  return (
    <>
      <div className="shell results-controls">
        <div className="chip-row">
          {filterOptions.map((filter) => <button className={filters.includes(filter) ? "active" : ""} onClick={() => toggleFilter(filter)} type="button" key={filter}>{filter}</button>)}
          {filters.length > 0 && <button className="clear-chip" onClick={() => setFilters([])} type="button">Clear</button>}
        </div>
        <div className="result-sort">
          <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="rating">Guest rating</option></select></label>
          <button className="map-toggle" type="button" onClick={() => setMapOpen((value) => !value)}>{mapOpen ? "Hide map" : "Show map"}</button>
        </div>
      </div>
      <div className={`results-layout shell-wide ${mapOpen ? "" : "map-hidden"}`}>
        <section>
          <div className="results-count"><strong>{filtered.length}</strong> stays available <span>· Live inventory will populate here as properties are approved</span></div>
          {filtered.length > 0 ? <div className="result-grid">{filtered.map((property) => <PropertyCard key={property.slug} property={property} />)}</div> :
            <div className="empty-results production-empty"><p className="eyebrow dark">{inventoryEmpty ? "Inventory setup" : "Nothing matched"}</p><h2>{inventoryEmpty ? "No stays are live in the production catalog yet." : "No stays match those filters."}</h2><p>{inventoryEmpty ? "Approved host properties will appear here automatically once the live catalog is connected." : "Try removing a filter or searching a nearby destination."}</p>{!inventoryEmpty && <button type="button" className="button button-quiet" onClick={() => setFilters([])}>Clear filters</button>}</div>}
        </section>
        {mapOpen && <aside className="map-shell" aria-label="Regional search map">
          <div className="map-label"><strong>Explore by area</strong><span>{filtered.length} stays shown</span></div>
          <div className="map-water water-one"/><div className="map-water water-two"/>
          <div className="map-line map-line-a"/><div className="map-line map-line-b"/><div className="map-line map-line-c"/>
          {filtered.slice(0, 7).map((property, index) => <a className={`map-pin mp${index + 1}`} href={`/stays/${property.slug}`} key={property.slug}>${property.price}</a>)}
          <div className="map-place one">Lake Ouachita</div><div className="map-place two">Hot Springs</div><div className="map-place three">Buffalo River</div><div className="map-place four">Branson</div>
        </aside>}
      </div>
    </>
  );
}
