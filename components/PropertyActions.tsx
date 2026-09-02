"use client";

import { useState } from "react";

export function PropertyActions() {
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: window.location.href });
      else await navigator.clipboard?.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setShared(false);
    }
  }
  return <div className="title-actions"><button type="button" onClick={() => setSaved((value) => !value)}>{saved ? "♥ Saved" : "♡ Save"}</button><button type="button" onClick={share}>{shared ? "✓ Link copied" : "↗ Share"}</button></div>;
}
