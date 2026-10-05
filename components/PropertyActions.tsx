"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";

import {
  isStaySaved,
  setStaySaved,
  subscribeToSavedStays,
} from "@/lib/client/saved-stays";

export function PropertyActions({
  propertyName = "",
  propertySlug = "",
}: {
  propertyName?: string;
  propertySlug?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!propertySlug) return;

    setSaved(isStaySaved(propertySlug));

    return subscribeToSavedStays((slugs) => {
      setSaved(slugs.includes(propertySlug));
    });
  }, [propertySlug]);

  async function share() {
    try {
      const canNativeShare = typeof navigator.share === "function";

      if (canNativeShare) {
        await navigator.share({
          title: propertyName || document.title,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard?.writeText(window.location.href);
      }

      track("stay_share", {
        slug: propertySlug,
        method: canNativeShare ? "native" : "copy",
      });

      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setShared(false);
    }
  }

  function toggleSaved() {
    const requestedSaved = !saved;
    const stored = propertySlug
      ? setStaySaved(propertySlug, requestedSaved)
      : [];
    const nextSaved = propertySlug
      ? stored.includes(propertySlug)
      : requestedSaved;

    setSaved(nextSaved);

    track("stay_save_toggle", {
      slug: propertySlug || "unknown",
      surface: "stay_detail",
      action: nextSaved ? "saved" : "removed",
    });
  }

  return (
    <div className="title-actions">
      <button type="button" onClick={toggleSaved} aria-pressed={saved}>
        {saved ? "♥ Saved" : "♡ Save"}
      </button>
      <button type="button" onClick={share}>
        {shared ? "✓ Link copied" : "↗ Share"}
      </button>
    </div>
  );
}
