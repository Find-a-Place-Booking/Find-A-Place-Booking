"use client";

import { useEffect, useState } from "react";

type Props = {
  className: string;
  src: string;
  poster: string;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type ConnectionNavigator = Navigator & {
  connection?: {
    saveData?: boolean;
  };
};

export function DeferredBackgroundVideo({ className, src, poster }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const saveData = (navigator as ConnectionNavigator).connection?.saveData;

    if (prefersReducedMotion || saveData) return;

    const idleWindow = window as IdleWindow;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    let removed = false;

    const enable = () => {
      if (!removed) setReady(true);
    };

    const queue = () => {
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(enable, { timeout: 1200 });
      } else {
        timeoutId = window.setTimeout(enable, 450);
      }
    };

    if (document.readyState === "complete") {
      queue();
    } else {
      window.addEventListener("load", queue, { once: true });
    }

    return () => {
      removed = true;
      window.removeEventListener("load", queue);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
    };
  }, []);

  if (!ready) return null;

  return (
    <video
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster={poster}
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
