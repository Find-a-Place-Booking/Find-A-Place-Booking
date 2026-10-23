"use client";

import { useEffect, useState } from "react";

type Props = {
  className: string;
  src: string;
  poster: string;
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type ConnectionNavigator = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** The hero poster paints first; video becomes an optional enhancement. */
export function DeferredBackgroundVideo({ className, src, poster }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (navigator as ConnectionNavigator).connection;
    const slowNetwork = connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    if (reducedMotion || slowNetwork) return;

    const idleWindow = window as IdleWindow;
    let idleId: number | null = null;
    let timer: number | null = null;
    let observer: IntersectionObserver | null = null;
    let cancelled = false;
    let scheduled = false;
    let visible = true;
    const hero = document.querySelector(".home-hero");

    const start = () => {
      if (!cancelled && visible && document.visibilityState === "visible") setReady(true);
    };
    const schedule = () => {
      if (scheduled || cancelled || !visible) return;
      scheduled = true;
      // Mobile receives a longer poster-first window. No additional video request
      // should compete with the initial content / featured-stay photo.
      const mobile = window.matchMedia("(max-width: 700px)").matches;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (idleWindow.requestIdleCallback) {
          idleId = idleWindow.requestIdleCallback(start, { timeout: 1800 });
        } else {
          start();
        }
      }, mobile ? 1800 : 350);
    };
    const afterLoad = () => schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible" && scheduled) start();
    };

    if (hero && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        visible = entries.some((item) => item.isIntersecting);
        if (visible && document.readyState === "complete") schedule();
      }, { rootMargin: "100px" });
      observer.observe(hero);
    }

    document.addEventListener("visibilitychange", onVisibility);
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", afterLoad);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== null) window.clearTimeout(timer);
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
      observer?.disconnect();
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
      preload="none"
      poster={poster}
      aria-hidden="true"
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
