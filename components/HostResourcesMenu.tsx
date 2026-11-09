"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import styles from "./HostResourcesMenu.module.css";

type Position = { top: number; left: number };

/**
 * An actual floating navigation menu. Portal placement is intentional:
 * home/about video heroes clip their descendants and used to bury this menu.
 */
export function HostResourcesMenu() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();

  const measure = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 274;
    const left = Math.max(12, Math.min(rect.left - 14, window.innerWidth - width - 12));
    const top = rect.bottom + 10;
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [open, measure]);

  useEffect(() => {
    if (open && position) panelRef.current?.querySelector("a")?.focus({ preventScroll: true });
  }, [open, position]);

  return (
    <div className={styles.menu}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) measure();
          setOpen((value) => !value);
        }}
      >
        For hosts <span className={styles.chevron} aria-hidden="true" />
      </button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <nav
              id={panelId}
              ref={panelRef}
              className={styles.panel}
              aria-label="For hosts"
              style={{ top: position.top, left: position.left }}
            >
              <Link href="/hosts" onClick={() => setOpen(false)}>
                <strong>List your property</strong><small>See how hosting works</small>
              </Link>
              <Link href="/property-managers" onClick={() => setOpen(false)}>
                <strong>Property managers</strong><small>Manage multiple stays</small>
              </Link>
              <Link href="/host/properties" onClick={() => setOpen(false)}>
                <strong>Manage listings</strong><small>Your host workspace</small>
              </Link>
              <Link href="/host/calendar" onClick={() => setOpen(false)}>
                <strong>Calendars and sync</strong><small>Connected availability</small>
              </Link>
              <Link href="/host/help" onClick={() => setOpen(false)}>
                <strong>Host support</strong><small>Setup and booking help</small>
              </Link>
            </nav>,
            document.body,
          )
        : null}
    </div>
  );
}
