"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";

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

  return (
    <button
      className={`heart ${saved ? "saved" : ""}`}
      aria-label={
        saved ? `Remove ${propertyName} from saved stays` : `Save ${propertyName}`
      }
      aria-pressed={saved}
      onClick={() => {
        const nextSaved = !saved;
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
