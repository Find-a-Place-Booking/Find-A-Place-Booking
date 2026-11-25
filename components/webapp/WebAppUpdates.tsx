"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_CHECK_MIN_INTERVAL_MS,
  checkWebAppRelease,
  UPDATE_INTERVAL_MS,
  UPDATE_TIMEOUT_MS,
  WEBAPP_RELEASE,
} from "@/lib/webapp/update";
import styles from "./WebAppUpdates.module.css";

type Status = "idle" | "checking" | "current" | "offline" | "error";

/** A non-blocking update notice. Never reload automatically or clear local data. */
export function WebAppUpdates({ app }: { app: "host" | "guest" }) {
  const [status, setStatus] = useState<Status>("idle");
  const [available, setAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const running = useRef<AbortController | null>(null);
  const active = useRef(false);
  const lastCheck = useRef(0);

  const check = useCallback(async (manual = false) => {
    if (!active.current || running.current) return;
    if (!manual && (document.visibilityState === "hidden" || Date.now() - lastCheck.current < AUTO_CHECK_MIN_INTERVAL_MS)) return;
    if (navigator.onLine === false) {
      if (manual) setStatus("offline");
      return;
    }
    lastCheck.current = Date.now();
    const controller = new AbortController();
    running.current = controller;
    setStatus("checking");
    if (manual) setDismissed(null);
    const timeout = window.setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
    try {
      const result = await checkWebAppRelease(WEBAPP_RELEASE, fetch, controller.signal);
      if (!active.current || running.current !== controller) return;
      if (result.state === "available") {
        setAvailable(result.version);
        setStatus("idle");
      } else {
        setAvailable(null);
        setDismissed(null);
        setConfirm(false);
        setStatus(manual ? "current" : "idle");
      }
    } catch {
      if (active.current && running.current === controller) {
        setStatus(manual ? (navigator.onLine ? "error" : "offline") : "idle");
      }
    } finally {
      window.clearTimeout(timeout);
      if (running.current === controller) running.current = null;
    }
  }, []);

  useEffect(() => {
    active.current = true;
    lastCheck.current = 0;
    const auto = () => { void check(); };
    const onVisible = () => { if (document.visibilityState !== "hidden") auto(); };
    auto();
    const interval = window.setInterval(auto, UPDATE_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", auto);
    window.addEventListener("online", auto);
    window.addEventListener("pageshow", auto);
    return () => {
      active.current = false;
      running.current?.abort();
      running.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", auto);
      window.removeEventListener("online", auto);
      window.removeEventListener("pageshow", auto);
    };
  }, [check]);

  const showNotice = Boolean(available && available !== dismissed);
  const statusText = status === "current" ? "Your app is up to date."
    : status === "offline" ? "You are offline. Reconnect and try again."
    : status === "error" ? "Couldn't check for updates. Please try again."
    : status === "checking" ? "Checking for updates…" : "";

  function reloadAfterConfirmation() {
    if (!available || navigator.onLine === false) {
      setStatus("offline");
      return;
    }
    // Full navigation obtains fresh deployment files; the URL, cookies and
    // local storage remain intact. Never unregister workers or clear caches.
    window.location.reload();
  }

  return (
    <section className={styles.container} aria-label="Find A Place app updates">
      <div className={styles.toolbar}>
        <button type="button" className={styles.link} aria-expanded={details}
          onClick={() => setDetails((value) => !value)}>App updates{available ? " · Available" : ""}</button>
        <button type="button" className={styles.link} disabled={status === "checking"}
          onClick={() => { setDetails(true); void check(true); }}>
          {status === "checking" ? "Checking…" : "Check for updates"}
        </button>
      </div>
      {details ? (
        <div className={styles.details}>
          <p role="status">{statusText || (available ? "A new version is ready." : "Your app checks for new releases automatically while open.")}</p>
          {app === "host" ? <p>New white host icon: Android may refresh it automatically. On iPhone or iPad, remove the old home-screen app and add it again from Safari to change the icon. Your account and saved reservations stay on Find A Place.</p> : null}
          {available && !showNotice ? <button type="button" className={styles.primary} onClick={() => setDismissed(null)}>Show available update</button> : null}
        </div>
      ) : null}
      {showNotice ? (
        <div className={styles.notice} role="region" aria-label="App update available">
          <strong role="status">Find A Place update available</strong>
          <p>{confirm ? "Save your changes and finish any booking or payment before refreshing. Unsaved edits or messages may be lost." : "A new version is ready. Update when you are finished with your current work."}</p>
          {confirm && status === "offline" ? <p role="status">Reconnect to the internet before updating.</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => {
              if (confirm) setConfirm(false);
              else { setDismissed(available); setConfirm(false); }
            }}>{confirm ? "Cancel" : "Later"}</button>
            <button type="button" className={styles.primary} onClick={() => {
              if (confirm) reloadAfterConfirmation();
              else setConfirm(true);
            }}>{confirm ? "I’ve saved — refresh" : "Update now"}</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
