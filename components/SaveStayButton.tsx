"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";

import {
  isStaySaved,
  setStaySaved,
  subscribeToSavedStays,
} from "@/lib/client/saved-stays";

export function SaveStayButton({
  propertyName,
  propertySlug,
  surface = "property_card",
}: {
  propertyName: string;
  propertySlug: string;
  surface?: string;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isStaySaved(propertySlug));

    return subscribeToSavedStays((slugs) => {
      setSaved(slugs.includes(propertySlug));
    });
  }, [propertySlug]);

  return (
    <button
      className={`heart ${saved ? "saved" : ""}`}
      aria-label={
        saved ? `Remove ${propertyName} from saved stays` : `Save ${propertyName}`
      }
      aria-pressed={saved}
      onClick={() => {
        const requestedSaved = !saved;
        const stored = setStaySaved(propertySlug, requestedSaved);
        const nextSaved = stored.includes(propertySlug);
        setSaved(nextSaved);

        track("stay_save_toggle", {
          slug: propertySlug,
          surface,
          action: nextSaved ? "saved" : "removed",
        });
      }}
      type="button"
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
