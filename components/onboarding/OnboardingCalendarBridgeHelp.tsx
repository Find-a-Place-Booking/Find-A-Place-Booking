"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./OnboardingCalendarBridgeHelp.module.css";

type Connection = {
  id: string;
  provider: string;
  label: string;
  syncStatus: string;
  lastSuccessAt: string | null;
  outboundToken: string | null;
};

type ResponseState = {
  ok: boolean;
  ready: boolean;
  propertyName?: string | null;
  connections: Connection[];
};


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

function providerName(value: string) {
  const labels: Record<string, string> = {
    AIRBNB: "Airbnb",
    VRBO: "Vrbo",
    LODGIFY: "Lodgify",
    GUESTY: "Guesty",
    HOSTIFY: "Hostify",
    BOOKING_COM: "Booking.com",
    OWNEREZ: "OwnerRez",
    GOOGLE: "Google Calendar",
    OTHER_ICAL: "the outside calendar",
  };
  return labels[value] || value.replaceAll("_", " ");
}

export function OnboardingCalendarBridgeHelp() {
  const [state, setState] = useState<ResponseState | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          "/api/host/onboarding/calendar-exports",
          {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || cancelled) return;
        setState(payload as ResponseState);
      } catch {}
    };

    void load();
    const timer = window.setInterval(() => void load(), 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const returnFeeds = useMemo(
    () =>
      (state?.connections ?? []).filter(
        (connection) => Boolean(connection.outboundToken),
      ),
    [state],
  );

  async function copyFeed(connection: Connection) {
    if (!connection.outboundToken) return;
    const url = `${window.location.origin}/calendar/${connection.outboundToken}.ics`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!fallbackCopy(url)) {
        throw new Error("Copy unavailable");
      }

      setCopied(connection.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className={styles.bridge}>
      <div className={styles.note}>
        <strong>Keep this setup page open when you go get an iCal link.</strong>
        <span>
          Open Airbnb, Vrbo or your other booking service in a new browser tab,
          copy its private iCal/ICS link, then come back to this Find A Place
          tab. Your onboarding progress stays here.
        </span>
      </div>

      {returnFeeds.length ? (
        <div className={styles.returnBox}>
          <strong>Two-way calendar step</strong>
          <p>
            Find A Place is already receiving availability from the connected
            source. Copy the matching Find A Place return feed below into that
            same service so Find A Place bookings and owner blocks can flow
            back out without echoing that source&apos;s own imported events.
          </p>

          <div className={styles.feedList}>
            {returnFeeds.map((connection) => {
              const provider = providerName(connection.provider);
              const url = connection.outboundToken
                ? `/calendar/${connection.outboundToken}.ics`
                : "";

              return (
                <div className={styles.feed} key={connection.id}>
                  <div>
                    <strong>
                      Return feed for {connection.label || provider}
                    </strong>
                    <span>
                      {provider} · {connection.syncStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                  <code>{url}</code>
                  <button
                    type="button"
                    onClick={() => void copyFeed(connection)}
                  >
                    {copied === connection.id
                      ? "✓ Copied full feed URL"
                      : `Copy Find A Place feed for ${provider}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.pending}>
          <strong>After the first iCal source connects</strong>
          <span>
            Find A Place will create a source-specific return feed automatically
            and show it here. You do not need to hunt for it later in the host
            dashboard.
          </span>
        </div>
      )}
    </div>
  );
}
