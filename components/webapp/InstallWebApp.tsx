"use client";

import { useEffect, useId, useState } from "react";
import styles from "@/components/AppInstallLinks.module.css";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  const ios = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || ios.standalone === true;
}

/** A native install prompt where available, otherwise actual browser instructions. */
export function InstallWebApp() {
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [working, setWorking] = useState(false);
  const instructionsId = useId();
  const [appType, setAppType] = useState<"guest" | "host">("guest");

  useEffect(() => {
    setAppType(window.location.pathname.startsWith("/host/mobile/") ? "host" : "guest");
    setInstalled(isStandalone());
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function requestInstall() {
    if (!installPrompt) {
      setShowInstructions((wasShown) => !wasShown);
      return;
    }
    setWorking(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome !== "accepted") setShowInstructions(true);
    } catch {
      setInstallPrompt(null);
      setShowInstructions(true);
    } finally {
      setWorking(false);
    }
  }

  if (installed) return null;
  const name = appType === "host" ? "host" : "guest";
  return (
    <section className={`panel ${styles.installPanel}`} aria-label={`Install Find A Place ${name} app`}>
      <div className={styles.installCopy}>
        <strong>Keep Find A Place on your home screen</strong>
        <p>{name === "host" ? "Open bookings, calendars and guest messages in one tap." : "Find stays, save favorites and manage trips in one tap."} No app store needed.</p>
      </div>
      <button
        type="button"
        className="button dark"
        disabled={working}
        onClick={() => void requestInstall()}
        aria-expanded={showInstructions}
        aria-controls={instructionsId}
      >
        {working ? "Opening install…" : installPrompt ? `Install ${name} app` : "Add to home screen"}
      </button>
      {showInstructions ? (
        <div id={instructionsId} className={styles.installHelp} role="note">
          <strong>How to add the app</strong>
          <p><b>iPhone:</b> Open this page in Safari. Tap the Share button, then Add to Home Screen.</p>
          <p><b>Android:</b> Use Chrome's menu and choose Install app or Add to Home screen.</p>
          <p><b>Computer:</b> Look for Install in your browser's menu or address bar. If the option is unavailable, you can keep using the app in your browser.</p>
        </div>
      ) : null}
    </section>
  );
}
