"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";

import {
  isStaySaved,
  setStaySaved,
  subscribeToSavedStays,
} from "@/lib/client/saved-stays";

function fallbackCopy(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export function PropertyActions({
  propertyName = "",
  propertySlug = "",
}: {
  propertyName?: string;
  propertySlug?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!propertySlug) return;

    setSaved(isStaySaved(propertySlug));

    return subscribeToSavedStays((slugs) => {
      setSaved(slugs.includes(propertySlug));
    });
  }, [propertySlug]);

  async function copyLink() {
    const url = window.location.href;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!fallbackCopy(url)) {
        throw new Error("Copy unavailable");
      }

      track("stay_share", {
        slug: propertySlug,
        method: "copy",
      });

      setCopyFailed(false);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setShared(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 2500);
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
      <button
        type="button"
        onClick={copyLink}
        aria-label={`Copy link to ${propertyName || "this stay"}`}
      >
        {shared
          ? "✓ Link copied"
          : copyFailed
            ? "Copy failed — try again"
            : "⧉ Copy link"}
      </button>
    </div>
  );
}
