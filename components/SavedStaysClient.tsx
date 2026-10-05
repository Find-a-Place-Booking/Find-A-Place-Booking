"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PropertyCard } from "@/components/PropertyCard";
import type { Property } from "@/data/catalog";
import {
  readSavedStaySlugs,
  subscribeToSavedStays,
} from "@/lib/client/saved-stays";

import styles from "./SavedStaysClient.module.css";

export function SavedStaysClient() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [stays, setStays] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    async (nextSlugs: string[], showLoading = true) => {
      setSlugs(nextSlugs);

      if (!nextSlugs.length) {
        setStays([]);
        setLoading(false);
        return;
      }

      if (showLoading) {
        setLoading(true);
      } else {
        setStays((current) => {
          const bySlug = new Map(
            current.map((property) => [property.slug, property]),
          );
          return nextSlugs
            .map((slug) => bySlug.get(slug))
            .filter((property): property is Property => Boolean(property));
        });
      }

      try {
      const query = new URLSearchParams({
        slugs: nextSlugs.join(","),
      });
      const response = await fetch(
        `/api/public/saved-stays?${query.toString()}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load saved stays.");
      }

      setStays(Array.isArray(payload?.stays) ? payload.stays : []);
      } catch {
        if (showLoading) setStays([]);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const initial = readSavedStaySlugs();
    void refresh(initial, true);

    return subscribeToSavedStays((next) => {
      void refresh(next, false);
    });
  }, [refresh]);

  if (loading) {
    return (
      <div className={styles.state}>
        <strong>Loading your saved stays…</strong>
        <span>Pulling the latest public listing details.</span>
      </div>
    );
  }

  if (!slugs.length) {
    return (
      <div className={styles.state}>
        <strong>No saved stays yet.</strong>
        <span>
          Tap the heart on a stay you like and it will stay here on this device.
        </span>
        <Link className="button button-small" href="/stays">
          Browse stays
        </Link>
      </div>
    );
  }

  if (!stays.length) {
    return (
      <div className={styles.state}>
        <strong>Your saved stays are not available right now.</strong>
        <span>
          They may have been unpublished or the latest listing details could not
          be loaded.
        </span>
        <Link className="button button-small" href="/stays">
          Browse current stays
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.summary}>
        <strong>
          {stays.length} saved stay{stays.length === 1 ? "" : "s"}
        </strong>
        <span>
          Saved on this device · current prices and listing details are refreshed
          when you open this page.
        </span>
      </div>

      <div className={styles.grid}>
        {stays.map((property) => (
          <PropertyCard
            key={property.slug}
            property={property}
            surface="saved_stays"
          />
        ))}
      </div>
    </>
  );
}
