"use client";

import { useState } from "react";

export function SaveStayButton({ propertyName }: { propertyName: string }) {
  const [saved, setSaved] = useState(false);

  return (
    <button
      className={`heart ${saved ? "saved" : ""}`}
      aria-label={
        saved ? `Remove ${propertyName} from saved stays` : `Save ${propertyName}`
      }
      aria-pressed={saved}
      onClick={() => setSaved((value) => !value)}
      type="button"
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
