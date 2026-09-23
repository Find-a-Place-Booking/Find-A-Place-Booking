"use client";

import { useEffect, useRef, useState } from "react";

import { StayMap, type StayMapItem } from "./StayMap";

type Props = {
  stays: StayMapItem[];
  className?: string;
  emptyMessage?: string;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function DeferredStayMap({
  stays,
  className = "",
  emptyMessage,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || nearViewport) return;

    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    if (!nearViewport || ready) return;

    const idleWindow = window as IdleWindow;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const mount = () => setReady(true);

    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(mount, { timeout: 900 });
    } else {
      timeoutId = window.setTimeout(mount, 250);
    }

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
    };
  }, [nearViewport, ready]);

  if (ready) {
    return (
      <StayMap
        stays={stays}
        className={className}
        emptyMessage={emptyMessage}
      />
    );
  }

  return (
    <div
      ref={sentinelRef}
      className={`stay-map ${className}`}
      aria-hidden="true"
    />
  );
}
